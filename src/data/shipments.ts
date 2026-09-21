/**
 * 6 票演示订单（newest.md 表4-2 新版字段）
 *
 * 覆盖第四章 2×2 联合处置矩阵（表4-1）的全部四个象限，并分布在三个提前期：
 *
 * | # | 订单 | 提前期 | 联合状态 S | 可信度 | 设计象限（表4-1） |
 * |---|---|---|---|---|---|
 * | ① | SH-2026-0712 青岛→鹿特丹 | 7天 | CC 双双到期未观测 | 0.85 | 高概率·高可信 → 启动跨部门处置 |
 * | ② | SH-2026-0815 上海→汉堡   | 7天 | CD 生产到期未观测/付款未到期 | 0.42 | 高概率·低可信 → 优先补证或人工核验 |
 * | ③ | SH-2026-0901 宁波→洛杉矶 | 3天 | AA 双双按时完成 | 0.78 | 低概率·高可信 → 常规监控 |
 * | ④ | SH-2026-0905 青岛→釜山   | 3天 | BE 生产逾期完成/付款计划未知（未见组合→OTHER） | 0.30 | 低概率·低可信 → 补充数据后再判断 |
 * | ⑤ | SH-2026-0910 深圳→长滩   | 1天 | BB 双双逾期完成 | 0.80 | 高概率·高可信 → 启动跨部门处置 |
 * | ⑥ | SH-2026-0908 天津→墨尔本 | 1天 | DD 双双未到期未观测 | 0.72 | 低概率·高可信 → 常规监控 |
 *
 * q、r、p* 由 bn/engine 按 horizon 对应融合模型在运行时计算，不在此硬编码；
 * 联合状态由 evidence.ts 的日期规则从计划/实际日期自动计算，此处存展开后的结果。
 */

import type { Shipment } from '../types'
import type { OrderInput } from '../api/predict'

/**
 * 订单原始数据：从 evidence.ts 的日期事实 + shipments.ts 的展示字段组装，
 * 用于调用后端 /api/predict。后端会依据这些字段推理 p_raw 与联合状态 S。
 *
 * 注：etd 与 plannedETD 一致；planned/actual 日期与 evidence.ts 完全对齐。
 */
