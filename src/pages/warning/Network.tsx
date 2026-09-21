/**
 * W3 网络与证据治理（newest.md 3.5 节 极简概率图 + 3.8.2 融合推断）
 *
 * 新版删除（问题2/问题3结论）：
 *   - 14 节点 DAG（8 事件 + 5 阶段 + 三态 G）
 *   - P(M|G) 桥接表（3×3）
 *   - 融合准入五条件 checklist
 *   - Feature Registry 字段分流审计表
 *   - 证据录入界面（证据由日期规则自动计算，4.1）
 *   - 融合/降级模式开关（ML 始终通过虚拟证据进入 BN）
 *
 * 保留三个子块：
 *   ① DAG 可视化：图3-2 极简结构 C/S → G ← V（虚拟证据）
 *   ② 条件频数表管理：展示 fusionModels[h] 的 θ(g,s) 总体表与 θ(c,g,s) 分区表
 *   ③ 字段说明表：newest.md 表3-1 核心字段与算法用途
 *
 * 不展示（问题4结论）：AP/Brier/命中率/召回率等实验评价指标（研究产物，非平台功能）。
 */

import { useState } from 'react'
import { GitBranch, Table2, Database, Check, X, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import {
  fusionGraph,
  fusionModelRaw,
  fusionModels,
  horizons,
  CALIBRATION_NOTE,
  DEMO_COUNTS_NOTE,
  type FusionGraphNode,
  type FusionGraphEdge,
} from '../../data/network'
import {
  G_STATE_LABELS,
  METHOD_LABELS,
  POOLED_SMOOTHING,
  LOCAL_SHRINKAGE,
} from '../../bn/engine'
import type { Horizon, LogisticCalibration } from '../../types'

// ===== 节点角色 → 样式（复用 14 节点 DAG 颜色族）=====
// observed → dag-event（蓝）；target → dag-g（红）；virtual 无专用样式，用 dag-event + 文字标识
function nodeRoleCls(node: FusionGraphNode): string {
  return node.role === 'target' ? 'dag-g' : 'dag-event'
}

// 节点角色标签色：虚拟/目标用警示橙；观测用中性灰
function roleTagCls(node: FusionGraphNode): string {
  return node.role === 'observed' ? 'src-ext' : 'src-expert'
}

function roleTagText(node: FusionGraphNode): string {
  if (node.role === 'virtual') return '虚拟'
  if (node.role === 'target') return '目标'
  return '观测'
}

// ===== 表3-1 字段说明（newest.md 3.2.1）=====
const FIELD_DOCS: { field: string; def: string; usage: string }[] = [
  { field: '最初ETD', def: '最初约定的计划开始时间', usage: '确定预测时点及目标事件的基准' },
  { field: 'ATD', def: '实际开始时间', usage: '构造历史结果标签与回放样本资格' },
  { field: '预计生产日期', def: '最初计划的生产完成日期', usage: '计算计划裕量与生产状态' },
  { field: '实际生产日期', def: '实际生产完成日期', usage: '按预测时点可见性构造进展' },
  { field: '计划与实际预付款日期', def: '最初付款约定及实际付款记录', usage: '形成付款进展与联合证据' },
  { field: '下货纸号', def: '同一航次关联标识', usage: '分组切分权重航次重抽样' },
  { field: '箱型、港口、国家、成交方式', def: '订单与运输属性', usage: '机器学习类别特征' },
  { field: '采购日期', def: '采购事件日期', usage: '按同一日期可见性规则构造特征' },
]

export function Network() {
  const [horizon, setHorizon] = useState<Horizon>('7天')
  const [showEdges, setShowEdges] = useState(false)
  const [showFieldTable, setShowFieldTable] = useState(true)

  const raw = fusionModelRaw[horizon]
  const compiled = fusionModels[horizon]
  const stateIds = raw.states.map(s => s.id)

  return (
    <div className="page net-page">
      {/* ① DAG 可视化（图3-2 极简概率图）*/}
      <section className="panel net-section">
        <div className="net-section-head">
          <GitBranch size={16} />
          <h3>DAG 网络结构</h3>
          <small className="net-section-sub">
            图3-2 极简概率图 · {fusionGraph.nodes.length} 节点 · {fusionGraph.edges.length} 条边
          </small>
        </div>

        <div className="dag-container">
          <div className="dag-layer">
            <div className="dag-layer-label">观测 / 目标 / 虚拟</div>
            <div className="dag-layer-nodes">
              {fusionGraph.nodes.map(node => (
                <div
                  key={node.id}
                  className={`dag-node ${nodeRoleCls(node)}`}
                  title={node.desc}
                  style={{ cursor: 'default' }}
                >
                  <b>{node.id}</b>
                  <span>{node.label.replace(/^[CSGV] /, '')}</span>
                  <em className={`dag-src ${roleTagCls(node)}`}>{roleTagText(node)}</em>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 边说明（可折叠）*/}
        <div className="dag-edges">
          <button className="dag-edges-toggle" onClick={() => setShowEdges(!showEdges)}>
            {showEdges ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
            边元数据（{fusionGraph.edges.length} 条 · 含业务说明）
          </button>
          {showEdges && (
            <table className="dag-edge-table">
              <thead>
                <tr>
                  <th>源</th>
                  <th>→</th>
                  <th>目标</th>
                  <th>业务说明</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {fusionGraph.edges.map((e: FusionGraphEdge, i: number) => (
                  <tr key={i}>
                    <td><b>{e.from}</b></td>
                    <td>→</td>
                    <td>
                      <b>{e.to}</b>
                      {e.virtual ? (
                        <em className="dag-src src-expert" style={{ marginLeft: 6 }}>虚拟</em>
                      ) : null}
                    </td>
                    <td className="dag-edge-desc">{e.desc}</td>
                    <td className="dag-edge-exc">{e.virtual ? '虚拟证据连接' : '实体边'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ② 条件频数表管理（替代旧版 CPT 管理）*/}
      <section className="panel net-section">
        <div className="net-section-head">
          <Table2 size={16} />
          <h3>条件频数表管理</h3>
          <small className="net-section-sub">
            式3-12 / 3-13 / 3-14 · 对称平滑 {POOLED_SMOOTHING} · 局部收缩 {LOCAL_SHRINKAGE}
          </small>
        </div>

        {/* 提前期切换 */}
        <div className="cpt-node-list">
          {horizons.map(h => (
            <button
              key={h}
              className={`cpt-node-chip ${horizon === h ? 'active' : ''}`}
              onClick={() => setHorizon(h)}
            >
              {h}
            </button>
          ))}
        </div>

        {/* 模型元数据 + 校准系数 */}
        <div className="cpt-detail" style={{ marginBottom: 12 }}>
          <div className="cpt-header">
            <div className="cpt-title">
              <b className="dag-node-mini dag-g">{horizon}</b>
              <span>{raw.mlModelVersion}</span>
            </div>
            <div className="cpt-meta">
              <span>拟合订单：{raw.fittedOrders}</span>
              <span>条件表版本：{raw.conditionTableVersion}</span>
              <span>虚拟证据版本：{raw.virtualEvidenceVersion}</span>
            </div>
          </div>

          <table className="cpt-table">
            <thead>
              <tr>
                <th>校准阶段</th>
                <th>融合方法</th>
                <th className="cpt-state-col">斜率</th>
                <th className="cpt-state-col">截距</th>
                <th className="cpt-state-col">拟合订单数</th>
              </tr>
            </thead>
            <tbody>
              <CalibRow label="第一次校准（p_raw → q）" method="—" params={raw.firstCalibration} />
              <CalibRow label="第二次校准（r → p*）" method={METHOD_LABELS.conditional} params={raw.secondCalibration.conditional} />
              <CalibRow label="第二次校准（r → p*）" method={METHOD_LABELS.pooled} params={raw.secondCalibration.pooled} />
              <CalibRow label="对照独立ML第二次校准" method="—" params={raw.standaloneSecondCalibration} />
            </tbody>
          </table>

          <div className="cpt-source-note">
            <Layers size={12} />
            <span>{CALIBRATION_NOTE}</span>
          </div>
        </div>

        {/* 总体条件频数表 θ(g,s)（式3-12，不分层融合使用）*/}
        <FreqTable
          title="θ(g,s) 总体条件频数表"
          subtitle={'式3-12 · 不分层融合使用 · 状态数 K = ' + String(compiled.K)}
          stateIds={stateIds}
          rows={compiled.thetaPooled}
        />

        {/* 分区条件频数表 θ(c,g,s)（式3-13，条件融合使用）*/}
        {compiled.bins.map(bin => (
          <FreqTable
            key={bin.id}
            title={bin.id + ' ' + bin.label}
            subtitle={
              '式3-13 · n(c)=' + bin.total +
              ' · π(c,g)=[' + bin.pi[0].toFixed(4) + ', ' + bin.pi[1].toFixed(4) + ']' +
              ' · 先验和=' + (bin.pi[0] + bin.pi[1]).toFixed(6)
            }
            stateIds={stateIds}
            rows={bin.theta}
          />
        ))}

        <div className="cpt-source-note">
          <Layers size={12} />
          <span>{DEMO_COUNTS_NOTE}</span>
        </div>
      </section>

      {/* ③ 字段说明表（newest.md 表3-1，替代旧版 Feature Registry）*/}
      <section className="panel net-section">
        <div className="net-section-head">
          <Database size={16} />
          <h3>字段说明表</h3>
          <small className="net-section-sub">newest.md 表3-1 核心字段与算法用途</small>
          <button className="net-toggle-btn" onClick={() => setShowFieldTable(!showFieldTable)}>
            {showFieldTable ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
            {showFieldTable ? '收起' : '展开'}
          </button>
        </div>

        {showFieldTable && (
          <>
            <table className="net-fr-table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>业务定义</th>
                  <th>算法用途</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_DOCS.map(f => (
                  <tr key={f.field}>
                    <td><b>{f.field}</b></td>
                    <td className="dag-edge-desc">{f.def}</td>
                    <td className="dag-edge-exc">{f.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="net-fr-summary">
              <Layers size={12} />
              <span>日期字段保持原始含义；实际记录次日00:00 为日粒度可见边界；最初计划按已确认口径处理</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ===== 频数表子组件（θ 行：G=0 未晚开 / G=1 晚开）=====
function FreqTable({
  title,
  subtitle,
  stateIds,
  rows,
}: {
  title: string
  subtitle: string
  stateIds: string[]
  rows: [number[], number[]]
}) {
  return (
    <div className="cpt-detail" style={{ marginBottom: 12 }}>
      <div className="cpt-header">
        <div className="cpt-title">
          <b className="dag-node-mini dag-event">{title}</b>
          <span>{subtitle}</span>
        </div>
      </div>
      <table className="cpt-table">
        <thead>
          <tr>
            <th>G</th>
            {stateIds.map(id => (
              <th key={id} className="cpt-state-col">{id}</th>
            ))}
            <th>行和</th>
          </tr>
        </thead>
        <tbody>
          {([0, 1] as const).map(g => {
            const row = rows[g]
            const sum = row.reduce((a, b) => a + b, 0)
            const ok = Math.abs(sum - 1) < 1e-6
            return (
              <tr key={g}>
                <td className="cpt-parent-state">{G_STATE_LABELS[g]}（G={g}）</td>
                {row.map((v, i) => (
                  <td key={i} className="cpt-prob">{v.toFixed(4)}</td>
                ))}
                <td className={`cpt-sum ${ok ? 'ok' : 'err'}`}>
                  {ok ? <Check size={11}/> : <X size={11}/>} {sum.toFixed(6)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ===== 校准参数行组件 =====
function CalibRow({
  label,
  method,
  params,
}: {
  label: string
  method: string
  params: LogisticCalibration
}) {
  return (
    <tr>
      <td className="cpt-parent-state">{label}</td>
      <td>{method}</td>
      <td className="cpt-prob">{params.slope.toFixed(6)}</td>
      <td className="cpt-prob">{params.intercept.toFixed(6)}</td>
      <td className="cpt-prob">{params.fittedCount}</td>
    </tr>
  )
}
