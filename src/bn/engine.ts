/**
 * 晚开预警：机器学习 + 贝叶斯虚拟证据融合引擎
 *
 * 依据 newest.md 3.5 节（图3-2 极简概率图）：
 *
 *   C（ML 校准概率 q 的分位区间，观测）→ G（晚开二态）← S（生产付款联合状态，观测）
 *   V（q 对应的虚拟证据，挂在 G 上的虚拟子节点，不是实体节点）
 *
 * 与旧版 14 节点枚举推断不同，本引擎为闭式后验（式3-15 ~ 式3-17）：
 *
 *   第一次校准（式3-7）：q = σ(a·logit(p_raw) + b)
 *   虚拟证据（式3-15）  ：λ1 = q/π1，λ0 = (1−q)/π0
 *   似然比（式3-17）    ：LR = P(S|G=1,C) / P(S|G=0,C)
 *   闭式后验（式3-17）  ：r = q·LR / (1 − q + q·LR)
 *   第二次校准（式3-10）：p* = σ(A·logit(r) + B)
 *
 * 条件表由历史频数估计：
 *   总体表（式3-12）：θ(g,s)    = (n(g,s) + 0.5) / (n(g) + 0.5K)
 *   分区表（式3-13）：θ(c,g,s)  = (n(c,g,s) + 50·θ(g,s)) / (n(c,g) + 50)
 *   区间先验（式3-14）：π(c,g)  = (n(c,g) + 1) / (n(c) + 2)
 *
 * 纯 TypeScript，无第三方依赖。
 */

import type {
  FusionMethod,
  Horizon,
  JointState,
  LogisticCalibration,
  MilestoneState,
} from '../types'

// ===== 常量（newest.md 3.5.9 固定参数）=====

/** 概率裁剪上下界 1e-7（保证 logit 有定义） */
export const PROB_EPS = 1e-7
/** 式3-12：总体条件表每状态对称平滑 0.5（Laplace 对称平滑） */
export const POOLED_SMOOTHING = 0.5
/** 式3-13：分区向总体收缩的强度 50（预先固定，非专家评分） */
export const LOCAL_SHRINKAGE = 50
/** 式3-14：区间类别先验的每类伪计数 1（Beta(1,1)） */
export const PRIOR_PSEUDOCOUNT = 1
/** 校准斜率 / 截距约束（3.5.1 与 3.5.9） */
export const SLOPE_BOUNDS: readonly [number, number] = [0.001, 10]
export const INTERCEPT_BOUNDS: readonly [number, number] = [-20, 20]

/** G 二态标签（索引即 GState：0=未晚开，1=晚开） */
export const G_STATE_LABELS = ['未晚开', '晚开'] as const

/** 生产 / 付款五状态（表3-7 固定顺序） */
export const MILESTONE_STATES: readonly MilestoneState[] = [
  '已完成未逾期',
  '已完成逾期',
  '已到期未观测',
  '未到期未观测',
  '计划未知',
]

/** 融合方法展示名 */
export const METHOD_LABELS: Record<FusionMethod, string> = {
  conditional: '条件融合',
  pooled: '不分层融合',
}

// ===== 模型数据结构 =====

/** 联合状态定义（条件表的一列）；末位固定为「其他」，收纳拟合期未见组合 */
export interface JointStateDef extends JointState {
  id: string
  label: string
}

/** 未见组合的兜底状态 ID（3.5.3：条件表增加一个"其他"状态） */
export const OTHER_STATE_ID = 'OTHER'
export const OTHER_STATE_LABEL = '其他未见组合'

/**
 * ML 校准概率 q 的分位区间 C。
 * 按拟合期 q 的 20%/40%/60%/80% 分位点划分，相同分位合并后区间数可能少于 5。
 * 区间为 [lower, upper)；最后一个区间上界闭到 1。
 */
export interface QuantileBin {
  id: string
  label: string
  lower: number
  upper: number
  /**
   * 分区原始订单计数 n(c,g,s)，两条向量长度均为 K（状态表大小，含"其他"）。
   * counts[0] = G=0 未晚开各状态计数；counts[1] = G=1 晚开各状态计数。
   */
  counts: [number[], number[]]
  /** 该区间对应的拟合航次数（可追溯，3.5.5），演示数据可省略 */
  voyageCount?: number
}

/**
 * 一个提前期的融合模型原始参数（频数 + 校准系数 + 版本）。
 * 三个提前期各自一份（3.2.2：三个提前期分别训练和推断）。
 */
