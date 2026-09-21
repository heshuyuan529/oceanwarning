/**
 * W4 处置台账（newest.md 第四章 4.4/4.5/4.6 节）
 *
 * 旧版 5 路由 + 强制规则记录区已删除，改为：
 * 1. 运营指标卡：基于任务状态机与双维评价（4.4/4.5/4.6）
 * 2. 处置记录表：2×2 处置路由 + 任务状态机 + 剩余干预裕量 W + 双维评价 + 六时间点
 *
 * 不展示：强制规则记录区（newest.md 2.4 节"未提及"，已删除）。
 */

import { Fragment, useState } from 'react'
import { ClipboardList, BarChart3, Check, X, Clock, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react'
import { dispositionRecords, opsMetrics, getRouteStats } from '../../data/disposition'
import type { DispositionRecord, DispositionRoute, DispositionStatus } from '../../types'

// 2×2 处置路由徽章颜色（复用旧 ld-route 调色板）
const routeBadge: Record<DispositionRoute, string> = {
  '启动跨部门处置': 'rt-hh',       // 橙·高优先级
  '优先补证或人工核验': 'rt-ev',   // 蓝·核验
  '常规监控': 'rt-low',            // 绿·常规
  '补充数据后再判断': 'rt-mid',    // 黄·补数据
}

// 任务状态机徽章颜色（inline，避免新增 CSS 类）
const statusStyle: Record<DispositionStatus, { bg: string; color: string }> = {
  '待核验': { bg: '#eef1f4', color: '#6b7a89' },
  '已分派': { bg: '#e8edf0', color: '#245b88' },
  '处理中': { bg: '#fff7db', color: '#9e791a' },
  '待验证': { bg: '#fff0e9', color: '#c6532c' },
  '已关闭': { bg: '#e7f4ed', color: '#287358' },
  '已升级': { bg: '#ffe4dc', color: '#a83217' },
}

// 剩余干预裕量 W 样式：正=绿，负=红，0=灰
function marginCls(w: number): { cls: string; sign: string } {
  if (w > 0) return { cls: 'ld-adopt-ok', sign: '+' }
  if (w < 0) return { cls: 'ld-adopt-no', sign: '' }
  return { cls: 'ld-adopt-pending', sign: '' }
}

// ===== 4.4 六个关键时间点（告警生成/送达/签收/首次响应/动作完成/效果确认）=====
type TimelineKey =
  | 'alertTime' | 'deliveryTime' | 'signTime'
  | 'firstResponseTime' | 'actionCompleteTime' | 'effectConfirmTime'

const TIMELINE_STEPS: { key: TimelineKey; label: string }[] = [
  { key: 'alertTime', label: '告警生成' },
  { key: 'deliveryTime', label: '送达' },
  { key: 'signTime', label: '签收' },
  { key: 'firstResponseTime', label: '首次响应' },
  { key: 'actionCompleteTime', label: '动作完成' },
  { key: 'effectConfirmTime', label: '效果确认' },
]

// 六时间点时间线（借鉴 6.4：任务详情时间线，数据已在 DispositionRecord 中）
function RecordTimeline({ record }: { record: DispositionRecord }) {
  return (
    <div className="ld-timeline">
      {TIMELINE_STEPS.map(s => {
        const t: string | null = record[s.key]
        return (
          <div key={s.key} className={`ld-tl-step ${t ? 'done' : ''}`}>
            <span className="ld-tl-dot" />
            <span className="ld-tl-label">{s.label}</span>
            <span className="ld-tl-time">{t || '待记录'}</span>
          </div>
        )
      })}
    </div>
  )
}

// 建议与执行对照（借鉴 6.4：保留原建议及修改理由，不以新方案覆盖既有决策历史）
function ActionCompare({ record }: { record: DispositionRecord }) {
  const actual = record.actualAction
  const actualText = !actual
    ? record.adopted === false ? '未执行（建议未采纳）' : '待执行'
    : actual === record.action ? '按原建议执行' : actual

  return (
    <div className="ld-compare">
      <div className="ld-compare-head">
        <b>建议与执行对照</b>
        <small>保留原建议与修改理由 · 不覆盖决策历史</small>
      </div>
      <div className="ld-compare-grid">
        <div className="ld-compare-item">
          <span>原建议</span>
          <p>{record.action}</p>
        </div>
        <div className={`ld-compare-item ${actual && actual !== record.action ? 'adjusted' : ''}`}>
          <span>实际动作</span>
          <p>{actualText}</p>
        </div>
      </div>
      {record.adopted === false && (record.rejectReason || record.rejectCategory) && (
        <div className="ld-compare-reject">
          <span
            className="ld-route"
            style={{ background: '#ffe4dc', color: '#a83217', flexShrink: 0 }}
          >
            {record.rejectCategory || '未分类'}
          </span>
          <p>{record.rejectReason || '未说明理由'}</p>
        </div>
      )}
      {record.result && (
        <div className="ld-compare-result">
          <span>结果回执</span>
          <p>{record.result}</p>
        </div>
      )}
    </div>
  )
}

interface LedgerProps {
  onNavigateToCard?: (key: string) => void
}

export function Ledger({ onNavigateToCard }: LedgerProps = {}) {
  const [filter, setFilter] = useState<'全部' | DispositionRoute | '未采纳'>('全部')
  const [statusFilter, setStatusFilter] = useState<'全部' | DispositionStatus>('全部')
  // 展开时间线详情的记录 ID
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const routeStats = getRouteStats()

  const filtered = dispositionRecords.filter(r => {
    if (filter === '未采纳') {
      if (r.adopted !== false) return false
    } else if (filter !== '全部' && r.route !== filter) {
      return false
    }
    if (statusFilter !== '全部' && r.status !== statusFilter) return false
    return true
  })

  // 统计
  const total = dispositionRecords.length
  const adopted = dispositionRecords.filter(r => r.adopted === true).length
  const rejected = dispositionRecords.filter(r => r.adopted === false).length
  const pending = dispositionRecords.filter(r => r.adopted === null).length

  // 任务状态分布（用于状态机筛选 chip）
  const statusCounts: Record<DispositionStatus, number> = {
    '待核验': 0, '已分派': 0, '处理中': 0, '待验证': 0, '已关闭': 0, '已升级': 0,
  }
  for (const r of dispositionRecords) statusCounts[r.status]++

  return (
    <div className="page ld-page">
      {/* 1. 运营指标卡 */}
      <section className="panel net-section">
        <div className="net-section-head">
          <BarChart3 size={16} />
          <h3>运营指标</h3>
          <small className="net-section-sub">4.4 任务状态机 · 4.5 剩余干预裕量 · 4.6 双维评价 · 演示数据</small>
        </div>
        <div className="ld-metrics">
          {opsMetrics.map(m => (
            <div key={m.id} className={`ld-metric ${m.tone || ''}`}>
              <span>{m.label}</span>
              <div className="ld-metric-val">
                <b>{m.value}</b><em>{m.unit}</em>
              </div>
              <small>{m.desc}</small>
            </div>
          ))}
        </div>
      </section>

      {/* 2. 处置记录台账 */}
      <section className="panel net-section">
        <div className="net-section-head">
          <ClipboardList size={16} />
          <h3>处置记录台账</h3>
          <small className="net-section-sub">
            {total} 条 · 已采纳 {adopted} · 未采纳 {rejected} · 待定 {pending}
          </small>
        </div>

        {/* 路由筛选（2×2）*/}
        <div className="ld-filters">
          <button
            className={filter === '全部' ? 'selected' : ''}
            onClick={() => setFilter('全部')}
          >全部 ({total})</button>
          {(Object.entries(routeStats) as [DispositionRoute, number][]).map(([route, count]) => (
            <button
              key={route}
              className={filter === route ? 'selected' : ''}
              onClick={() => setFilter(route)}
            >
              {route} ({count})
            </button>
          ))}
          <button
            className={filter === '未采纳' ? 'selected' : ''}
            onClick={() => setFilter('未采纳')}
          >
            未采纳 ({rejected})
          </button>
        </div>

        {/* 任务状态机筛选 */}
        <div className="ld-filters" style={{ marginTop: 6 }}>
          <button
            className={statusFilter === '全部' ? 'selected' : ''}
            onClick={() => setStatusFilter('全部')}
          >全部状态</button>
          {(Object.entries(statusCounts) as [DispositionStatus, number][]).map(([st, cnt]) => (
            cnt > 0 && (
              <button
                key={st}
                className={statusFilter === st ? 'selected' : ''}
                onClick={() => setStatusFilter(st)}
              >
                {st} ({cnt})
              </button>
            )
          ))}
        </div>

        <table className="ld-table">
          <thead>
            <tr>
              <th>记录ID</th>
              <th>Shipment</th>
              <th>任务状态</th>
              <th>处置路由</th>
              <th>动作</th>
              <th>责任人</th>
              <th>截止时间</th>
              <th>裕量 W</th>
              <th>采纳</th>
              <th>双维评价</th>
              <th>关联风险卡</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const m = marginCls(r.wMarginHours)
              const stStyle = statusStyle[r.status]
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>
                      <button
                        className="ld-expand-btn"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        title="展开/收起六时间点时间线"
                      >
                        {expandedId === r.id ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                        <b>{r.id}</b>
                      </button>
                    </td>
                    <td><b>{r.shipmentKey}</b></td>
                    <td>
                      <span
                        className="ld-route"
                        style={{ background: stStyle.bg, color: stStyle.color }}
                        title={`任务状态机：${r.status}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span className={`ld-route ${routeBadge[r.route]}`}>{r.route}</span>
                    </td>
                    <td className="ld-action">{r.action}</td>
                    <td>{r.responsibleRole}</td>
                    <td className="ld-time"><Clock size={10} /> {r.deadline}</td>
                    <td>
                      <span className={m.cls}>
                        {m.sign}{r.wMarginHours}h
                      </span>
                    </td>
                    <td>
                      {r.adopted === true ? (
                        <span className="ld-adopt-ok"><Check size={11}/> 已采纳</span>
                      ) : r.adopted === false ? (
                        <span className="ld-adopt-no"><X size={11}/> 未采纳</span>
                      ) : (
                        <span className="ld-adopt-pending">待定</span>
                      )}
                    </td>
                    <td>
                      {r.businessResult || r.processDuty ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {r.businessResult && (
                            <span style={{ fontSize: 9, color: '#24313f' }}>
                              业务：{r.businessResult}
                            </span>
                          )}
                          {r.processDuty && (
                            <span style={{ fontSize: 9, color: '#516171' }}>
                              履职：{r.processDuty}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="ld-adopt-pending">—</span>
                      )}
                    </td>
                    <td>
                      {onNavigateToCard ? (
                        <button
                          className="ld-card-link"
                          onClick={() => onNavigateToCard(r.relatedRiskCard)}
                        >
                          {r.relatedRiskCard} <ChevronRight size={11}/>
                        </button>
                      ) : (
                        <span className="ld-card-link-static">{r.relatedRiskCard}</span>
                      )}
                    </td>
                  </tr>
                  {/* 展开行：4.4 六时间点时间线 + 6.4 建议与执行对照 */}
                  {expandedId === r.id && (
                    <tr className="ld-tl-row">
                      <td colSpan={11}>
                        <RecordTimeline record={r} />
                        <ActionCompare record={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {/* 剩余干预裕量公式说明 */}
        <div className="ld-rule-note">
          <AlertTriangle size={13} />
          <span>
            4.5 剩余干预裕量 W = t_deadline − t_now − T_exec（式4-1，小时）；
            W &gt; 0 仅表示时间条件初步满足，还需核验舱位/车源/箱源/单证/费用审批/岗位权限；
            W &lt; 0 表示窗口已关闭，应评估替代方案并升级协调。
          </span>
        </div>
      </section>
    </div>
  )
}
