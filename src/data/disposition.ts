/**
 * 处置记录 + 运营指标（newest.md 第四章 4.4/4.5/4.6 节）
 *
 * 旧版 5 路由（跨部门会诊/补证核验/岗位限时确认/常规监控/补录数据）已删除，
 * 改为 2×2 矩阵（表4-1）：风险概率 × 证据可信度 → 4 种处置路由。
 *
 * 12 条处置记录覆盖 6 票订单（shipments.ts 的 2×2 设计象限），每票 2 条，
 * 覆盖任务状态机全部 6 种状态、剩余干预裕量正/负/0、双维评价、未采纳情形分类。
 *
 * 旧版「强制规则记录区」（mandatoryRules）已删除——newest.md 2.4 节标注"未提及"。
 */

import type { DispositionRecord, DispositionRoute } from '../types'

// ===== 处置记录（12 条，覆盖 6 票订单 × 2 条/票）=====

export const dispositionRecords: DispositionRecord[] = [
  // --- ① SH-2026-0712 高概率·高可信 → 启动跨部门处置（7天快照 2026-07-05）---

  {
    id: 'DR-001',
    shipmentKey: 'SH-2026-0712',
    timestamp: '2026-07-05 09:30',
    status: '已关闭',
    route: '启动跨部门处置',
    action: '发起跨部门会诊（物流+关务+商务）',
    actualAction: '召开会诊并落实临约舱位调剂',
    responsibleRole: '物流组组长',
    collaborators: ['关务组', '商务负责人'],
    resources: '临约舱位 1 个 · 商务审批',
    escalateContact: '运营总监',
    deadline: '2026-07-05 11:00',
    wMarginHours: 2,
    adopted: true,
    result: '会诊已召开，临约舱位已落实，缺口消除',
    alertTime: '2026-07-05 09:00',
    deliveryTime: '2026-07-05 09:05',
    signTime: '2026-07-05 09:10',
    firstResponseTime: '2026-07-05 09:30',
    actionCompleteTime: '2026-07-05 11:00',
    effectConfirmTime: '2026-07-05 14:00',
    businessResult: '追回时间',
    processDuty: '及时响应',
    relatedRiskCard: 'SH-2026-0712',
  },
  {
    id: 'DR-002',
    shipmentKey: 'SH-2026-0712',
    timestamp: '2026-07-06 09:30',
    status: '处理中',
    route: '启动跨部门处置',
    action: '制定拖车加急与报关加签方案',
    responsibleRole: '关务组',
    collaborators: ['拖车调度'],
    resources: '加急车辆 1 · 报关加签',
    escalateContact: '关务经理',
    deadline: '2026-07-06 15:00',
    wMarginHours: 4,
    adopted: null,
    alertTime: '2026-07-06 09:00',
    deliveryTime: '2026-07-06 09:05',
    signTime: '2026-07-06 09:15',
    firstResponseTime: '2026-07-06 09:30',
    actionCompleteTime: null,
    effectConfirmTime: null,
    relatedRiskCard: 'SH-2026-0712',
  },

  // --- ② SH-2026-0815 高概率·低可信 → 优先补证或人工核验（7天快照 2026-08-15）---

  {
    id: 'DR-003',
    shipmentKey: 'SH-2026-0815',
    timestamp: '2026-08-13 10:30',
    status: '待验证',
    route: '优先补证或人工核验',
    action: '向拖车TMS/关务系统发起补证请求',
    responsibleRole: '物流组',
    resources: 'TMS 补录权限',
    deadline: '2026-08-13 14:00',
    wMarginHours: 4,
    adopted: true,
    result: '拖车排车计划已补录，报关单证仍在补齐中',
    alertTime: '2026-08-13 10:00',
    deliveryTime: '2026-08-13 10:05',
    signTime: '2026-08-13 10:15',
    firstResponseTime: '2026-08-13 10:30',
    actionCompleteTime: '2026-08-13 14:00',
    effectConfirmTime: null,
    processDuty: '有效回执',
    relatedRiskCard: 'SH-2026-0815',
  },
  {
    id: 'DR-004',
    shipmentKey: 'SH-2026-0815',
    timestamp: '2026-08-14 09:00',
    status: '已升级',
    route: '优先补证或人工核验',
    action: '补证未完成，升级至物流组组长协调',
    actualAction: null,
    responsibleRole: '物流组组长',
    escalateContact: '运营总监',
    deadline: '2026-08-14 06:00',
    wMarginHours: -2,
    adopted: false,
    rejectReason: '补证窗口已关闭（T-7 快照后 24h 内未完成），升级协调',
    rejectCategory: '窗口已关闭',
    result: '升级至组长协调，未追回时间',
    alertTime: '2026-08-13 14:00',
    deliveryTime: '2026-08-13 14:05',
    signTime: '2026-08-13 14:10',
    firstResponseTime: '2026-08-14 09:00',
    actionCompleteTime: null,
    effectConfirmTime: null,
    businessResult: '未追回',
    processDuty: '及时升级',
    relatedRiskCard: 'SH-2026-0815',
  },

  // --- ③ SH-2026-0901 低概率·高可信 → 常规监控（3天快照 2026-09-05）---

  {
    id: 'DR-005',
    shipmentKey: 'SH-2026-0901',
    timestamp: '2026-09-05 09:00',
    status: '已关闭',
    route: '常规监控',
    action: '进入常规监控队列',
    responsibleRole: '系统',
    deadline: '2026-09-08 09:00',
    wMarginHours: 72,
    adopted: true,
    result: 'T-3 快照时点复检通过，按 1 天快照继续监控',
    alertTime: '2026-09-05 09:00',
    deliveryTime: '2026-09-05 09:00',
    signTime: '2026-09-05 09:00',
    firstResponseTime: '2026-09-05 09:00',
    actionCompleteTime: '2026-09-05 09:00',
    effectConfirmTime: '2026-09-05 09:00',
    processDuty: '及时响应',
    relatedRiskCard: 'SH-2026-0901',
  },
  {
    id: 'DR-006',
    shipmentKey: 'SH-2026-0901',
    timestamp: '2026-09-07 09:00',
    status: '待核验',
    route: '常规监控',
    action: '1天快照复检',
    responsibleRole: '系统',
    deadline: '2026-09-08 09:00',
    wMarginHours: 24,
    adopted: null,
    alertTime: '2026-09-07 09:00',
    deliveryTime: '2026-09-07 09:00',
    signTime: '2026-09-07 09:00',
    firstResponseTime: null,
    actionCompleteTime: null,
    effectConfirmTime: null,
    relatedRiskCard: 'SH-2026-0901',
  },

  // --- ④ SH-2026-0905 低概率·低可信 → 补充数据后再判断（3天快照 2026-09-09，未见组合→OTHER）---

  {
    id: 'DR-007',
    shipmentKey: 'SH-2026-0905',
    timestamp: '2026-09-09 10:30',
    status: '处理中',
    route: '补充数据后再判断',
    action: '向订单/工厂MES发起数据补录请求',
    responsibleRole: '数据组',
    resources: '工厂MES 接口',
    deadline: '2026-09-09 18:00',
    wMarginHours: 8,
    adopted: true,
    result: '工厂MES 接口恢复中，排产计划已补录',
    alertTime: '2026-09-09 10:00',
    deliveryTime: '2026-09-09 10:05',
    signTime: '2026-09-09 10:15',
    firstResponseTime: '2026-09-09 10:30',
    actionCompleteTime: null,
    effectConfirmTime: null,
    processDuty: '有效回执',
    relatedRiskCard: 'SH-2026-0905',
  },
  {
    id: 'DR-008',
    shipmentKey: 'SH-2026-0905',
    timestamp: '2026-09-09 14:00',
    status: '待核验',
    route: '补充数据后再判断',
    action: '付款约定与到账记录补充',
    responsibleRole: '商务组',
    deadline: '2026-09-10 02:00',
    wMarginHours: 12,
    adopted: null,
    alertTime: '2026-09-09 14:00',
    deliveryTime: '2026-09-09 14:05',
    signTime: '2026-09-09 14:10',
    firstResponseTime: null,
    actionCompleteTime: null,
    effectConfirmTime: null,
    relatedRiskCard: 'SH-2026-0905',
  },

  // --- ⑤ SH-2026-0910 高概率·高可信 → 启动跨部门处置（1天快照 2026-09-17）---

  {
    id: 'DR-009',
    shipmentKey: 'SH-2026-0910',
    timestamp: '2026-09-16 14:30',
    status: '待验证',
    route: '启动跨部门处置',
    action: '发起跨部门会诊（物流+关务+商务）',
    responsibleRole: '物流组组长',
    collaborators: ['关务组', '商务负责人'],
    resources: '临约舱位 · 加急车辆',
    escalateContact: '运营总监',
    deadline: '2026-09-16 16:00',
    wMarginHours: 2,
    adopted: true,
    result: '会诊已召开，舱位调剂方案待商务审批',
    alertTime: '2026-09-16 14:00',
    deliveryTime: '2026-09-16 14:05',
    signTime: '2026-09-16 14:10',
    firstResponseTime: '2026-09-16 14:30',
    actionCompleteTime: '2026-09-16 18:00',
    effectConfirmTime: null,
    processDuty: '及时响应',
    relatedRiskCard: 'SH-2026-0910',
  },
  {
    id: 'DR-010',
    shipmentKey: 'SH-2026-0910',
    timestamp: '2026-09-16 18:00',
    status: '已分派',
    route: '启动跨部门处置',
    action: '舱位调剂与拖车加急协同执行',
    responsibleRole: '商务负责人',
    collaborators: ['拖车调度', '关务组'],
    resources: '临约舱位 · 加急车辆 · 报关加签',
    escalateContact: '运营总监',
    deadline: '2026-09-16 22:00',
    wMarginHours: 4,
    adopted: null,
    alertTime: '2026-09-16 18:00',
    deliveryTime: '2026-09-16 18:05',
    signTime: '2026-09-16 18:10',
    firstResponseTime: null,
    actionCompleteTime: null,
    effectConfirmTime: null,
    relatedRiskCard: 'SH-2026-0910',
  },

  // --- ⑥ SH-2026-0908 低概率·高可信 → 常规监控（1天快照 2026-09-14）---

  {
    id: 'DR-011',
    shipmentKey: 'SH-2026-0908',
    timestamp: '2026-09-13 09:00',
    status: '已关闭',
    route: '常规监控',
    action: '进入常规监控队列',
    responsibleRole: '系统',
    deadline: '2026-09-14 09:00',
    wMarginHours: 24,
    adopted: true,
    result: '1天快照复检通过，无异常',
    alertTime: '2026-09-13 09:00',
    deliveryTime: '2026-09-13 09:00',
    signTime: '2026-09-13 09:00',
    firstResponseTime: '2026-09-13 09:00',
    actionCompleteTime: '2026-09-13 09:00',
    effectConfirmTime: '2026-09-13 09:00',
    processDuty: '及时响应',
    relatedRiskCard: 'SH-2026-0908',
  },
  {
    id: 'DR-012',
    shipmentKey: 'SH-2026-0908',
    timestamp: '2026-09-14 09:00',
    status: '待核验',
    route: '常规监控',
    action: '下一工作日复检',
    responsibleRole: '系统',
    deadline: '2026-09-15 09:00',
    wMarginHours: 24,
    adopted: null,
    alertTime: '2026-09-14 09:00',
    deliveryTime: '2026-09-14 09:00',
    signTime: '2026-09-14 09:00',
    firstResponseTime: null,
    actionCompleteTime: null,
    effectConfirmTime: null,
    relatedRiskCard: 'SH-2026-0908',
  },
]

