// 全局共享类型定义

// ===== 导航类型 =====

export type ReviewTab = 'overview' | 'timeline' | 'agents' | 'review'
export type WarningTab = 'workbench' | 'riskcard' | 'network' | 'ledger'
export type Tab = ReviewTab | WarningTab

// ===== 风险等级与标签 =====

export type RiskLevel = '低' | '中' | '高' | '信息不足'

// 风险卡②区域四种标签（chapter4 4.6 要求）
export type EvidenceLabel = '已发生事实' | '已观察异常迹象' | '模型推断风险升高' | '数据不足'

// ===== 处置类型（newest.md 第四章 4.4/4.5/4.6 节，2×2 矩阵 + 任务状态机）=====

/**
 * 任务状态机（4.4 节）：
 * 待核验 → 已分派 → 处理中 → 待验证 → 已关闭
 * 无法在剩余业务窗口内完成的任务进入「已升级」。
 * 风险概率下降不自动等同任务完成；关闭仍需有效回执及处置结果核验。
 */
export type DispositionStatus =
  | '待核验'
  | '已分派'
  | '处理中'
  | '待验证'
  | '已关闭'
  | '已升级'

/**
 * 2×2 处置路由（newest.md 表4-1）：风险概率 × 证据可信度。
 * 旧版 5 路由（跨部门会诊/补证核验/岗位限时确认/常规监控/补录数据）已删除。
 */
export type DispositionRoute =
  | '启动跨部门处置'      // 高概率·高可信
  | '优先补证或人工核验'  // 高概率·低可信
  | '常规监控'            // 低概率·高可信
  | '补充数据后再判断'    // 低概率·低可信

/** 未采纳情形分类（4.6 节：区分不可执行/窗口关闭/证据不足/成本约束/岗位未执行） */
export type RejectCategory =
  | '建议不可执行'
  | '窗口已关闭'
  | '证据不足'
  | '成本约束'
  | '岗位未执行'

/** 业务结果维度（4.6 节双维评价之一） */
export type BusinessResult = '追回时间' | '避免改船' | '避免额外费用' | '未追回'

/** 过程履职维度（4.6 节双维评价之二） */
export type ProcessDuty = '及时响应' | '及时升级' | '有效回执' | '未及时'

// ===== 第三章：晚开预警融合算法类型（newest.md 3.5 节，新版）=====

/**
 * 提前期 / 快照口径（式3-2）：h ∈ {7,3,1} 个自然日。
 * 三个提前期各自独立快照、独立训练模型与条件表。
 */
export type Horizon = '7天' | '3天' | '1天'

/**
 * 晚开结果 G（二态）：
 * 0 = 未晚开，1 = 晚开（ATD − 最初 ETD 严格超过 24 小时，恰好 24 小时不计，式3-1）。
 */
export type GState = 0 | 1

/**
 * 生产 / 付款单维度的五状态编码（newest.md 表3-7）。
 * 先判断实际记录是否可见，再比较实际与计划日期；「计划未知」具有最终优先级。
 */
export type MilestoneState =
  | '已完成未逾期' // 实际可见且不晚于计划
  | '已完成逾期' // 实际可见且晚于计划
  | '已到期未观测' // 计划次日已到快照但实际不可见
  | '未到期未观测' // 计划未到期且实际不可见
  | '计划未知' // 计划缺失或不在有效日期范围（2024-01-01 至 2027-01-01）

/**
 * 生产与付款联合观测状态 S = (S_production, S_payment)（式3-11）。
 * 理论上最多 25 种组合；保留共同分布，不作为两个独立似然重复相乘。
 */
export interface JointState {
  production: MilestoneState
  payment: MilestoneState
}

/**
 * 融合结构（式3-17）：
 * - conditional：条件融合，按 q 的 20/40/60/80 分位区间分层，LR 用 P(S|G,C)
 * - pooled：不分层融合，LR 用总体条件表 P(S|G)，先验修正保持一致（3.5.8）
 */
export type FusionMethod = 'conditional' | 'pooled'

/**
 * 双参数逻辑校准参数（两阶段同形式）：
 * - 第一次校准（式3-7）：q = σ(a·logit(p_raw) + b)，建立 ML→贝叶斯输入尺度
 * - 第二次校准（式3-10）：p* = σ(A·logit(r) + B)，调整融合输出尺度
 */
export interface LogisticCalibration {
  /** 斜率（第一次 a，第二次 A），约束 [0.001, 10]，正斜率保持排序 */
  slope: number
  /** 截距（第一次 b，第二次 B），约束 [-20, 20] */
  intercept: number
  /** 拟合订单数（参数可追溯，表3-6 / 表3-9） */
  fittedCount: number
}

// ===== SHAP 特征贡献 =====

