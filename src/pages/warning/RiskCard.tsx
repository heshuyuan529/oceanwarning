/**
 * W2 单票协同风险卡（核心页）
 *
 * 依据 newest.md 表4-2 六区域设计，本文件实现六个区域：
 *   ① 总体预警：G 二态后验（p*）、p_raw、q、SHAP、模型/条件表/桥接版本、可信度
 *   ② 证据清单：生产/付款里程碑证据（五状态由日期规则自动计算）
 *   ③ SHAP 主要贡献特征（ML 解释层，表4-2）
 *   ④ 流程定位 + 证据缺口：S1-S5 流程定位，不再展示 BN 后验条形图
 *   ⑤ 措施情景模拟：干预对象从事件节点改为生产/付款状态（compareStateIntervention）
 *   ⑥ 处置动作：2×2 矩阵（高概率·高可信→跨部门处置 等）
 *
 * 融合推断由后端 /api/predict 推理（LightGBM + 贝叶斯融合），前端不再本地计算。
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ShieldAlert, FileText, Gauge, Route, Send, Database, Clock, ClipboardList } from 'lucide-react'
import { getShipment, orderInputs } from '../../data/shipments'
import { getEvidenceByShipment } from '../../data/evidence'
import { getRecordsByShipment } from '../../data/disposition'
import { processStages } from '../../data/network'
import type { ProcessStageId } from '../../data/network'
import { predictBatch, toScoreTrace, toJointState, ApiError } from '../../api/predict'
import type { PredictResponse } from '../../api/predict'
import type { ScoreTrace } from '../../bn/engine'
import type { JointState, MilestoneEvidence, DispositionStatus } from '../../types'

// 处置任务状态徽章颜色（与 Ledger.tsx statusStyle 保持一致）
const DISP_STATUS_STYLE: Record<DispositionStatus, { bg: string; color: string }> = {
  '待核验': { bg: '#eef1f4', color: '#6b7a89' },
  '已分派': { bg: '#e8edf0', color: '#245b88' },
  '处理中': { bg: '#fff7db', color: '#9e791a' },
  '待验证': { bg: '#fff0e9', color: '#c6532c' },
  '已关闭': { bg: '#e7f4ed', color: '#287358' },
  '已升级': { bg: '#ffe4dc', color: '#a83217' },
}

// ===== 风险等级与 2×2 处置矩阵 =====

type RiskLevel = '低' | '高'
type ConfidenceLevel = '高' | '低'

interface QuadrantAction {
  label: string
  desc: string
}

const quadrantMatrix: Record<RiskLevel, Record<ConfidenceLevel, QuadrantAction>> = {
  '高': {
    '高': {
      label: '启动跨部门处置',
      desc: '立即发起物流+关务+商务联合行动，确认临约舱位与拖车加急方案',
    },
    '低': {
      label: '优先补证或人工核验',
      desc: '先补充关键事实（生产回执/付款记录），核验后再决定是否升级处置',
    },
  },
  '低': {
    '高': {
      label: '常规监控',
      desc: '风险信号充分支持低风险判断，进入常规监控队列，下一快照时点复检',
    },
    '低': {
      label: '补充数据后再判断',
      desc: '证据不足以支撑判断，补录数据后重新评估，不得按低风险放行',
    },
  },
}

function classifyRisk(pStar: number): RiskLevel {
  return pStar >= 0.5 ? '高' : '低'
}

function classifyConfidence(ci: number): ConfidenceLevel {
  return ci >= 0.6 ? '高' : '低'
}

// G 二态标签
const G_STATES = ['未晚开', '晚开'] as const

// 五状态中文简称
const STATE_SHORT: Record<string, string> = {
  '已完成未逾期': '按时完成',
  '已完成逾期': '逾期完成',
  '已到期未观测': '到期未观测',
  '未到期未观测': '未到期',
  '计划未知': '计划未知',
}

// ===== ④ 流程定位：由联合状态推导 S1-S5 所处阶段与证据缺口 =====

interface StageStatus {
  id: ProcessStageId
  label: string
  status: '已完成' | '进行中' | '待进入' | '证据缺口'
  detail: string
}

/**
 * 根据生产/付款联合状态推导流程定位（newest.md 4.1 节）。
 * S1=订单准备、S2=订舱资源、S3=拖车背箱、S4=报关集港、S5=离港出运
 *
 * 生产维度映射 S1-S2；付款维度映射 S1（预付款）→ S4（尾款）；
 * 缺口 = 已到期未观测 或 计划未知（需补证）
 */