export interface FusionModel {
  horizon: Horizon
  /** LightGBM 模型版本（提前7天为第二轮 R2，3天/1天为第三轮 R3） */
  mlModelVersion: string
  /** 贝叶斯条件表版本（含分区、先验、频数） */
  conditionTableVersion: string
  /** 虚拟证据接口版本（风险卡字段"桥接版本"；新版无 P(M|G) 桥接表） */
  virtualEvidenceVersion: string
  /** 实际出现的联合状态；末位必须是 OTHER_STATE_ID */
  states: JointStateDef[]
  /**
   * 总体原始计数 n(g,s)（式3-12），不分层融合使用。
   * pooledCounts[0] = G=0 计数向量，pooledCounts[1] = G=1 计数向量。
   */
  pooledCounts: [number[], number[]]
  /** q 分位区间（按分位点升序、首尾覆盖 [0,1]） */
  bins: QuantileBin[]
  /** 第一次校准 p_raw → q（式3-7，表3-6 实际系数） */
  firstCalibration: LogisticCalibration
  /** 第二次校准 r → p*（式3-10，表3-9）；两种融合结构各自一组，避免只修正融合模型 */
  secondCalibration: Record<FusionMethod, LogisticCalibration>
  /** 对照：同接口独立 ML 的第二次校准（式3-10 中 r 替换为 q） */
  standaloneSecondCalibration: LogisticCalibration
  /** 条件表拟合订单数（表3-5） */
  fittedOrders: number
}

/** 编译后的分位区间：原始频数 + 估计出的分区条件表与先验 */
export interface CompiledBin extends QuantileBin {
  /** 分区条件概率 θ(c,g,s)（式3-13，含局部收缩） */
  theta: [number[], number[]]
  /** 区间类别先验 [π(c,0), π(c,1)]（式3-14） */
  pi: [number, number]
  /** 区间订单总数 n(c) */
  total: number
}

/** 编译后的融合模型：在原始频数上完成全部条件概率估计，推断时直接读取 */
export interface CompiledFusionModel {
  raw: FusionModel
  /** 状态表大小 K（含"其他"） */
  K: number
  stateIndex: Map<string, number>
  /** 总体条件概率 θ(g,s)（式3-12） */
  thetaPooled: [number[], number[]]
  bins: CompiledBin[]
}

// ===== 标量数学 =====

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

/** 概率裁剪到 [1e-7, 1−1e-7]（3.5.1：拟合与推断前统一裁剪） */
export function clipProb(p: number): number {
  if (!Number.isFinite(p)) return PROB_EPS
  return Math.min(1 - PROB_EPS, Math.max(PROB_EPS, p))
}

export function logit(p: number): number {
  const c = clipProb(p)
  return Math.log(c / (1 - c))
}

/** 双参数正斜率逻辑校准（式3-7 / 式3-10 同一形式） */
export function calibrate(p: number, params: LogisticCalibration): number {
  return sigmoid(params.slope * logit(p) + params.intercept)
}

// ===== 频数估计（式3-12 ~ 式3-14）=====

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * 总体条件频数表（式3-12）：
 * θ(g,s) = (n(g,s) + 0.5) / (n(g) + 0.5K)
 * 0.5 对称平滑保证未观测组合仍有非零概率，推断不会被单个零计数完全排除。
 */
export function estimatePooledTheta(
  counts: [number[], number[]],
  K: number
): [number[], number[]] {
  return [0, 1].map(g => {
    const ng = sum(counts[g])
    const denom = ng + POOLED_SMOOTHING * K
    return counts[g].map(n => (n + POOLED_SMOOTHING) / denom)
  }) as [number[], number[]]
}

/**
 * 分区条件频数表（式3-13）：
 * θ(c,g,s) = (n(c,g,s) + 50·θ(g,s)) / (n(c,g) + 50)
 * 样本丰富时局部计数主导；样本稀少时向同一类别的总体分布收缩。
 */
export function estimateBinTheta(
  binCounts: [number[], number[]],
  thetaPooled: [number[], number[]],
  K: number
): [number[], number[]] {
  return [0, 1].map(g => {
    const ncg = sum(binCounts[g])
    const denom = ncg + LOCAL_SHRINKAGE
    return binCounts[g].map(
      (n, s) => (n + LOCAL_SHRINKAGE * thetaPooled[g][s]) / denom
    )
  }) as [number[], number[]]
}

