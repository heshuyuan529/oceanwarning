// 案件总览页（自 main.tsx 迁出 + 第 7 步增加来源标记）
import { AlertTriangle, Gavel, Play, Radar } from 'lucide-react'
import { events, responsibility } from '../../data/review'
import { Meta, Metric, PanelHead, Tag } from '../../components/ui'
import type { ReviewTab } from '../../types'

export function Overview({onNavigate,onStart,fromWarning,transferredKey}:{onNavigate:(t:ReviewTab)=>void,onStart:()=>void,fromWarning?:boolean,transferredKey?:string|null}) {
  return <div className="page">
    {fromWarning && (
      <div className="ov-source-banner">
        <Radar size={14}/>
        <span>来源：风险预警平台 · {transferredKey} · 处置记录已纳入复盘责任判定</span>
      </div>
    )}
    <section className="case-banner">
      <div><span className="status-pill warning"><AlertTriangle size={14}/> 待人工复核</span><h2>最终交付延误 15.0 天</h2><p>工厂备货、船司改船晚开及目的港拥堵共同影响，原始延误时长存在重叠，不能简单相加。</p></div>
      <div className="case-meta"><Meta label="贸易术语" value="FOB 青岛"/><Meta label="船司" value="C 船公司"/><Meta label="船名航次" value="OCEAN STAR / 072W"/><Meta label="计划离港" value="2026-07-12"/></div>
    </section>

    <div className="metrics">
      <Metric label="最终延误" value="15.0" unit="天" note="较计划到港" tone="danger"/>
      <Metric label="原生异常" value="2" unit="个" note="工厂备货、装船发运"/>
      <Metric label="证据完整度" value="92" unit="%" note="缺少1份合同附件" tone="good"/>
      <Metric label="综合可信度" value="82" unit="%" note="可进入人工复核" tone="good"/>
    </div>

    <div className="grid-main">
      <section className="panel">
        <PanelHead title="关键事件链" action="查看完整时间轴" onClick={()=>onNavigate('timeline')}/>
        <div className="mini-timeline">
          {[events[2],events[4],events[6],events[8],events[9]].map((e,i)=><div className="mini-event" key={e.name}>
            <div className={`event-dot ${e.type==='原生延误'?'danger':e.type==='传导延误'?'warn':'ok'}`}>{i+1}</div>
            <div><b>{e.name}</b><span>{e.actual}</span></div><Tag type={e.type}/>
          </div>)}
        </div>
      </section>
      <section className="panel">
        <PanelHead title="建议责任分布" action="进入人工复核" onClick={()=>onNavigate('review')}/>
        <div className="stacked-bar">{responsibility.map(x=><span key={x.name} style={{width:`${x.pct}%`,background:x.color}}/>)}</div>
        <div className="legend">{responsibility.map(x=><div key={x.name}><i style={{background:x.color}}/><span>{x.name}</span><b>{x.pct}%</b></div>)}</div>
        <div className="method-note"><Gavel size={17}/><span>比例是延误影响与合同规则结合后的建议，不代表法律裁决。</span></div>
        {fromWarning && (
          <div className="ov-disposition-note">
            <AlertTriangle size={13}/>
            <span>本案件含风险预警处置记录：已采纳 2 条、待定 1 条。处置了怎么追责、不处置怎么追责，均在处置台账中留痕。</span>
          </div>
        )}
      </section>
    </div>
    <section className="panel action-panel"><div><h3>顺序会诊已准备就绪</h3><p>六个 AI 角色将依次处理事实、物流、船司、关务、合同与责任整合。</p></div><button className="button primary" onClick={onStart}><Play size={16}/> 开始会诊</button></section>
  </div>
}