function deriveStageStatus(
  productionState: string,
  paymentState: string,
): StageStatus[] {
  const stages = processStages.map(s => ({
    id: s.id,
    label: s.label,
    status: '待进入' as StageStatus['status'],
    detail: '',
  }))

  // 生产维度：S1（订单准备）→ S2（订舱资源）
  if (productionState === '已完成未逾期' || productionState === '已完成逾期') {
    stages[0].status = '已完成'
    stages[0].detail = `生产${STATE_SHORT[productionState]}`
    stages[1].status = '已完成'
    stages[1].detail = `生产${STATE_SHORT[productionState]}`
  } else if (productionState === '已到期未观测') {
    stages[0].status = '证据缺口'
    stages[0].detail = '生产已到期，无完成回执'
    stages[1].status = '证据缺口'
    stages[1].detail = '生产已到期，无完成回执'
  } else if (productionState === '未到期未观测') {
    if (stages[0].status === '待进入') {
      stages[0].status = '进行中'
      stages[0].detail = '生产未到期'
    }
  } else if (productionState === '计划未知') {
    stages[0].status = '证据缺口'
    stages[0].detail = '生产计划缺失'
  }

  // 付款维度：S1（预付款）、S4（报关集港，关联尾款）
  if (paymentState === '已完成未逾期' || paymentState === '已完成逾期') {
    if (stages[0].status === '待进入' || stages[0].status === '进行中') {
      stages[0].status = '已完成'
      stages[0].detail = (stages[0].detail ? stages[0].detail + '；' : '') + `付款${STATE_SHORT[paymentState]}`
    } else {
      stages[0].detail = (stages[0].detail ? stages[0].detail + '；' : '') + `付款${STATE_SHORT[paymentState]}`
    }
  } else if (paymentState === '已到期未观测') {
    if (stages[0].status !== '证据缺口') {
      stages[0].status = stages[0].status === '待进入' ? '证据缺口' : stages[0].status
    }
    stages[0].detail = (stages[0].detail ? stages[0].detail + '；' : '') + '付款已到期无记录'
    // 付款到期也影响 S4
    stages[3].status = '证据缺口'
    stages[3].detail = '付款已到期无记录'
  } else if (paymentState === '未到期未观测') {
    if (stages[3].status === '待进入') {
      stages[3].detail = '付款未到期'
    }
  } else if (paymentState === '计划未知') {
    stages[3].status = '证据缺口'
    stages[3].detail = '付款计划缺失'
  }

  return stages as StageStatus[]
}

// ===== ⑤ 措施情景模拟：候选干预状态 =====

interface MeasureOption {
  id: string
  label: string
  desc: string
  /** 干预后的替代联合状态 */
  alternative: JointState
}

/** 单条情景模拟行（对齐后端 ApiIntervention 简化结构） */
interface ScenarioRow {
  measure: MeasureOption
  baselinePStar: number
  intervenedPStar: number
  reduction: number
}

/**
 * 根据当前联合状态生成候选干预措施：
 * 对"已到期未观测"的生产/付款，模拟补录为"已完成未逾期"或"已完成逾期"
 */
