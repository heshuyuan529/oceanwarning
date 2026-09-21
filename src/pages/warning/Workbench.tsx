/**
 * W1 预警工作台（任务列表页）
 *
 * 依据 newest.md 表4-1 / 表4-2：
 * - 任务列表按最终概率 p* 降序排列（进入优先核查队列）
 * - 风险等级二态（高/低），阈值 p* ≥ 0.5
 * - 可信度二态（高/低），阈值 Ci ≥ 0.6
 * - 2×2 处置矩阵象限标记（高高→跨部门处置 等）
 * - p* 由后端 /api/predict 推理（LightGBM + 贝叶斯融合），前端不再本地计算
 * - 支持上传 Excel/CSV 订单文件，新增行与演示订单合并排序
 */

import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Upload } from 'lucide-react'
import { shipments, orderInputs } from '../../data/shipments'
import { predictBatch, toScoreTrace, ApiError } from '../../api/predict'
import type { PredictResponse, OrderInput } from '../../api/predict'
import { UploadPanel } from '../../components/UploadPanel'
import type { ScoreTrace } from '../../bn/engine'
import type { Shipment, Horizon } from '../../types'

// 演示参考日期（实际部署时替换为 new Date()）
const TODAY = new Date('2026-09-15T00:00:00')

function daysUntil(cutoff: string): number {
  const d = new Date(cutoff)
  return Math.ceil((d.getTime() - TODAY.getTime()) / 86400000)
}

type RiskLevel = '高' | '低'
type ConfidenceLevel = '高' | '低'

function classifyRisk(pStar: number): RiskLevel {
  return pStar >= 0.5 ? '高' : '低'
}

function classifyConfidence(ci: number): ConfidenceLevel {
  return ci >= 0.6 ? '高' : '低'
}

const quadrantLabel: Record<RiskLevel, Record<ConfidenceLevel, string>> = {
  '高': { '高': '跨部门处置', '低': '优先补证' },
  '低': { '高': '常规监控', '低': '补充数据' },
}

const riskCls: Record<string, string> = { '高': 'r-high', '低': 'r-low' }

interface RowData {
  /** 演示订单引用；上传订单为 null */
  shipment: Shipment | null
  /** 上传订单的原始字段（演示订单也为已上传字段填一份，便于统一展示） */
  order: OrderInput
  /** 行唯一 key（演示用 shipment.key，上传用 UP-idx-fileName） */
  rowKey: string
  trace: ScoreTrace
  pStar: number
  pRaw: number
  riskLevel: RiskLevel
  confLevel: ConfidenceLevel
  quadrant: string
}

/** 上传订单的可信度（演示订单有 s.confidence，上传订单默认中等） */
const UPLOAD_DEFAULT_CI = 0.5

/**
 * 把后端 PredictResponse 数组转为 RowData 数组。
 * 演示订单关联 shipment，上传订单 shipment=null，靠 order 字段展示。
 */
function responsesToRows(
  horizon: Horizon,
  group: { shipment?: Shipment; order: OrderInput }[],
  resp: PredictResponse[],
  filename?: string,
): RowData[] {
  const out: RowData[] = []
  resp.forEach((r, i) => {
    const trace = toScoreTrace(r.score)
    const rl = classifyRisk(trace.pStar)
    const ci = group[i].shipment?.confidence ?? UPLOAD_DEFAULT_CI
    const cl = classifyConfidence(ci)
    const order = r.order ?? group[i].order
    const shipment = group[i].shipment ?? null
    out.push({
      shipment,
      order,
      rowKey: shipment
        ? shipment.key
        : `UP-${i}-${filename ?? 'upload'}`,
      trace,
      pStar: trace.pStar,
      pRaw: r.p_raw,
      riskLevel: rl,
      confLevel: cl,
      quadrant: quadrantLabel[rl][cl],
    })
  })
  return out
}

/**
 * 按提前期分桶，同桶订单批量请求 /api/predict（避免不同 horizon 的订单混在一起）。
 * 后端响应与请求 orders 数组按序一一对应。
 */
async function fetchAllRows(): Promise<RowData[]> {
  const buckets = new Map<Horizon, Shipment[]>()
  for (const s of shipments) {
    const arr = buckets.get(s.horizon) ?? []
    arr.push(s)
    buckets.set(s.horizon, arr)
  }

  const rows: RowData[] = []
  for (const [horizon, group] of buckets) {
    const orders = group.map(s => orderInputs[s.key])
    const resp: PredictResponse[] = await predictBatch(horizon, orders, {
      standalone: true,
      interventions: false,
    })
    rows.push(...responsesToRows(
      horizon,
      group.map(s => ({ shipment: s, order: orderInputs[s.key] })),
      resp,
    ))
  }
  return rows
}

