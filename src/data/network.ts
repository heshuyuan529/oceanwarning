/**
 * 晚开预警融合模型定义（newest.md 3.5 节，图3-2 极简概率图）
 *
 * 旧版 14 节点 DAG（8 事件节点 + 5 阶段节点 + 三态 G）与 P(M|G) 桥接表已整体删除。
 * 新版结构：
 *
 *   C（q 的分位区间，观测）→ G（晚开二态：未晚开=0 / 晚开=1）← S（生产付款联合状态，观测）
 *   V 是挂在 G 上的虚拟证据子节点（λ = q/π），不是实体节点
 *
 * 数据口径：
 * - 校准系数为 newest.md 表3-6 / 表3-9 的**实际拟合值**（提前7天用第二轮模型，3/1天用第三轮）
 * - 条件表频数 n(g,s)、n(c,g,s) 为**演示数据**：状态分布手工设计、按表3-5 条件表拟合
 *   订单量配平，分区计数用固定比例 + 最大余数法配平；真实系统由拟合期订单逐单统计
 * - S1–S5 不在贝叶斯网络中推断，仅保留为流程定位与证据组织常量（newest.md 4.1）
 */

import type { Horizon, LogisticCalibration } from '../types'
import {
  compileModel,
  validateModel,
  OTHER_STATE_ID,
  OTHER_STATE_LABEL,
  type CompiledFusionModel,
  type FusionModel,
  type JointStateDef,
  type QuantileBin,
} from '../bn/engine'

// ===== 数据来源说明 =====

export const CALIBRATION_NOTE =
  '校准系数为 newest.md 表3-6/表3-9 实际拟合值；正则系数 0.001，概率裁剪 [1e-7, 1−1e-7]'
export const DEMO_COUNTS_NOTE =
  '演示频数：状态分布手工设计，按表3-5 条件表拟合订单量配平；真实条件表由拟合期订单逐单统计'

// ===== 五状态编码（表3-7）=====

const DONE_OK = '已完成未逾期'
const DONE_LATE = '已完成逾期'
const DUE_MISSING = '已到期未观测'
const NOT_DUE = '未到期未观测'
const PLAN_UNKNOWN = '计划未知'

/**
 * 拟合期实际出现的生产付款联合状态（式3-11，最多 25 种；此处收录 10 种 + OTHER）。
 * ID 中两位字母依次为生产/付款：A 已完成未逾期、B 已完成逾期、C 已到期未观测、
 * D 未到期未观测、E 计划未知。
 */
export const jointStates: JointStateDef[] = [
  { id: 'AA', label: '生产已完成未逾期 + 付款已完成未逾期', production: DONE_OK, payment: DONE_OK },
  { id: 'BA', label: '生产已完成逾期 + 付款已完成未逾期', production: DONE_LATE, payment: DONE_OK },
  { id: 'BB', label: '生产已完成逾期 + 付款已完成逾期', production: DONE_LATE, payment: DONE_LATE },
  { id: 'CA', label: '生产已到期未观测 + 付款已完成未逾期', production: DUE_MISSING, payment: DONE_OK },
  { id: 'CC', label: '生产已到期未观测 + 付款已到期未观测', production: DUE_MISSING, payment: DUE_MISSING },
  { id: 'CD', label: '生产已到期未观测 + 付款未到期未观测', production: DUE_MISSING, payment: NOT_DUE },
  { id: 'DA', label: '生产未到期未观测 + 付款已完成未逾期', production: NOT_DUE, payment: DONE_OK },
  { id: 'DD', label: '生产未到期未观测 + 付款未到期未观测', production: NOT_DUE, payment: NOT_DUE },
  { id: 'AE', label: '生产已完成未逾期 + 付款计划未知', production: DONE_OK, payment: PLAN_UNKNOWN },
  { id: 'EE', label: '生产计划未知 + 付款计划未知', production: PLAN_UNKNOWN, payment: PLAN_UNKNOWN },
  // 拟合期未见组合的兜底桶（3.5.3：条件表仅记录实际出现组合，并增加一个其他状态）
  { id: OTHER_STATE_ID, label: OTHER_STATE_LABEL, production: PLAN_UNKNOWN, payment: PLAN_UNKNOWN },
]

// ===== 演示频数（主分布，口径对齐提前7天条件表拟合量 24,161 单，表3-5）=====

/**
 * 主频数模板：每条向量顺序与 jointStates 一致；[0] = G=0 未晚开，[1] = G=1 晚开。
 * 设计意图（演示）：AA/DD/DA 为保护型组合（晚开占比低），BB/CC/CA/BA 为风险型组合。
 */
const masterCounts: [number[], number[]] = [
  // AA     BA    BB    CA    CC    CD    DA    DD    AE    EE   OTHER
  [12600, 1100, 250,  600,  180,  210, 2600, 4200,  700,  350,  150], // 未晚开合计 22,940
  [  180,  170, 185,  190,  120,   75,   60,   95,   45,   55,   46], // 晚开合计  1,221（5.05%）
]