export const orderInputs: Record<string, OrderInput> = {
  'SH-2026-0712': {
    etd: '2026-07-12',
    container_type: '40HQ',
    origin: '青岛',
    destination: '鹿特丹',
    country: 'NL',
    trade_type: 'FOB',
    planned_production_date: '2026-07-02',
    planned_payment_date: '2026-06-28',
    actual_production_date: null,
    actual_payment_date: null,
    procurement_date: '2026-06-20',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
  'SH-2026-0815': {
    etd: '2026-08-22',
    container_type: '40GP',
    origin: '上海',
    destination: '汉堡',
    country: 'DE',
    trade_type: 'FOB',
    planned_production_date: '2026-08-10',
    planned_payment_date: '2026-08-18',
    actual_production_date: null,
    actual_payment_date: null,
    procurement_date: '2026-07-30',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
  'SH-2026-0901': {
    etd: '2026-09-08',
    container_type: '40FR',
    origin: '宁波',
    destination: '洛杉矶',
    country: 'US',
    trade_type: 'CIF',
    planned_production_date: '2026-08-28',
    planned_payment_date: '2026-08-25',
    actual_production_date: '2026-08-27',
    actual_payment_date: '2026-08-24',
    procurement_date: '2026-08-10',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
  'SH-2026-0905': {
    etd: '2026-09-12',
    container_type: '20GP',
    origin: '青岛',
    destination: '釜山',
    country: 'KR',
    trade_type: 'FOB',
    planned_production_date: '2026-09-03',
    planned_payment_date: null,
    actual_production_date: '2026-09-06',
    actual_payment_date: '2026-09-05',
    procurement_date: '2026-08-25',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
  'SH-2026-0910': {
    etd: '2026-09-18',
    container_type: '40HQ',
    origin: '深圳',
    destination: '长滩',
    country: 'US',
    trade_type: 'CIF',
    planned_production_date: '2026-09-10',
    planned_payment_date: '2026-09-08',
    actual_production_date: '2026-09-12',
    actual_payment_date: '2026-09-11',
    procurement_date: '2026-08-30',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
  'SH-2026-0908': {
    etd: '2026-09-15',
    container_type: '40OT',
    origin: '天津',
    destination: '墨尔本',
    country: 'AU',
    trade_type: 'CIF',
    planned_production_date: '2026-09-20',
    planned_payment_date: '2026-09-16',
    actual_production_date: null,
    actual_payment_date: null,
    procurement_date: '2026-09-01',
    booking: null,
    allocation: null,
    so: null,
    documents: null,
    pickup: null,
    return: null,
    customs: null,
    gate: null,
    release: null,
  },
}

export const shipments: Shipment[] = [
  // ① 高概率·高可信：青岛→鹿特丹 冰箱整柜（7天快照 2026-07-05）
  {
    key: 'SH-2026-0712',
    origin: '青岛',
    destination: '鹿特丹',
    commodity: '冰箱（整柜）',
    containerType: '40HQ',
    containerCount: 1,
    plannedETD: '2026-07-12',
    horizon: '7天',
    carrier: 'C 船公司',
    voyage: 'OCEAN STAR / 072W',
    cutoffTime: '2026-07-10 18:00',
    pRaw: 0.30,
    shapTop3: [
      { feature: '生产完成已逾期', contribution: '+0.17（计划完成已过 3 天仍无回执）' },
      { feature: '付款迟迟未见记录', contribution: '+0.13（预付款计划已过 7 天无记录）' },
      { feature: '距预计发货日期的天数', contribution: '+0.08（生产时间余量本身偏紧）' },
    ],
    jointState: {
      production: '已到期未观测',
      payment: '已到期未观测',
    },
    confidence: 0.85,
    note: '7 月 5 日快照：生产（计划 7/2）、付款（计划 6/28）均已到期且无实际记录，回执来源齐全，风险信号与证据支撑均充分',
  },

  // ② 高概率·低可信：上海→汉堡 服装拼箱（7天快照 2026-08-15）
  {
    key: 'SH-2026-0815',
    origin: '上海',
    destination: '汉堡',
    commodity: '服装（拼箱）',
    containerType: '40GP',
    containerCount: 1,
    plannedETD: '2026-08-22',
    horizon: '7天',
    carrier: 'H 船公司',
    voyage: 'NORTHERN LIGHT / 085E',
    cutoffTime: '2026-08-20 18:00',
    pRaw: 0.55,
    shapTop3: [
      { feature: '生产完成已逾期', contribution: '+0.26（排产计划 8/10 已过 5 天，无完成记录）' },
      { feature: '航线以往晚开情况', contribution: '+0.17（H 船公司该航线近 180 天明显偏高）' },
      { feature: '采购回执情况', contribution: '+0.08（采购回执刚出现，距计划交期偏近）' },
    ],
    jointState: {
      production: '已到期未观测',
      payment: '未到期未观测',
    },
    confidence: 0.42,
    note: 'ML 信号偏强，但付款尚未到期、生产实际状态无回执，关键事实未核实——先补证或人工核验，不直接采取高成本动作',
  },

  // ③ 低概率·高可信：宁波→洛杉矶 机械设备（3天快照 2026-09-05）
  {
    key: 'SH-2026-0901',
    origin: '宁波',
    destination: '洛杉矶',
    commodity: '机械设备',
    containerType: '40FR',
    containerCount: 1,
    plannedETD: '2026-09-08',
    horizon: '3天',
    carrier: 'C 船公司',
    voyage: 'PACIFIC DAWN / 091W',
    cutoffTime: '2026-09-06 18:00',
    pRaw: 0.06,
    shapTop3: [
      { feature: '生产完成情况', contribution: '−0.08（8/27 提前完成，记录可见）' },
      { feature: '付款完成情况', contribution: '−0.06（预付款 8/24 已到账）' },
      { feature: '距预计发货日期的天数', contribution: '+0.02（时间余量正常）' },
    ],
    jointState: {
      production: '已完成未逾期',
      payment: '已完成未逾期',
    },
    confidence: 0.78,
    note: '生产、付款均有可见回执且不晚于计划，证据支持低风险判断，常规监控并按 1 天快照复检',
  },

  // ④ 低概率·低可信：青岛→釜山 电子产品（3天快照 2026-09-09，未见组合→OTHER）
  {
    key: 'SH-2026-0905',
    origin: '青岛',
    destination: '釜山',
    commodity: '电子产品',
    containerType: '20GP',
    containerCount: 1,
    plannedETD: '2026-09-12',
    horizon: '3天',
    carrier: 'D 船公司',
    voyage: 'YELLOW SEA / 092W',
    cutoffTime: '2026-09-10 18:00',
    pRaw: 0.03,
    shapTop3: [
      { feature: '生产完成比计划晚', contribution: '+0.04（实际 9/6，晚于计划 9/3）' },
      { feature: '付款计划是否明确', contribution: '+0.03（预付款计划缺失，无法判定）' },
      { feature: '航线以往晚开情况', contribution: '+0.01（中韩航线正常）' },
    ],
    // 该组合不在条件表已收录状态中，评分时按 OTHER「其他未见组合」处理
    jointState: {
      production: '已完成逾期',
      payment: '计划未知',
    },
    confidence: 0.30,
    note: '付款计划缺失导致联合状态为未见组合，证据不足以支撑判断——补充付款约定与到账记录后再评估，不能按低风险放行',
  },

  // ⑤ 高概率·高可信：深圳→长滩 家电（1天快照 2026-09-17）
  {
    key: 'SH-2026-0910',
    origin: '深圳',
    destination: '长滩',
    commodity: '家电',
    containerType: '40HQ',
    containerCount: 1,
    plannedETD: '2026-09-18',
    horizon: '1天',
    carrier: 'M 船公司',
    voyage: 'TRANS PACIFIC / 093E',
    cutoffTime: '2026-09-16 18:00',
    pRaw: 0.28,
    shapTop3: [
      { feature: '生产完成比计划晚', contribution: '+0.16（实际 9/12，晚于计划 9/10 两天）' },
      { feature: '付款完成比计划晚', contribution: '+0.12（预付款 9/11 到账，晚于计划 9/8）' },
      { feature: '生产时间余量', contribution: '+0.05（计划本身贴近发货日期）' },
    ],
    jointState: {
      production: '已完成逾期',
      payment: '已完成逾期',
    },
    confidence: 0.80,
    note: '生产、付款逾期均为可见事实，距 ETD 仅 1 天，风险信号与证据均充分，立即启动跨部门处置',
  },

  // ⑥ 低概率·高可信：天津→墨尔本 钢材（1天快照 2026-09-14）
  {
    key: 'SH-2026-0908',
    origin: '天津',
    destination: '墨尔本',
    commodity: '钢材',
    containerType: '40OT',
    containerCount: 1,
    plannedETD: '2026-09-15',
    horizon: '1天',
    carrier: 'M 船公司',
    voyage: 'SOUTHERN CROSS / 094S',
    cutoffTime: '2026-09-13 18:00',
    pRaw: 0.05,
    shapTop3: [
      { feature: '生产完成情况', contribution: '+0.02（计划 9/20 尚未到期，属正常等待）' },
      { feature: '付款完成情况', contribution: '+0.01（计划 9/16 未到期）' },
      { feature: '距预计发货日期的天数', contribution: '+0.01（重货备港周期正常）' },
    ],
    jointState: {
      production: '未到期未观测',
      payment: '未到期未观测',
    },
    confidence: 0.72,
    note: '生产、付款计划均在 ETD 之后到期，快照时点无记录属正常状态，常规监控至下一工作日',
  },
]

// ===== 辅助函数 =====

/** 按 shipment_key 获取订单 */
export function getShipment(key: string): Shipment | undefined {
  return shipments.find(s => s.key === key)
}