/** 区间类别先验（式3-14）：π(c,g) = (n(c,g) + 1) / (n(c) + 2) */
export function estimateBinPriors(binCounts: [number[], number[]]): [number, number] {
  const n0 = sum(binCounts[0])
  const n1 = sum(binCounts[1])
  const denom = n0 + n1 + 2 * PRIOR_PSEUDOCOUNT
  return [
    (n0 + PRIOR_PSEUDOCOUNT) / denom,
    (n1 + PRIOR_PSEUDOCOUNT) / denom,
  ]
}

/** 联合状态键（生产/付款组合的内部索引键） */
export function jointStateKey(state: JointState): string {
  return `${state.production}|${state.payment}`
}

/**
 * 编译模型：校验并在原始频数上完成 θ / π 估计。
 * 编译一次，推断阶段反复读取，不再重复统计表。
 */
export function compileModel(raw: FusionModel): CompiledFusionModel {
  const K = raw.states.length
  const stateIndex = new Map<string, number>()
  // OTHER 是未见组合兜底桶，不对应真实五状态组合，不参与联合键索引
  raw.states.forEach((s, i) => {
    if (s.id !== OTHER_STATE_ID) stateIndex.set(jointStateKey(s), i)
  })

  const thetaPooled = estimatePooledTheta(raw.pooledCounts, K)
  const bins: CompiledBin[] = raw.bins.map(b => ({
    ...b,
    theta: estimateBinTheta(b.counts, thetaPooled, K),
    pi: estimateBinPriors(b.counts),
    total: sum(b.counts[0]) + sum(b.counts[1]),
  }))

  return { raw, K, stateIndex, thetaPooled, bins }
}

// ===== 推断（式3-15 ~ 式3-17）=====

/** 定位 q 所属分位区间 C（[lower, upper)，最后一个区间上闭） */
export function findBin(model: CompiledFusionModel, q: number): CompiledBin {
  const bins = model.bins
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]
    const upperOk = i === bins.length - 1 ? q <= b.upper : q < b.upper
    if (q >= b.lower && upperOk) return b
  }
  throw new Error(`q=${q} 落在任何分位区间之外，区间切点配置错误`)
}

/** 联合状态定位；拟合期未见组合归入"其他"状态（3.5.3）。OTHER 纯按 ID 定位，不与真实组合争用键 */
export function findStateIndex(
  model: CompiledFusionModel,
  state: JointState
): { index: number; isOther: boolean } {
  const known = model.stateIndex.get(jointStateKey(state))
  if (known !== undefined) return { index: known, isOther: false }
  const otherIdx = model.raw.states.findIndex(s => s.id === OTHER_STATE_ID)
  if (otherIdx < 0) throw new Error('条件表缺少"其他"状态')
  return { index: otherIdx, isOther: true }
}

/**
 * 虚拟证据权重（式3-15）：
 * λ1 = q/π1，λ0 = (1−q)/π0
 * 返回顺序为 [λ0, λ1]。先除以网络先验，避免 q 与 BN 先验被重复叠加；
 * λ 是似然权重，不要求两项之和为 1，共同缩放不改变后验。
 */
export function virtualEvidenceWeights(
  q: number,
  pi: [number, number]
): [number, number] {
  return [(1 - q) / pi[0], q / pi[1]]
}

/** 状态似然比 LR = P(S|G=1,C) / P(S|G=0,C)（式3-17） */
export function likelihoodRatio(theta1s: number, theta0s: number): number {
  return theta1s / theta0s
}

/**
 * 闭式后验（式3-17）：
 * r = q·LR / (1 − q + q·LR)
 * LR>1 该状态增加晚开相对支持；LR<1 降低；LR=1 不改变 q。
 * 删除业务状态证据（两个类别业务似然均取 1，即 LR=1）时严格回到 q。
 */
export function fuse(q: number, LR: number): number {
  const supported = q * LR
  return supported / (1 - q + supported)
}

/** 单订单评分输入 */
export interface ScoreInput {
  /** LightGBM 原始概率 p_raw（式3-5） */
  pRaw: number
  /** 快照时点可见的生产付款联合状态 S */
  state: JointState
  /** 融合结构，默认不分层融合（newest.md 历史评价中表现较优的结构） */
  method?: FusionMethod
}