function buildMeasures(
  currentState: JointState,
  evidenceList: MilestoneEvidence[],
): MeasureOption[] {
  const measures: MeasureOption[] = []
  const prodEv = evidenceList.find(e => e.dimension === '生产')
  const payEv = evidenceList.find(e => e.dimension === '付款')

  // 生产：已到期未观测 → 假设补录为按时完成
  if (currentState.production === '已到期未观测' && prodEv?.actualDate === null) {
    measures.push({
      id: 'prod_complete_ok',
      label: '补录生产按时完成',
      desc: '假设生产实际已按时完成并录入回执，S_production: 已到期未观测 → 已完成未逾期',
      alternative: { ...currentState, production: '已完成未逾期' },
    })
    // 生产：已到期未观测 → 假设补录为逾期完成
    measures.push({
      id: 'prod_complete_late',
      label: '补录生产逾期完成',
      desc: '假设生产实际已完成但晚于计划，S_production: 已到期未观测 → 已完成逾期',
      alternative: { ...currentState, production: '已完成逾期' },
    })
  }

  // 付款：已到期未观测 → 假设补录为按时完成
  if (currentState.payment === '已到期未观测' && payEv?.actualDate === null) {
    measures.push({
      id: 'pay_complete_ok',
      label: '补录付款按时完成',
      desc: '假设预付款实际已按时到账，S_payment: 已到期未观测 → 已完成未逾期',
      alternative: { ...currentState, payment: '已完成未逾期' },
    })
  }

  // 付款：计划未知 → 假设补录计划并按时完成
  if (currentState.payment === '计划未知') {
    measures.push({
      id: 'pay_plan_ok',
      label: '补录付款计划并完成',
      desc: '假设补录付款计划且实际按时完成，S_payment: 计划未知 → 已完成未逾期',
      alternative: { ...currentState, payment: '已完成未逾期' },
    })
  }

  return measures
}

// 解析 SHAP 贡献文案（如 "+0.17（计划完成已过 3 天仍无回执）"）为数值与解释
// 兼容数据中使用的 Unicode 减号 "−"
function parseShap(contribution: string): { value: number; raw: string; explain: string } {
  const idx = contribution.indexOf('（')
  const raw = idx === -1 ? contribution.trim() : contribution.slice(0, idx).trim()
  const explain = idx === -1 ? '' : contribution.slice(idx)
  const value = parseFloat(raw.replace(/−/g, '-'))
  return { value: Number.isNaN(value) ? 0 : value, raw, explain }
}

// SHAP 贡献分档（演示口径）：|v|≥0.15 明显 / ≥0.05 有所 / 其余轻微
function shapLevel(v: number): 3 | 2 | 1 {
  const a = Math.abs(v)
  return a >= 0.15 ? 3 : a >= 0.05 ? 2 : 1
}

interface RiskCardProps {
  shipmentKey: string
  onBack: () => void
  onTransfer: (shipmentKey: string) => void
  /** 跳转“网络与证据”次级页（W3 已从主导航降级，由①区链接进入） */
  onViewNetwork?: () => void
}