export function Workbench({ onSelect }: { onSelect: (key: string) => void }) {
  const [filter, setFilter] = useState('全部')
  const [rows, setRows] = useState<RowData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // 挂载即拉取：每票任务交由后端推理 p_raw → 融合 → p*
  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchAllRows()
      .then(data => {
        if (!cancelled) setRows(data)
      })
      .catch(e => {
        if (cancelled) return
        const msg = e instanceof ApiError ? e.message : (e as Error).message
        setError(`后端推理失败：${msg}`)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** 上传成功后：把响应追加到现有 rows（同 horizon 才能合并，否则只追加） */
  function handleUploadResult(horizon: Horizon, resp: PredictResponse[], file: File) {
    if (!rows) return
    // 上传订单没有 shipment 元数据；用 order 字段构造 group
    const group = resp.map(r => ({ order: r.order ?? ({} as OrderInput) }))
    const newRows = responsesToRows(horizon, group, resp, file.name)
    setRows([...rows, ...newRows])
    setShowUpload(false)
  }

  // 按 p* 降序
  const sorted = useMemo(() => {
    if (!rows) return []
    return [...rows].sort((a, b) => b.pStar - a.pStar)
  }, [rows])

  const filtered = filter === '全部' ? sorted : sorted.filter(r => r.riskLevel === filter)

  // 统计
  const stats = useMemo(() => {
    if (!rows) return { 高: 0, 低: 0, 低可信: 0 }
    return {
      高: rows.filter(r => r.riskLevel === '高').length,
      低: rows.filter(r => r.riskLevel === '低').length,
      低可信: rows.filter(r => r.confLevel === '低').length,
    }
  }, [rows])
  const totalAlerts = stats.高
  const capacity = 4 // 人工可处理容量/批次

  return (
    <div className="page wb-page">
      {/* 统计条 */}
      <div className="wb-stat-bar">
        <div className="wb-stat">
          <span>高概率</span><b className="wb-s-high">{stats.高}</b>
        </div>
        <div className="wb-stat">
          <span>低概率</span><b className="wb-s-low">{stats.低}</b>
        </div>
        <div className="wb-stat">
          <span>低可信</span><b className="wb-s-med">{stats.低可信}</b>
        </div>
        <div className="wb-capacity">
          <span>待处置告警</span><b>{totalAlerts}</b>
          <div className="wb-progress"><span style={{ width: `${Math.min(totalAlerts / capacity * 100, 100)}%` }} /></div>
          <small>可处理 {capacity}/批次</small>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="wb-filters">
        {['全部', '高', '低'].map(f => (
          <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>
            {f === '全部' ? '全部' : f === '高' ? '高概率' : '低概率'}
          </button>
        ))}
        <button
          className="wb-upload-btn"
          onClick={() => setShowUpload(true)}
          disabled={rows === null}
          title="上传 Excel/CSV 订单文件，后端推理后追加到列表"
        >
          <Upload size={14} /> 上传订单
        </button>
      </div>

      {showUpload && (
        <UploadPanel
          onResult={handleUploadResult}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* 任务列表 */}
      <section className="panel wb-table-panel">
        {error ? (
          <div className="wb-placeholder">
            <b>无法加载任务列表</b>
            <p>{error}</p>
            <p style={{ marginTop: 8, color: '#6b7a89' }}>
              请确认 .env 中 VITE_API_BASE 指向运行中的后端（默认 http://localhost:8000）。
            </p>
          </div>
        ) : rows === null ? (
          <div className="wb-placeholder">
            <b>加载中…</b>
            <p>正在调用后端 /api/predict 进行 LightGBM 推理与贝叶斯融合</p>
          </div>
        ) : (
          <table className="wb-table">
            <thead>
              <tr>
                <th>Shipment Key</th>
                <th>港对</th>
                <th>船期</th>
                <th>提前期</th>
                <th>箱型</th>
                <th>距截港</th>
                <th>p_raw</th>
                <th>p*（最终）</th>
                <th>风险</th>
                <th>Ci</th>
                <th>处置象限</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const s = r.shipment
                const order = r.order
                // 上传订单没有 cutoffTime，用 etd 作为参考；演示订单用 cutoffTime
                const cutoff = s?.cutoffTime ?? order.etd
                const days = daysUntil(cutoff)
                // 上传订单：onSelect 不可用（没有 shipment 详情页），改用 disabled 行
                const isUpload = s === null
                return (
                  <tr
                    key={r.rowKey}
                    className={`wb-row${isUpload ? ' wb-row-upload' : ''}`}
                    onClick={isUpload ? undefined : () => onSelect(s!.key)}
                    title={isUpload ? '上传订单暂不支持查看风险卡详情（仅展示后端推理结果）' : undefined}
                  >
                    <td>
                      <b>{isUpload ? r.rowKey : s!.key}</b>
                      {isUpload && <small className="wb-row-tag">上传</small>}
                    </td>
                    <td>{order.origin} → {order.destination}</td>
                    <td>{order.etd}</td>
                    <td>{s?.horizon ?? ''}</td>
                    <td>{order.container_type}</td>
                    <td className={days < 0 ? 'wb-past' : days <= 2 ? 'wb-urgent' : ''}>
                      {days < 0 ? `已过${-days}天` : days === 0 ? '今日' : `${days}天`}
                    </td>
                    <td>{(r.pRaw * 100).toFixed(1)}%</td>
                    <td>
                      <div className="wb-g-bar">
                        <span style={{ width: `${r.pStar * 100}%` }} />
                        <em>{(r.pStar * 100).toFixed(1)}%</em>
                      </div>
                    </td>
                    <td><span className={`wb-risk ${riskCls[r.riskLevel]}`}>{r.riskLevel}</span></td>
                    <td>
                      <span className={r.confLevel === '低' ? 'wb-na' : ''}>
                        {((s?.confidence ?? UPLOAD_DEFAULT_CI) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td><span className="wb-quadrant-tag">{r.quadrant}</span></td>
                    <td>{isUpload ? null : <ChevronRight size={14} className="wb-chevron" />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