// ===== 运营指标（4.4/4.5/4.6 节，基于任务状态机与双维评价）=====

export interface OpsMetric {
  id: string
  label: string
  value: string
  unit: string
  desc: string
  tone?: 'good' | 'warn' | 'danger'
}

export const opsMetrics: OpsMetric[] = [
  {
    id: 'alert_volume',
    label: '告警总量',
    value: '12',
    unit: '条',
    desc: '覆盖 6 票任务 · 三个提前期快照',
  },
  {
    id: 'closed_rate',
    label: '已关闭率',
    value: '25',
    unit: '%',
    desc: '12 条中 3 条已关闭（DR-001/005/011）',
    tone: 'warn',
  },
  {
    id: 'escalation_count',
    label: '已升级',
    value: '1',
    unit: '条',
    desc: 'DR-004 补证窗口已关闭，升级协调',
    tone: 'danger',
  },
  {
    id: 'avg_response',
    label: '平均首次响应',
    value: '2.7',
    unit: 'h',
    desc: '已响应 8 条任务的平均首次响应时长（目标 < 4h）',
    tone: 'good',
  },
  {
    id: 'avg_margin',
    label: '平均剩余裕量',
    value: '14.8',
    unit: 'h',
    desc: '12 条任务的平均剩余干预裕量 W（式4-1）',
    tone: 'good',
  },
  {
    id: 'recovery_rate',
    label: '业务追回率',
    value: '33',
    unit: '%',
    desc: '已关闭 3 条中 1 条追回时间（DR-001）',
    tone: 'warn',
  },
]

// ===== 辅助函数 =====

/** 按 shipment_key 获取处置记录 */
export function getRecordsByShipment(key: string): DispositionRecord[] {
  return dispositionRecords.filter(r => r.shipmentKey === key)
}

/** 2×2 处置路由统计 */
export function getRouteStats(): Record<DispositionRoute, number> {
  const stats: Record<DispositionRoute, number> = {
    '启动跨部门处置': 0,
    '优先补证或人工核验': 0,
    '常规监控': 0,
    '补充数据后再判断': 0,
  }
  for (const r of dispositionRecords) stats[r.route]++
  return stats
}