/** 单订单评分的完整推断轨迹（风险卡解释层 3.8.3 逐值可展示） */
export interface ScoreTrace {
  horizon: Horizon
  method: FusionMethod
  methodLabel: string
  pRaw: number
  /** 第一次校准后进入贝叶斯的概率 */
  q: number
  binId: string
  binLabel: string
  stateId: string
  stateLabel: string
  /** true = 拟合期未见组合，按"其他"状态处理 */
  isOtherState: boolean
  /** 区间类别先验 [π0, π1] */
  pi: [number, number]
  /** 虚拟证据权重 [λ0, λ1] */
  lambda: [number, number]
  /** 所采用条件表在当前状态下的 [P(S|G=0,·), P(S|G=1,·)] */
  theta: [number, number]
  /** 状态似然比 */
  LR: number
  /** 融合原始后验（未经第二次校准） */
  r: number
  /** 最终校准概率 p*（式3-10） */
  pStar: number
  /** 版本元数据（风险卡"总风险"区域） */
  versions: {
    mlModel: string
    conditionTable: string
    virtualEvidence: string
  }
}

/**
 * 单订单融合推断（newest.md 3.8.2 步骤的计算实现）：
 * p_raw →（第一次校准）→ q → 定位 C/S → 读 π 与条件概率 → λ、LR → r →（第二次校准）→ p*
 */
export function scoreOrder(
  model: CompiledFusionModel,
  input: ScoreInput
): ScoreTrace {
  const method: FusionMethod = input.method ?? 'pooled'

  // 第一次校准：ML 分数 → 贝叶斯输入尺度
  const q = calibrate(input.pRaw, model.raw.firstCalibration)

  // 定位分区 C 与联合状态 S
  const bin = findBin(model, q)
  const { index: sIdx, isOther } = findStateIndex(model, input.state)

  // 虚拟证据（先验抵消）
  const lambda = virtualEvidenceWeights(q, bin.pi)

  // 条件似然：条件融合用分区表，不分层融合用总体表（3.5.8）
  const table = method === 'conditional' ? bin.theta : model.thetaPooled
  const theta0s = table[0][sIdx]
  const theta1s = table[1][sIdx]
  const LR = likelihoodRatio(theta1s, theta0s)

  // 闭式后验 + 第二次校准
  const r = fuse(q, LR)
  const pStar = calibrate(r, model.raw.secondCalibration[method])

  const stateDef = model.raw.states[sIdx]
  return {
    horizon: model.raw.horizon,
    method,
    methodLabel: METHOD_LABELS[method],
    pRaw: input.pRaw,
    q,
    binId: bin.id,
    binLabel: bin.label,
    stateId: stateDef.id,
    stateLabel: stateDef.label,
    isOtherState: isOther,
    pi: [...bin.pi] as [number, number],
    lambda,
    theta: [theta0s, theta1s],
    LR,
    r,
    pStar,
    versions: {
      mlModel: model.raw.mlModelVersion,
      conditionTable: model.raw.conditionTableVersion,
      virtualEvidence: model.raw.virtualEvidenceVersion,
    },
  }
}

/** 同接口独立 ML 对照：不经业务状态融合，q 直接进入第二次校准（3.5.2） */
export function scoreStandaloneML(
  model: CompiledFusionModel,
  pRaw: number
): { q: number; pStar: number } {
  const q = calibrate(pRaw, model.raw.firstCalibration)
  return { q, pStar: calibrate(q, model.raw.standaloneSecondCalibration) }
}

/**
 * 措施情景对比（风险卡⑤）：新版干预对象是生产 / 付款状态而非事件节点。
 * 例如推动"生产已到期未观测"补录为"已完成未逾期"，S 改变后重算 r 与 p*。
 */
export interface StateInterventionResult {
  baseline: ScoreTrace
  intervened: ScoreTrace
  /** 原始后验变化（intervened − baseline） */
  rChange: number
  /** 最终概率变化（intervened − baseline） */
  pStarChange: number
}

export function compareStateIntervention(
  model: CompiledFusionModel,
  input: ScoreInput,
  alternative: JointState
): StateInterventionResult {
  const baseline = scoreOrder(model, input)
  const intervened = scoreOrder(model, { ...input, state: alternative })
  return {
    baseline,
    intervened,
    rChange: intervened.r - baseline.r,
    pStarChange: intervened.pStar - baseline.pStar,
  }
}

// ===== 校验（对应 3.8.4 数值核验）=====

const CHECK_EPS = 1e-9