/** 各提前期条件表拟合订单量（总量来自表3-5）与演示晚开量（≈5%） */
const horizonTargets: Record<Horizon, { fittedOrders: number; late: number; mlModelVersion: string }> = {
  '7天': { fittedOrders: 24161, late: 1221, mlModelVersion: 'LightGBM-R2-h7（演示）' },
  '3天': { fittedOrders: 26040, late: 1364, mlModelVersion: 'LightGBM-R3-h3（演示）' },
  '1天': { fittedOrders: 26452, late: 1362, mlModelVersion: 'LightGBM-R3-h1（演示）' },
}

/** 最大余数法：把整数向量按目标总量配平（各分量之和严格等于 target） */
function scaleToTotal(vec: number[], target: number): number[] {
  const current = vec.reduce((a, b) => a + b, 0)
  const exact = vec.map(v => (v * target) / current)
  const floored = exact.map(Math.floor)
  let remainder = target - floored.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((x, y) => y.frac - x.frac)
  for (const { i } of order) {
    if (remainder <= 0) break
    floored[i] += 1
    remainder -= 1
  }
  return floored
}

// ===== 分位区间（3.5.5：按拟合期 q 的 20/40/60/80 分位点）=====

/**
 * 演示切点（q 尺度）：经第一次校准后 q 多落在 0.02–0.40 区间，
 * 故演示切点为 0.04 / 0.07 / 0.11 / 0.18；真实切点由拟合期分位数计算并随版本保存。
 */
const binCuts = [0.04, 0.07, 0.11, 0.18] as const

/**
 * 各区间演示分配权重（按状态独立配平到总体频数）：
 * 未晚开订单集中在低区间，晚开订单向高区间集中（q 具备排序能力的体现）。
 */
const binWeights: [number[], number[]] = [
  // C1    C2    C3    C4    C5
  [0.30, 0.25, 0.20, 0.15, 0.10], // G=0 未晚开
  [0.05, 0.10, 0.20, 0.30, 0.35], // G=1 晚开
]

/** 按固定权重把一条状态计数分配到 5 个区间（最大余数法，和不变） */
function splitToBins(total: number, weights: readonly number[]): number[] {
  const exact = weights.map(w => total * w)
  const floored = exact.map(Math.floor)
  let remainder = total - floored.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((x, y) => y.frac - x.frac)
  for (const { i } of order) {
    if (remainder <= 0) break
    floored[i] += 1
    remainder -= 1
  }
  return floored
}

/** 构造一个提前期的 5 个分位区间频数 n(c,g,s) */
function buildBins(pooled: [number[], number[]]): QuantileBin[] {
  const nBins = binCuts.length + 1
  const allocG0 = pooled[0].map(n => splitToBins(n, binWeights[0]))
  const allocG1 = pooled[1].map(n => splitToBins(n, binWeights[1]))

  const cuts = [0, ...binCuts, 1]
  return Array.from({ length: nBins }, (_, b) => ({
    id: `C${b + 1}`,
    label: `C${b + 1}（q ∈ [${cuts[b]}, ${cuts[b + 1]}${b === nBins - 1 ? ']' : ')'}）`,
    lower: cuts[b],
    upper: cuts[b + 1],
    counts: [
      allocG0.map(row => row[b]),
      allocG1.map(row => row[b]),
    ] as [number[], number[]],
  }))
}

// ===== 校准系数（newest.md 实际拟合值）=====

/** 第一次校准（式3-7，表3-6）：p_raw → q */
const firstCalibrations: Record<Horizon, LogisticCalibration> = {
  '7天': { slope: 0.583158, intercept: -0.776995, fittedCount: 30770 },
  '3天': { slope: 0.498759, intercept: -0.783312, fittedCount: 31711 },
  '1天': { slope: 0.551532, intercept: -0.707721, fittedCount: 31966 },
}

/** 第二次校准（式3-10，表3-9）：r → p*；每提前期 × 每方法各自一组 */
const secondCalibrations: Record<
  Horizon,
  { conditional: LogisticCalibration; pooled: LogisticCalibration; standalone: LogisticCalibration }
> = {
  '7天': {
    standalone: { slope: 1.102037, intercept: -0.470482, fittedCount: 9918 },
    conditional: { slope: 0.609656, intercept: -1.406314, fittedCount: 9918 },
    pooled: { slope: 0.887520, intercept: -0.959661, fittedCount: 9918 },
  },
  '3天': {
    standalone: { slope: 1.326866, intercept: -0.064606, fittedCount: 10907 },
    conditional: { slope: 0.814227, intercept: -1.028505, fittedCount: 10907 },
    pooled: { slope: 1.060122, intercept: -0.655236, fittedCount: 10907 },
  },
  '1天': {
    standalone: { slope: 1.333462, intercept: 0.031148, fittedCount: 11176 },
    conditional: { slope: 0.902453, intercept: -0.763927, fittedCount: 11176 },
    pooled: { slope: 1.014233, intercept: -0.604820, fittedCount: 11176 },
  },
}