/** 单条 SHAP 主要贡献特征（风险卡 ML 结果区，表4-2） */
export interface ShapFeature {
  feature: string
  contribution: string
}

// ===== 订单（新版演示数据契约）=====

/**
 * 一张海运订单（newest.md 表4-2 统一风险卡的订单数据）。
 *
 * - 快照口径由 horizon 标识（7天/3天/1天），评分调用同提前期的融合模型
 * - pRaw：LightGBM 原始概率（式3-5）；ML 始终经虚拟证据进入 BN，无"无法预测"分支
 * - jointState：由生产/付款的计划与实际日期按表3-7 规则**自动计算**（见 evidence.ts）
 * - q、r、p* 及 G 二态后验均由 bn/engine 在运行时计算，不在数据中硬编码
 * - 模型/条件表/桥接版本取自对应提前期的 FusionModel，无需逐单存储
 */
export interface Shipment {
  /** shipment_key */
  key: string
  origin: string
  destination: string
  commodity: string
  containerType: string
  containerCount: number
  /** 最初约定 ETD */
  plannedETD: string
  /** 快照提前期 snapshot_time（式3-2） */
  horizon: Horizon
  carrier: string
  voyage: string
  /** 截港时间 */
  cutoffTime: string
  /** LightGBM 原始概率 p_raw */
  pRaw: number
  /** SHAP 主要贡献特征 */
  shapTop3: ShapFeature[]
  /** 生产付款联合观测状态 S */
  jointState: JointState
  /** 证据可信度 Ci（0-1），与风险概率分离评估（4.1） */
  confidence: number
  note?: string
}

// ===== 里程碑证据（新版证据模型）=====

/**
 * 生产 / 付款单维度的里程碑证据（风险卡③证据清单）。
 * 每个订单两条（生产、付款），其状态由日期规则自动计算，是联合状态 S 的展开依据。
 */
export interface MilestoneEvidence {
  shipmentKey: string
  dimension: '生产' | '付款'
  /** 最初计划日期（生产完成 / 预付款约定）；null = 计划缺失 */
  plannedDate: string | null
  /** 实际记录日期；null = 快照时点不可见或无记录 */
  actualDate: string | null
  /** 表3-7 五状态（由 computeMilestoneState 依据计划/实际日期与快照日期计算） */
  state: MilestoneState
  /** 来源系统 */
  source: string
  /** 业务发生时间（无记录时为 '—'） */
  businessTime: string
  /** 系统写入时间（无记录时为 '—'） */
  systemTime: string
}

// ===== 处置记录（newest.md 第四章 4.4/4.5/4.6 节）=====

/**
 * 一条处置任务记录（4.4 节流转 + 4.5 节裕量 + 4.6 节双维评价）。
 * 旧版 5 路由字段含义已全部替换为 2×2 矩阵 + 任务状态机 + 六时间点 + 双维评价。
 */
export interface DispositionRecord {
  id: string
  shipmentKey: string
  /** 记录创建时间 */
  timestamp: string
  /** 任务状态机当前状态（4.4） */
  status: DispositionStatus
  /** 2×2 处置路由（表4-1） */
  route: DispositionRoute
  /** 建议动作（4.6 保留建议动作） */
  action: string
  /** 实际动作（未采纳或调整后可能与建议不同） */
  actualAction?: string | null
  /** 主责岗位（4.4 分派要求） */
  responsibleRole: string
  /** 协同主体（4.4 分派要求） */
  collaborators?: string[]
  /** 所需资源约束（4.5 资源匹配：舱位/车源/箱源/单证/费用审批/岗位权限） */
  resources?: string
  /** 升级联系人（4.4 分派要求） */
  escalateContact?: string
  /** 关键截止时点（4.5 t_deadline） */
  deadline: string
  /** 剩余干预裕量 W = t_deadline − t_now − T_exec（小时，式4-1；负值表示窗口已关闭） */
  wMarginHours: number
  /** 采纳状态：true=已采纳；false=未采纳；null=待核验阶段未定 */
  adopted: boolean | null
  /** 未采纳理由（4.6） */
  rejectReason?: string | null
  /** 未采纳情形分类（4.6：避免合并为同一责任标签） */
  rejectCategory?: RejectCategory | null
  /** 处置结果回执（4.6 保留结果回执） */
  result?: string | null
  /** 4.4 节六个关键时间点：告警生成、送达、签收、首次响应、动作完成、效果确认 */
  alertTime: string
  deliveryTime: string
  signTime: string
  firstResponseTime: string | null
  actionCompleteTime: string | null
  effectConfirmTime: string | null
  /** 业务结果维度（4.6 双维评价之一） */
  businessResult?: BusinessResult | null
  /** 过程履职维度（4.6 双维评价之二） */
  processDuty?: ProcessDuty | null
  relatedRiskCard: string
}