export function RiskCard({ shipmentKey, onBack, onTransfer, onViewNetwork }: RiskCardProps) {
  const shipment = getShipment(shipmentKey)
  const rawOrder = shipment ? orderInputs[shipment.key] : undefined

  // 后端推理结果（trace / standalone / interventions 一次拉回）
  const [resp, setResp] = useState<PredictResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shipment || !rawOrder) return
    let cancelled = false
    setError(null)
    setResp(null)
    predictBatch(
      shipment.horizon,
      [rawOrder],
      { standalone: true, interventions: true },
    )
      .then(arr => {
        if (!cancelled) setResp(arr[0])
      })
      .catch(e => {
        if (cancelled) return
        const msg = e instanceof ApiError ? e.message : (e as Error).message
        setError(`后端推理失败：${msg}`)
      })
    return () => { cancelled = true }
  }, [shipment, rawOrder])

  // 转为前端 ScoreTrace 结构（与 bn/engine.ts 类型一致）
  const trace = useMemo<ScoreTrace | null>(() => {
    if (!resp) return null
    return toScoreTrace(resp.score)
  }, [resp])

  const standalone = useMemo(() => {
    if (!resp?.standalone) return null
    return { q: resp.standalone.q, pStar: resp.standalone.p_star }
  }, [resp])

  // ④ 流程定位 + ⑤ 候选措施（本地推导，仍用 evidence 与 deriveStageStatus）
  const { stageStatuses, measures, scenarios } = useMemo(() => {
    if (!shipment || !resp?.interventions) {
      return { stageStatuses: [] as StageStatus[], measures: [] as MeasureOption[], scenarios: [] as ScenarioRow[] }
    }
    const evs = getEvidenceByShipment(shipment.key)
    const jointState = toJointState(resp.joint_state)
    const stages = deriveStageStatus(jointState.production, jointState.payment)
    const ms = buildMeasures(jointState, evs)

    // ⑤ 情景模拟：把后端返回的 interventions 与候选措施按替代状态匹配
    //    后端候选只包含生产/付款为「已完成未逾期」的若干组合；这里按 measure.alternative 匹配
    const sims: ScenarioRow[] = ms.map(m => {
      const match = resp.interventions!.find(iv =>
        iv.alternative.production === m.alternative.production &&
        iv.alternative.payment === m.alternative.payment,
      )
      if (!match) return null
      return {
        measure: m,
        baselinePStar: match.baseline.p_star,
        intervenedPStar: match.intervened.p_star,
        reduction: match.p_star_change, // 负值表示概率下降
      }
    }).filter((x): x is ScenarioRow => x !== null)

    return { stageStatuses: stages, measures: ms, scenarios: sims }
  }, [shipment, resp])

  if (!shipment) {
    return (
      <div className="page">
        <div className="wb-placeholder">
          <ShieldAlert size={32} />
          <h3>未找到任务 {shipmentKey}</h3>
          <button className="button" onClick={onBack}>返回工作台</button>
        </div>
      </div>
    )
  }

  const [showTech, setShowTech] = useState(false)
  const evs = getEvidenceByShipment(shipment.key)
  // 关联处置任务（借鉴 6.4：协同任务进展汇总至主风险卡）
  const dispRecords = getRecordsByShipment(shipment.key)
  const pStar = trace?.pStar ?? 0
  const riskLevel = classifyRisk(pStar)
  const confLevel = classifyConfidence(shipment.confidence)
  const quadrant = quadrantMatrix[riskLevel][confLevel]
  const gPosterior: [number, number] = trace
    ? [1 - trace.r, trace.r]
    : [0, 0]
  const versions = trace?.versions

  // 后端推理失败：渲染错误占位页
  if (error) {
    return (
      <div className="page">
        <div className="wb-placeholder">
          <ShieldAlert size={32} />
          <h3>无法加载风险卡 {shipmentKey}</h3>
          <p>{error}</p>
          <p style={{ marginTop: 8, color: '#6b7a89' }}>
            请确认 .env 中 VITE_API_BASE 指向运行中的后端（默认 http://localhost:8000）。
          </p>
          <button className="button" style={{ marginTop: 12 }} onClick={onBack}>返回工作台</button>
        </div>
      </div>
    )
  }

  // 推理中：渲染骨架占位页（保留 header 与返回栏）
  if (!resp || !trace) {
    return (
      <div className="page rc-page">
        <div className="rc-back-bar">
          <button className="button ghost" onClick={onBack}>
            <ArrowLeft size={15} /> 返回工作台
          </button>
          <span className="rc-key">{shipment.key}</span>
          <span className="rc-data-status">加载中</span>
        </div>
        <section className="panel rc-header">
          <div className="rc-header-grid">
            <div className="rc-meta"><span>港对</span><b>{shipment.origin} → {shipment.destination}</b></div>
            <div className="rc-meta"><span>商品</span><b>{shipment.commodity}</b></div>
            <div className="rc-meta"><span>箱型</span><b>{shipment.containerType}×{shipment.containerCount}</b></div>
            <div className="rc-meta"><span>船期 ETD</span><b>{shipment.plannedETD}</b></div>
            <div className="rc-meta"><span>截港时间</span><b>{shipment.cutoffTime}</b></div>
            <div className="rc-meta"><span>承运人</span><b>{shipment.carrier}</b></div>
            <div className="rc-meta"><span>航次</span><b>{shipment.voyage}</b></div>
          </div>
          {shipment.note && <p className="rc-note">{shipment.note}</p>}
        </section>
        <section className="panel rc-section">
          <div className="rc-section-head">
            <ShieldAlert size={16} />
            <h3>① 总体预警</h3>
          </div>
          <div className="wb-placeholder">
            <b>正在调用后端 /api/predict…</b>
            <p>LightGBM 推理 p_raw → 第一次校准 q → 贝叶斯融合 r → 第二次校准 p*</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page rc-page">
      {/* 返回栏 */}
      <div className="rc-back-bar">
        <button className="button ghost" onClick={onBack}>
          <ArrowLeft size={15} /> 返回工作台
        </button>
        <span className="rc-key">{shipment.key}</span>
        <span className="rc-data-status">演示数据</span>
      </div>

      {/* 任务基础信息 */}
      <section className="panel rc-header">
        <div className="rc-header-grid">
          <div className="rc-meta"><span>港对</span><b>{shipment.origin} → {shipment.destination}</b></div>
          <div className="rc-meta"><span>商品</span><b>{shipment.commodity}</b></div>
          <div className="rc-meta"><span>箱型</span><b>{shipment.containerType}×{shipment.containerCount}</b></div>
          <div className="rc-meta"><span>船期 ETD</span><b>{shipment.plannedETD}</b></div>
          <div className="rc-meta"><span>截港时间</span><b>{shipment.cutoffTime}</b></div>
          <div className="rc-meta"><span>承运人</span><b>{shipment.carrier}</b></div>
          <div className="rc-meta"><span>航次</span><b>{shipment.voyage}</b></div>
        </div>
        {shipment.note && <p className="rc-note">{shipment.note}</p>}
      </section>

      {/* ① 总体预警（方案 B：主视图白话卡，算法审计信息收进默认收起的推断细节折叠块） */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <ShieldAlert size={16} />
          <h3>① 总体预警</h3>
        </div>
        <div className="rc-overall-grid">
          {/* 晚开风险（最终概率 p*） */}
          <div className="rc-risk-badge">
            <span>晚开风险</span>
            <b className={`wb-risk ${riskLevel === '高' ? 'r-high' : 'r-low'}`}>
              {(pStar * 100).toFixed(1)}%
            </b>
            <small>{riskLevel === '高' ? '高概率·建议尽快处置' : '低概率·可常规监控'}</small>
          </div>
          {/* 按当前生产付款状态推算（G 二态后验，白话化） */}
          <div className="rc-g-dist">
            <span>按当前生产付款状态推算</span>
            <div className="rc-g-bars">
              {G_STATES.map((st, i) => (
                <div key={st} className="rc-g-bar-row">
                  <em>{st === '晚开' ? '会晚开' : '不晚开'}</em>
                  <div className="rc-g-bar-track">
                    <span
                      className={`rc-g-bar-fill g-fill-${i}`}
                      style={{ width: `${gPosterior[i] * 100}%` }}
                    />
                  </div>
                  <b>{(gPosterior[i] * 100).toFixed(1)}%</b>
                </div>
              ))}
            </div>
          </div>
          {/* 证据可信度 */}
          <div className="rc-mini">
            <span>证据可信度</span>
            <b>{(shipment.confidence * 100).toFixed(0)}%</b>
            <small>{confLevel === '低' ? '低可信·优先补证' : '高可信'}</small>
          </div>
          {/* 距预计发货（快照时点，业务决策关键时间信息） */}
          <div className="rc-mini">
            <span>距预计发货</span>
            <b>{shipment.horizon.replace('天', ' 天')}</b>
            <small>快照时点</small>
          </div>
          {/* 仅凭历史数据预测（独立 ML 对照，白话讲清融合价值） */}
          <div className="rc-mini">
            <span>仅凭历史数据预测</span>
            <b>{standalone ? `${(standalone.pStar * 100).toFixed(1)}%` : '—'}</b>
            <small>未结合生产付款状态</small>
          </div>
        </div>

        {/* 推断细节折叠块（默认收起，供核查；p_raw/q/版本/轨迹为审计信息） */}
        <button className="rc-tech-toggle" onClick={() => setShowTech(!showTech)}>
          {showTech ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          推断细节（供核查）
        </button>
        {showTech && (
          <div className="rc-tech-detail">
            <div className="rc-overall-grid">
              <div className="rc-mini">
                <span>p_raw（LightGBM 原始输出）</span>
                <b>{(shipment.pRaw * 100).toFixed(1)}%</b>
                <small>模型输入</small>
              </div>
              <div className="rc-mini">
                <span>q（第一次校准，式3-7）</span>
                <b>{trace ? `${(trace.q * 100).toFixed(1)}%` : '—'}</b>
                <small>贝叶斯输入</small>
              </div>
              <div className="rc-mini">
                <span>模型版本</span>
                <b>{versions?.mlModel ?? '—'}</b>
                <small>演示数据</small>
              </div>
              <div className="rc-mini">
                <span>条件表版本</span>
                <b>{versions?.conditionTable ?? '—'}</b>
                <small>演示数据</small>
              </div>
              <div className="rc-mini">
                <span>桥接版本（虚拟证据 λ）</span>
                <b>{versions?.virtualEvidence ?? '—'}</b>
                <small>演示数据</small>
              </div>
            </div>
            {trace && (
              <div className="rc-inference-trace">
                <span>推断轨迹：</span>
                <code>
                  p_raw={shipment.pRaw.toFixed(2)} → q={trace.q.toFixed(4)} →{' '}
                  {trace.isOtherState ? `[${trace.stateId}=OTHER]` : `[${trace.stateId}]`}{' '}
                  LR={trace.LR.toFixed(3)} → r={trace.r.toFixed(4)} → p*={trace.pStar.toFixed(4)}
                </code>
                <span className="rc-method-tag">{trace.methodLabel}</span>
              </div>
            )}
          </div>
        )}
        {/* W3 次级入口：模型结构 / 条件频数表 / 字段口径 */}
        {onViewNetwork && (
          <button className="rc-net-link" onClick={onViewNetwork}>
            <Database size={12} /> 查看模型结构与条件频数表（网络与证据 · 次级页）
          </button>
        )}
      </section>

      {/* ② 证据清单 */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <FileText size={16} />
          <h3>② 证据清单</h3>
        </div>
        {evs.length === 0 ? (
          <div className="rc-na-block">暂无证据记录</div>
        ) : (
          <table className="rc-evidence-table">
            <thead>
              <tr>
                <th>维度</th>
                <th>计划日期</th>
                <th>实际日期</th>
                <th>五状态</th>
                <th>业务时间</th>
                <th>写入时间</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              {evs.map((ev, i) => (
                <tr key={i}>
                  <td><b>{ev.dimension}</b></td>
                  <td>{ev.plannedDate ?? '—'}</td>
                  <td>{ev.actualDate ?? '—'}</td>
                  <td>
                    <span className={`rc-ev-label ev-${ev.state === '已完成未逾期' ? 'fact' : ev.state === '计划未知' ? 'na' : ev.state.includes('逾期') ? 'sign' : 'infer'}`}>
                      {ev.state}
                    </span>
                  </td>
                  <td className="rc-ev-time"><Clock size={11} /> {ev.businessTime}</td>
                  <td className="rc-ev-time"><Clock size={11} /> {ev.systemTime}</td>
                  <td>{ev.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="rc-evidence-legend">
          <Database size={12} />
          <span>五状态：</span>
          <span className="rc-ev-label ev-fact">已完成未逾期</span>
          <span className="rc-ev-label ev-sign">已完成逾期</span>
          <span className="rc-ev-label ev-infer">已到期未观测</span>
          <span className="rc-ev-label ev-infer">未到期未观测</span>
          <span className="rc-ev-label ev-na">计划未知</span>
        </div>
      </section>

      {/* ③ 为什么风险高 · 模型关注的因素（SHAP 白话化，借鉴 6.3 可读性要求） */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <Database size={16} />
          <h3>③ 为什么风险高 · 模型关注的因素</h3>
        </div>
        {shipment.shapTop3.length === 0 ? (
          <div className="rc-na-block">暂无模型关注因素</div>
        ) : (
          <div className="rc-shap-list">
            {shipment.shapTop3.map((s, i) => {
              const { value, raw, explain } = parseShap(s.contribution)
              const up = value >= 0
              const level = shapLevel(value)
              const label = up
                ? level === 3 ? '明显推高风险' : level === 2 ? '有所推高风险' : '影响轻微'
                : level === 3 ? '明显降低风险' : level === 2 ? '有所降低风险' : '影响轻微'
              return (
                <div key={i} className="rc-shap-item">
                  <span className="rc-shap-rank">#{i + 1}</span>
                  <div className="rc-shap-detail">
                    <b>{s.feature}</b>
                    <div className={`rc-shap-impact ${up ? 'up' : 'down'}`}>
                      <span className={`rc-shap-bar lv${level}`}><i /><i /><i /></span>
                      <em>{label}</em>
                      <code>{raw}</code>
                    </div>
                    {explain && <small>{explain.slice(1, -1)}</small>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ④ 流程定位 + 证据缺口 */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <Route size={16} />
          <h3>④ 流程定位 + 证据缺口</h3>
        </div>
        <div className="rc-stage-grid">
          {stageStatuses.map(s => {
            const cls =
              s.status === '已完成' ? 'stage-done' :
              s.status === '进行中' ? 'stage-active' :
              s.status === '证据缺口' ? 'stage-hot' : ''
            return (
              <div key={s.id} className={`rc-stage-card ${cls}`}>
                <div className="rc-stage-head">
                  <b>{s.id}</b>
                  <span>{s.label}</span>
                </div>
                <div className="rc-stage-status">{s.status}</div>
                {s.detail && <div className="rc-stage-detail">{s.detail}</div>}
              </div>
            )
          })}
        </div>
      </section>

      {/* ⑤ 措施情景模拟 */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <Gauge size={16} />
          <h3>⑤ 措施情景模拟</h3>
        </div>
        {scenarios.length === 0 ? (
          <div className="rc-na-block">无可干预措施（无已到期未观测或计划未知的状态）</div>
        ) : (
          <table className="rc-measure-table">
            <thead>
              <tr>
                <th>措施</th>
                <th>干预说明</th>
                <th>基线 p*</th>
                <th>干预后 p*</th>
                <th>变化</th>
                <th>效果</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => {
                const change = s.reduction
                const effective = Math.abs(change) > 0.05
                return (
                  <tr key={s.measure.id}>
                    <td><b>{s.measure.label}</b></td>
                    <td className="rc-ev-desc">{s.measure.desc}</td>
                    <td>{(s.baselinePStar * 100).toFixed(1)}%</td>
                    <td>{(s.intervenedPStar * 100).toFixed(1)}%</td>
                    <td className={effective ? 'rc-reduction' : ''}>
                      {change >= 0 ? '+' : ''}{(change * 100).toFixed(1)}pp
                    </td>
                    <td>
                      {effective ? (
                        <span className="rc-effect-ok">{change < 0 ? '有效降低' : '风险升高'}</span>
                      ) : (
                        <span className="rc-effect-na">边际</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ⑥ 处置动作 */}
      <section className="panel rc-section">
        <div className="rc-section-head">
          <Send size={16} />
          <h3>⑥ 处置动作</h3>
        </div>
        <div className="rc-disposition">
          <div className="rc-quadrant">
            <div className="rc-quadrant-label">
              <span>风险概率</span>
              <b className={`wb-risk ${riskLevel === '高' ? 'r-high' : 'r-low'}`}>{riskLevel}</b>
              <span>可信度</span>
              <b className={`wb-risk ${confLevel === '高' ? 'r-low' : 'r-med'}`}>{confLevel}</b>
            </div>
            <div className="rc-quadrant-action">
              <b>{quadrant.label}</b>
              <p>{quadrant.desc}</p>
            </div>
          </div>
          {/* 2×2 矩阵全貌 */}
          <table className="rc-matrix-table">
            <thead>
              <tr>
                <th>风险概率 \ 可信度</th>
                <th>高可信</th>
                <th>低可信</th>
              </tr>
            </thead>
            <tbody>
              <tr className={riskLevel === '高' && confLevel === '高' ? 'rc-matrix-active' : ''}>
                <td><b>高概率</b></td>
                <td>{quadrantMatrix['高']['高'].label}</td>
                <td>{quadrantMatrix['高']['低'].label}</td>
              </tr>
              <tr className={riskLevel === '低' && confLevel === '高' ? 'rc-matrix-active' : ''}>
                <td><b>低概率</b></td>
                <td>{quadrantMatrix['低']['高'].label}</td>
                <td>{quadrantMatrix['低']['低'].label}</td>
              </tr>
            </tbody>
          </table>
          {/* 处置任务进展（借鉴 6.4：跨部门协同任务的进展汇总至主风险卡） */}
          <div className="rc-disp-progress">
            <div className="rc-disp-progress-head">
              <ClipboardList size={13} />
              <b>处置任务进展</b>
              <small>{dispRecords.length} 条</small>
            </div>
            {dispRecords.length === 0 ? (
              <div className="rc-na-block">暂无关联处置任务</div>
            ) : (
              <table className="rc-disp-table">
                <thead>
                  <tr>
                    <th>记录</th>
                    <th>状态</th>
                    <th>处置路由</th>
                    <th>截止时间</th>
                    <th>裕量 W</th>
                    <th>结果回执</th>
                  </tr>
                </thead>
                <tbody>
                  {dispRecords.map(r => {
                    const st = DISP_STATUS_STYLE[r.status]
                    const wCls = r.wMarginHours > 0 ? 'ld-adopt-ok' : r.wMarginHours < 0 ? 'ld-adopt-no' : 'ld-adopt-pending'
                    return (
                      <tr key={r.id}>
                        <td><b>{r.id}</b></td>
                        <td>
                          <span className="ld-route" style={{ background: st.bg, color: st.color }}>
                            {r.status}
                          </span>
                        </td>
                        <td>{r.route}</td>
                        <td className="rc-disp-time">{r.deadline}</td>
                        <td>
                          <span className={wCls}>{r.wMarginHours > 0 ? '+' : ''}{r.wMarginHours}h</span>
                        </td>
                        <td className="rc-disp-result">{r.result || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="rc-transfer">
            <div className="rc-transfer-note">
              <ShieldAlert size={13} />
              <span>处置完成后可移交 AI 复盘中心，形成预警 → 复盘闭环</span>
            </div>
            <button
              className="button primary"
              onClick={() => onTransfer(shipment.key)}
            >
              <Send size={15} /> 移交 AI 复盘中心
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