// ===== 模型装配 =====

export const horizons: Horizon[] = ['7天', '3天', '1天']

function buildRawModel(h: Horizon): FusionModel {
  const target = horizonTargets[h]
  const pooledCounts: [number[], number[]] = [
    scaleToTotal(masterCounts[0], target.fittedOrders - target.late),
    scaleToTotal(masterCounts[1], target.late),
  ]
  return {
    horizon: h,
    mlModelVersion: target.mlModelVersion,
    conditionTableVersion: `CT-demo-${h}-v1`,
    virtualEvidenceVersion: 'VE-demo-v1',
    states: jointStates,
    pooledCounts,
    bins: buildBins(pooledCounts),
    firstCalibration: firstCalibrations[h],
    secondCalibration: {
      conditional: secondCalibrations[h].conditional,
      pooled: secondCalibrations[h].pooled,
    },
    standaloneSecondCalibration: secondCalibrations[h].standalone,
    fittedOrders: target.fittedOrders,
  }
}

/** 三个提前期的原始模型（频数 + 版本 + 校准系数），W3 条件频数表治理页直接读取 */
export const fusionModelRaw: Record<Horizon, FusionModel> = {
  '7天': buildRawModel('7天'),
  '3天': buildRawModel('3天'),
  '1天': buildRawModel('1天'),
}

/** 三个提前期的编译模型（已完成 0.5 平滑 / 50 收缩 / 区间先验估计），推断直接使用 */
export const fusionModels: Record<Horizon, CompiledFusionModel> = {
  '7天': compileModel(fusionModelRaw['7天']),
  '3天': compileModel(fusionModelRaw['3天']),
  '1天': compileModel(fusionModelRaw['1天']),
}

export function getFusionModel(horizon: Horizon): CompiledFusionModel {
  return fusionModels[horizon]
}

// 模块加载即校验：三张条件表行和、先验和、OTHER 位置、校准约束必须全部通过
for (const h of horizons) {
  const result = validateModel(fusionModelRaw[h])
  if (!result.ok) {
    throw new Error(`[network.ts] ${h} 融合模型校验失败：${result.errors.join('；')}`)
  }
}

// ===== 图3-2 概率图元数据（W3 DAG 可视化用）=====

export type FusionNodeRole = 'observed' | 'target' | 'virtual'

export interface FusionGraphNode {
  id: 'C' | 'S' | 'G' | 'V'
  label: string
  role: FusionNodeRole
  desc: string
}

export interface FusionGraphEdge {
  from: FusionGraphNode['id']
  to: FusionGraphNode['id']
  desc: string
  /** V→G 为虚拟证据连接（虚拟子节点），样式与实体边区分 */
  virtual?: boolean
}

export const fusionGraph: { nodes: FusionGraphNode[]; edges: FusionGraphEdge[] } = {
  nodes: [
    {
      id: 'C',
      label: 'C 概率分位区间',
      role: 'observed',
      desc: '按拟合期 q 的 20/40/60/80 分位点划分（相同分位合并），观测节点',
    },
    {
      id: 'S',
      label: 'S 生产付款联合状态',
      role: 'observed',
      desc: '生产、付款五状态合并为联合状态（最多 25 种 + 其他），快照可见，观测节点',
    },
    {
      id: 'G',
      label: 'G 晚开（二态）',
      role: 'target',
      desc: 'G=1 晚开（ATD−最初ETD 严格超过 24 小时），G=0 未晚开；订单层面最终目标',
    },
    {
      id: 'V',
      label: 'V ML 虚拟证据',
      role: 'virtual',
      desc: 'q 经 λ=q/π 转成似然权重的虚拟子节点，非实体证据节点',
    },
  ],
  edges: [
    {
      from: 'C',
      to: 'G',
      desc: '分区决定类别先验 π(c,g) 与分区条件表 θ(c,g,s)',
    },
    {
      from: 'S',
      to: 'G',
      desc: '联合状态的条件似然 P(S|G,C) 形成似然比；箭头是分解关系，不表示晚开造成生产付款状态',
    },
    {
      from: 'V',
      to: 'G',
      virtual: true,
      desc: '虚拟证据 λ1=q/π1、λ0=(1−q)/π0，抵消网络先验的重复叠加',
    },
  ],
}

// ===== S1–S5 流程定位常量（不在 BN 中推断，newest.md 4.1）=====

export type ProcessStageId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export interface ProcessStage {
  id: ProcessStageId
  label: string
}

export const processStages: ProcessStage[] = [
  { id: 'S1', label: '订单准备' },
  { id: 'S2', label: '订舱资源' },
  { id: 'S3', label: '拖车背箱' },
  { id: 'S4', label: '报关集港' },
  { id: 'S5', label: '离港出运' },
]

export const processStageLabels: Record<ProcessStageId, string> = {
  S1: '订单准备',
  S2: '订舱资源',
  S3: '拖车背箱',
  S4: '报关集港',
  S5: '离港出运',
}
