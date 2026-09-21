/**
 * 里程碑证据（新版证据模型）
 *
 * 旧版「对 14 个事件节点人工录入硬证据 + 外部事件 + Feature Registry」已删除：
 * 证据现在只有生产、付款两类日期事实，五状态由 newest.md 表3-7 的日期规则自动计算，
 * 两个维度组成联合观测状态 S（shipment.jointState），无需手工录入节点状态。
 *
 * 判定规则（computeMilestoneState）：
 *   1. 计划缺失，或计划日期不在有效范围 [2024-01-01, 2027-01-01] → 计划未知（最终优先级）
 *   2. 实际记录在「次日 00:00」后才对快照可见；可见时实际 ≤ 计划 → 已完成未逾期，否则已完成逾期
 *   3. 实际不可见时，计划次日已到快照 → 已到期未观测，否则 → 未到期未观测
 */

import type {
  Horizon,
  JointState,
  MilestoneEvidence,
  MilestoneState,
} from '../types'

// ===== 日期工具 =====

/** 计划日期有效范围（newest.md 表3-7） */
const PLAN_MIN = '2024-01-01'
const PLAN_MAX = '2027-01-01'
const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDate(s: string): number {
  // UTC 整数天，规避本地时区与夏令时
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function addDays(s: string, days: number): string {
  const t = parseDate(s) + days * MS_PER_DAY
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * 快照日期（式3-2）：t_snapshot = date(ETD) − h 个自然日（当地 00:00）。
 */
export function snapshotDateFor(plannedETD: string, horizon: Horizon): string {
  const h = horizon === '7天' ? 7 : horizon === '3天' ? 3 : 1
  return addDays(plannedETD, -h)
}

/**
 * 单维度五状态判定（表3-7）。
 *
 * @param plannedDate 最初计划日期，null = 缺失
 * @param actualDate  实际记录日期，null = 无记录
 * @param snapshotDate 快照日期
 */
export function computeMilestoneState(
  plannedDate: string | null,
  actualDate: string | null,
  snapshotDate: string,
): MilestoneState {
  // 1) 计划未知：缺失或超出有效范围（最终优先级，即使实际记录存在也按计划未知处理）
  if (
    plannedDate === null ||
    parseDate(plannedDate) < parseDate(PLAN_MIN) ||
    parseDate(plannedDate) > parseDate(PLAN_MAX)
  ) {
    return '计划未知'
  }

  // 2) 实际记录在次日 00:00 才可见（防泄漏）
  if (
    actualDate !== null &&
    parseDate(actualDate) >= parseDate(PLAN_MIN) &&
    parseDate(snapshotDate) >= parseDate(addDays(actualDate, 1))
  ) {
    return parseDate(actualDate) <= parseDate(plannedDate)
      ? '已完成未逾期'
      : '已完成逾期'
  }

  // 3) 实际不可见：以计划次日是否已到快照区分到期与否
  return parseDate(snapshotDate) >= parseDate(addDays(plannedDate, 1))
    ? '已到期未观测'
    : '未到期未观测'
}

// ===== 演示数据：生产 / 付款日期事实 =====

interface MilestoneRaw {
  shipmentKey: string
  dimension: '生产' | '付款'
  plannedDate: string | null
  actualDate: string | null
  source: string
  businessTime: string
  systemTime: string
}

/**
 * 日期事实原始表（计划/实际日期、来源、业务与系统时间）。
 * 快照口径与各单 plannedETD / horizon 一致（见 shipments.ts 表头矩阵）。
 */
const milestoneRaw: MilestoneRaw[] = [
  // ① SH-2026-0712（快照 2026-07-05）：双双到期未观测
  {
    shipmentKey: 'SH-2026-0712',
    dimension: '生产',
    plannedDate: '2026-07-02',
    actualDate: null,
    source: 'MES 生产回执系统',
    businessTime: '—',
    systemTime: '—',
  },
  {
    shipmentKey: 'SH-2026-0712',
    dimension: '付款',
    plannedDate: '2026-06-28',
    actualDate: null,
    source: '财务收款系统',
    businessTime: '—',
    systemTime: '—',
  },

  // ② SH-2026-0815（快照 2026-08-15）：生产到期未观测，付款未到期
  {
    shipmentKey: 'SH-2026-0815',
    dimension: '生产',
    plannedDate: '2026-08-10',
    actualDate: null,
    source: 'MES 生产回执系统',
    businessTime: '—',
    systemTime: '—',
  },
  {
    shipmentKey: 'SH-2026-0815',
    dimension: '付款',
    plannedDate: '2026-08-18',
    actualDate: null,
    source: '财务收款系统',
    businessTime: '—',
    systemTime: '—',
  },

  // ③ SH-2026-0901（快照 2026-09-05）：双双按时完成
  {
    shipmentKey: 'SH-2026-0901',
    dimension: '生产',
    plannedDate: '2026-08-28',
    actualDate: '2026-08-27',
    source: 'MES 生产回执系统',
    businessTime: '2026-08-27 16:30',
    systemTime: '2026-08-27 17:00',
  },
  {
    shipmentKey: 'SH-2026-0901',
    dimension: '付款',
    plannedDate: '2026-08-25',
    actualDate: '2026-08-24',
    source: '财务收款系统',
    businessTime: '2026-08-24 10:15',
    systemTime: '2026-08-24 10:20',
  },

  // ④ SH-2026-0905（快照 2026-09-09）：生产逾期完成，付款计划缺失 → 计划未知
  {
    shipmentKey: 'SH-2026-0905',
    dimension: '生产',
    plannedDate: '2026-09-03',
    actualDate: '2026-09-06',
    source: 'MES 生产回执系统',
    businessTime: '2026-09-06 15:00',
    systemTime: '2026-09-06 15:40',
  },
  {
    shipmentKey: 'SH-2026-0905',
    dimension: '付款',
    plannedDate: null,
    actualDate: '2026-09-05',
    source: '财务收款系统',
    businessTime: '2026-09-05 09:30',
    systemTime: '2026-09-05 09:35',
  },

  // ⑤ SH-2026-0910（快照 2026-09-17）：双双逾期完成
  {
    shipmentKey: 'SH-2026-0910',
    dimension: '生产',
    plannedDate: '2026-09-10',
    actualDate: '2026-09-12',
    source: 'MES 生产回执系统',
    businessTime: '2026-09-12 18:00',
    systemTime: '2026-09-12 18:30',
  },
  {
    shipmentKey: 'SH-2026-0910',
    dimension: '付款',
    plannedDate: '2026-09-08',
    actualDate: '2026-09-11',
    source: '财务收款系统',
    businessTime: '2026-09-11 11:00',
    systemTime: '2026-09-11 11:05',
  },

  // ⑥ SH-2026-0908（快照 2026-09-14）：双双未到期未观测
  {
    shipmentKey: 'SH-2026-0908',
    dimension: '生产',
    plannedDate: '2026-09-20',
    actualDate: null,
    source: 'MES 生产回执系统',
    businessTime: '—',
    systemTime: '—',
  },
  {
    shipmentKey: 'SH-2026-0908',
    dimension: '付款',
    plannedDate: '2026-09-16',
    actualDate: null,
    source: '财务收款系统',
    businessTime: '—',
    systemTime: '—',
  },
]

// ===== 派生证据表（状态由日期规则自动计算）=====

/**
 * 各单的快照日期（由 shipments 的 ETD + horizon 决定）。
 * 在此集中登记以避免本模块反向依赖 shipments.ts。
 */
const snapshotDates: Record<string, { plannedETD: string; horizon: Horizon }> = {
  'SH-2026-0712': { plannedETD: '2026-07-12', horizon: '7天' },
  'SH-2026-0815': { plannedETD: '2026-08-22', horizon: '7天' },
  'SH-2026-0901': { plannedETD: '2026-09-08', horizon: '3天' },
  'SH-2026-0905': { plannedETD: '2026-09-12', horizon: '3天' },
  'SH-2026-0910': { plannedETD: '2026-09-18', horizon: '1天' },
  'SH-2026-0908': { plannedETD: '2026-09-15', horizon: '1天' },
}

export const evidences: MilestoneEvidence[] = milestoneRaw.map((raw) => {
  const meta = snapshotDates[raw.shipmentKey]
  const snapshotDate = snapshotDateFor(meta.plannedETD, meta.horizon)
  return {
    shipmentKey: raw.shipmentKey,
    dimension: raw.dimension,
    plannedDate: raw.plannedDate,
    actualDate: raw.actualDate,
    state: computeMilestoneState(raw.plannedDate, raw.actualDate, snapshotDate),
    source: raw.source,
    businessTime: raw.businessTime,
    systemTime: raw.systemTime,
  }
})

// ===== 查询函数 =====

/** 取一票订单的全部里程碑证据（生产在前、付款在后） */
export function getEvidenceByShipment(shipmentKey: string): MilestoneEvidence[] {
  return evidences.filter(e => e.shipmentKey === shipmentKey)
}

/** 由里程碑证据构造联合观测状态 S（生产, 付款） */
export function jointStateFromEvidence(shipmentKey: string): JointState {
  const list = getEvidenceByShipment(shipmentKey)
  const production = list.find(e => e.dimension === '生产')
  const payment = list.find(e => e.dimension === '付款')
  if (!production || !payment) {
    throw new Error(`缺少 ${shipmentKey} 的生产/付款里程碑证据`)
  }
  return { production: production.state, payment: payment.state }
}
