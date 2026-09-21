// Agent 会诊页（自 main.tsx 原样迁出，内容未改动）
import React from 'react'
import { Check, ChevronRight, RotateCcw } from 'lucide-react'
import { agents } from '../../data/review'
import { Message, PanelHead, Status, type AgentStatus } from '../../components/ui'

export function Agents({running,step,statusFor}:{running:boolean,step:number,statusFor:(i:number)=>AgentStatus}) {
  // 会诊真正完成需 step 到达末位（6 位专家索引 0–5）；仅 !running 不足以判定
  const finished = step >= agents.length - 1
  const pillCls = running ? 'processing' : finished ? 'success' : 'warning'
  const pillContent = running
    ? <><RotateCcw className="spin" size={14}/> 会诊中 · {Math.min(step+1,agents.length)}/{agents.length}</>
    : finished
    ? <><Check size={14}/> 会诊已完成</>
    : <><ChevronRight size={14}/> 尚未运行会诊</>
  return <div className="page">
    <div className="page-title"><div><h2>顺序会诊流水线</h2><p>每位专家仅基于上游结构化结果和授权证据作出判断。</p></div><span className={`status-pill ${pillCls}`}>{pillContent}</span></div>
    <div className="agent-flow">{agents.map((a,i)=>{const s=statusFor(i);const Icon=a.icon;return <div className="agent-cell" key={a.name}><article className={`agent-card ${s}`}>
      <div className="agent-top"><div className="agent-icon"><Icon size={20}/></div><div><h3>{a.name}</h3><span>{a.role}</span></div><Status status={s}/></div>
      <p>{s==='waiting'?'等待上游结构化结果…':s==='running'?'正在核验证据并生成结构化结论…':a.summary}</p>
      <div className="agent-foot"><span>{s==='done'?a.confidence:'—'}</span><span>{s==='done'?`${a.evidence} 条证据`:'尚未输出'}</span></div>
    </article>{i<agents.length-1&&<ChevronRight className="flow-arrow" size={20}/>}</div>})}</div>
    <section className="panel conversation">
      <PanelHead title="会诊纪要" action="证据链完整"/>
      <div className="messages">
        <Message who="物流专家" text="工厂备货是首个主要原生异常。提箱、报关虽均较计划晚约7天，但没有产生等量新增延误。" cite="EV-006 · 工厂备货记录"/>
        <Message who="船司专家" text="原船期窗口因上游延误已不可满足，但船司后续改船与实际晚开仍贡献约4.9天净新增影响。" cite="EV-011 · 船期变更记录"/>
        <Message who="法务专家" text="FOB仅规定风险转移与费用边界，不能单独推导全部延误责任；需结合订舱委托和SLA。" cite="CT-003 · FOB条款"/>
        <Message who="主持代理" text="采纳三方事实结论。船司SLA附件仍未提供，该部分责任维持“建议结论”，交由人工复核。" cite="证据缺口 GAP-001" accent/>
      </div>
    </section>
  </div>
}