/**
 * 模型结构与频数校验：
 * 状态/计数维度、非负、OTHER 末位、区间切点单调覆盖 [0,1]、
 * 校准斜率正且在约束内、条件表每行之和为 1、区间先验之和为 1。
 */
export function validateModel(raw: FusionModel): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const K = raw.states.length

  if (K < 2) errors.push('状态表至少需要 1 个观测状态 + 其他状态')

  // 状态定义（OTHER 为兜底桶，不参与真实组合的重复校验）
  const keys = new Set<string>()
  raw.states.forEach((s, i) => {
    if (s.id === OTHER_STATE_ID) {
      if (i !== K - 1) errors.push(`"其他"状态 ${OTHER_STATE_ID} 必须位于状态表末位`)
      return
    }
    const key = jointStateKey(s)
    if (keys.has(key)) errors.push(`联合状态重复：${key}`)
    keys.add(key)
  })
  if (raw.states[K - 1]?.id !== OTHER_STATE_ID)
    errors.push(`状态表末位必须是 ${OTHER_STATE_ID}（未见组合兜底）`)

  // 计数维度与非负
  const checkCounts = (label: string, c: [number[], number[]]) => {
    for (let g = 0; g < 2; g++) {
      if (c[g].length !== K)
        errors.push(`${label}：G=${g} 计数长度=${c[g].length}，预期 K=${K}`)
      if (c[g].some(n => !Number.isFinite(n) || n < 0))
        errors.push(`${label}：G=${g} 存在负数或非有限计数`)
      if (sum(c[g]) <= 0) errors.push(`${label}：G=${g} 计数合计必须为正`)
    }
  }
  checkCounts('总体计数 pooledCounts', raw.pooledCounts)
  for (const b of raw.bins) checkCounts(`区间 ${b.id} counts`, b.counts)

  // 分区切点
  if (raw.bins.length === 0) {
    errors.push('至少需要 1 个分位区间')
  } else {
    if (Math.abs(raw.bins[0].lower) > CHECK_EPS)
      errors.push('首个分位区间下界必须为 0')
    if (Math.abs(raw.bins[raw.bins.length - 1].upper - 1) > CHECK_EPS)
      errors.push('末个分位区间上界必须为 1')
    for (let i = 0; i < raw.bins.length; i++) {
      const b = raw.bins[i]
      if (!(b.lower < b.upper)) errors.push(`区间 ${b.id} 下界必须小于上界`)
      if (i > 0 && Math.abs(b.lower - raw.bins[i - 1].upper) > CHECK_EPS)
        errors.push(`区间 ${b.id} 与前一区间不连续`)
    }
  }

  // 校准参数
  const checkCalibration = (label: string, c: LogisticCalibration) => {
    if (!(c.slope >= SLOPE_BOUNDS[0] && c.slope <= SLOPE_BOUNDS[1]))
      errors.push(`${label}：斜率 ${c.slope} 超出 [0.001, 10]`)
    if (!(c.intercept >= INTERCEPT_BOUNDS[0] && c.intercept <= INTERCEPT_BOUNDS[1]))
      errors.push(`${label}：截距 ${c.intercept} 超出 [-20, 20]`)
    if (c.fittedCount <= 0) errors.push(`${label}：拟合订单数必须为正`)
  }
  checkCalibration('第一次校准', raw.firstCalibration)
  checkCalibration('第二次校准(条件融合)', raw.secondCalibration.conditional)
  checkCalibration('第二次校准(不分层融合)', raw.secondCalibration.pooled)
  checkCalibration('对照独立ML第二次校准', raw.standaloneSecondCalibration)

  // 编译后概率核验：条件表每行之和为 1、先验之和为 1、概率严格在 (0,1)
  if (errors.length === 0) {
    const compiled = compileModel(raw)
    const checkRows = (
      label: string,
      rows: [number[], number[]]
    ) => {
      for (let g = 0; g < 2; g++) {
        const row = rows[g]
        const s = sum(row)
        if (Math.abs(s - 1) > 1e-6)
          errors.push(`${label}：G=${g} 行和=${s.toFixed(8)} ≠ 1`)
        if (row.some(p => p <= 0 || p >= 1))
          errors.push(`${label}：G=${g} 存在 0 或 1 概率（平滑失效）`)
      }
    }
    checkRows('总体条件表 θ(g,s)', compiled.thetaPooled)
    for (const b of compiled.bins) {
      checkRows(`分区条件表 θ(c=${b.id},g,s)`, b.theta)
      const piSum = b.pi[0] + b.pi[1]
      if (Math.abs(piSum - 1) > 1e-6)
        errors.push(`区间 ${b.id} 先验和=${piSum.toFixed(8)} ≠ 1`)
    }
  }

  return { ok: errors.length === 0, errors }
}

// ===== 自检 =====

/**
 * 引擎自检：用 2 区间 × 3 状态的最小模型验证闭式推断的关键代数性质。
 * 对应 newest.md 3.8.4：行和为 1、删除业务状态返回输入概率、未见组合非零。
 */
export function selfTest(): {
  passed: boolean
  checks: { name: string; passed: boolean; detail: string }[]
} {
  const checks: { name: string; passed: boolean; detail: string }[] = []
  const push = (name: string, passed: boolean, detail: string) =>
    checks.push({ name, passed, detail })

  // 状态：SAFE（生产付款均按时完成）/ RISK（双双到期未观测）/ OTHER
  const states: JointStateDef[] = [
    {
      id: 'AA',
      label: '生产已完成未逾期+付款已完成未逾期',
      production: '已完成未逾期',
      payment: '已完成未逾期',
    },
    {
      id: 'CC',
      label: '生产已到期未观测+付款已到期未观测',
      production: '已到期未观测',
      payment: '已到期未观测',
    },
    { id: OTHER_STATE_ID, label: OTHER_STATE_LABEL, production: '计划未知', payment: '计划未知' },
  ]

  // 总体计数：G=0 合计 995，G=1 合计 95（K=3）
  const pooledCounts: [number[], number[]] = [
    [800, 100, 95],
    [20, 60, 15],
  ]
  // 两个区间计数与总体严格合计一致
  // C1 低 q 区间（G=0 560 / G=1 30），C2 高 q 区间（G=0 435 / G=1 65）
  const bins: QuantileBin[] = [
    {
      id: 'C1',
      label: 'C1（演示低区间）',
      lower: 0,
      upper: 0.1,
      counts: [
        [500, 30, 30],
        [15, 10, 5],
      ],
    },
    {
      id: 'C2',
      label: 'C2（演示高区间）',
      upper: 1,
      lower: 0.1,
      counts: [
        [300, 70, 65],
        [5, 50, 10],
      ],
    },
  ]
  const identity: LogisticCalibration = { slope: 1, intercept: 0, fittedCount: 100 }
  const raw: FusionModel = {
    horizon: '7天',
    mlModelVersion: 'selftest-ml',
    conditionTableVersion: 'selftest-ct',
    virtualEvidenceVersion: 'selftest-ve',
    states,
    pooledCounts,
    bins,
    firstCalibration: identity,
    secondCalibration: { conditional: identity, pooled: identity },
    standaloneSecondCalibration: identity,
    fittedOrders: 1090,
  }

  // 1. 结构 + 行和 + 先验校验
  const val = validateModel(raw)
  push('结构/行和/先验校验', val.ok, val.ok ? '全部通过' : val.errors.join('；'))

  const model = compileModel(raw)

  // 2. 虚拟证据先验抵消：π·λ 归一化后严格等于 q（式3-15/3-16）
  const q0 = 0.12
  const bin2 = findBin(model, q0)
  const [lam0, lam1] = virtualEvidenceWeights(q0, bin2.pi)
  const implied = (bin2.pi[1] * lam1) / (bin2.pi[0] * lam0 + bin2.pi[1] * lam1)
  push(
    '虚拟证据先验抵消',
    Math.abs(implied - q0) < 1e-9,
    `π1λ1/(π0λ0+π1λ1)=${implied.toFixed(10)}，q=${q0}`
  )

  // 3. 删除业务证据（LR=1）时 r 严格回到 q（3.5.7 已完成全订单数值核验的性质）
  const rNoEvidence = fuse(q0, 1)
  push(
    '删除业务证据回到 q',
    Math.abs(rNoEvidence - q0) < 1e-12,
    `fuse(${q0}, LR=1)=${rNoEvidence.toFixed(12)}`
  )

  // 4. LR 方向：RISK 状态抬升后验，SAFE 状态压低后验（高区间 C2，条件融合）
  const baseInput: ScoreInput = {
    pRaw: q0,
    state: { production: '已到期未观测', payment: '已到期未观测' },
    method: 'conditional',
  }
  const riskTrace = scoreOrder(model, baseInput)
  const safeTrace = scoreOrder(model, {
    ...baseInput,
    state: { production: '已完成未逾期', payment: '已完成未逾期' },
  })
  push(
    '风险状态 LR>1 且 r>q',
    riskTrace.LR > 1 && riskTrace.r > q0,
    `RISK: LR=${riskTrace.LR.toFixed(3)}，q=${q0} → r=${riskTrace.r.toFixed(4)}`
  )
  push(
    '安全状态 LR<1 且 r<q',
    safeTrace.LR < 1 && safeTrace.r < q0,
    `SAFE: LR=${safeTrace.LR.toFixed(3)}，q=${q0} → r=${safeTrace.r.toFixed(4)}`
  )

  // 5. 未见组合归入 OTHER，平滑后概率严格非零且推断有限
  const otherTrace = scoreOrder(model, {
    ...baseInput,
    state: { production: '已完成逾期', payment: '计划未知' }, // 不在演示状态表中
  })
  push(
    '未见组合→OTHER 且非零',
    otherTrace.isOtherState &&
      otherTrace.stateId === OTHER_STATE_ID &&
      Number.isFinite(otherTrace.r) &&
      otherTrace.theta[0] > 0 &&
      otherTrace.theta[1] > 0,
    `state=${otherTrace.stateId}，θ0=${otherTrace.theta[0].toExponential(2)}，r=${otherTrace.r.toFixed(4)}`
  )

  // 6. 不分层融合可运行，且与条件融合取不同似然（总体表 vs 分区表）
  const pooledTrace = scoreOrder(model, { ...baseInput, method: 'pooled' })
  push(
    '不分层融合可运行',
    pooledTrace.method === 'pooled' &&
      Math.abs(pooledTrace.LR - riskTrace.LR) > 1e-12 &&
      pooledTrace.LR > 1,
    `pooled LR=${pooledTrace.LR.toFixed(3)}，conditional LR=${riskTrace.LR.toFixed(3)}`
  )

  // 7. 第二次校准为恒等映射时 p*=r；独立 ML 对照 p*=q
  push(
    '第二次校准/独立ML对照',
    Math.abs(riskTrace.pStar - riskTrace.r) < 1e-12 &&
      Math.abs(scoreStandaloneML(model, q0).pStar - q0) < 1e-12,
    `p*=${riskTrace.pStar.toFixed(10)}，standalone p*=${scoreStandaloneML(model, q0).pStar.toFixed(10)}`
  )

  // 8. 状态干预：把双双到期未观测补录为双双按时完成，r 与 p* 应下降
  const intervention = compareStateIntervention(
    model,
    baseInput,
    { production: '已完成未逾期', payment: '已完成未逾期' }
  )
  push(
    '状态干预降低晚开概率',
    intervention.rChange < 0 && intervention.pStarChange < 0,
    `r: ${riskTrace.r.toFixed(4)} → ${intervention.intervened.r.toFixed(4)}（Δ=${intervention.rChange.toFixed(4)}）`
  )

  // 9. 概率裁剪与校准单调性（真实形态：a<1、b<0 的正斜率映射）
  const realish: LogisticCalibration = { slope: 0.583158, intercept: -0.776995, fittedCount: 30770 }
  const c0 = calibrate(0, realish)
  const c1 = calibrate(1, realish)
  const cLow = calibrate(0.05, realish)
  const cHigh = calibrate(0.5, realish)
  push(
    '概率裁剪与校准单调',
    Number.isFinite(c0) &&
      Number.isFinite(c1) &&
      cHigh > cLow &&
      c0 < c1,
    `calibrate(0)=${c0.toFixed(5)}，calibrate(0.05)=${cLow.toFixed(4)}，calibrate(0.5)=${cHigh.toFixed(4)}，calibrate(1)=${c1.toFixed(5)}`
  )

  // 10. 负向校验：区间计数长度与 K 不一致必须报错
  const bad = validateModel({
    ...raw,
    bins: [
      {
        id: 'BAD',
        label: 'bad',
        lower: 0,
        upper: 1,
        counts: [
          [1, 2], // 长度 2 ≠ K=3
          [1, 2, 3],
        ],
      },
    ],
  })
  push('畸形计数被拦截', !bad.ok && bad.errors.some(e => e.includes('长度')), bad.errors[0] ?? '未报错')

  return { passed: checks.every(c => c.passed), checks }
}
