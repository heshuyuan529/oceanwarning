// 人工复核与签发页（自 main.tsx 原样迁出，内容未改动）
import { useState } from 'react'
import { AlertTriangle, Check, ClipboardCheck, FolderOpen, Sparkles } from 'lucide-react'
import { responsibility } from '../../data/review'

export function Review({signed,onSign}:{signed:boolean,onSign:()=>void}) {
  const [checked,setChecked] = useState([true,true,false])
  return <div className="page review-page">
    <div className="page-title"><div><h2>人工复核与签发</h2><p>确认事实、证据和责任建议后，生成正式复盘报告。</p></div><span className={`status-pill ${signed?'success':'warning'}`}>{signed?<><Check size={14}/> 已签发</>:<><AlertTriangle size={14}/> 待复核</>}</span></div>
    <div className="review-grid">
      <section className="panel">
        <h3>责任建议</h3><div className="responsibility-list">{responsibility.map(x=><div className="resp-row" key={x.name}><div className="resp-title"><i style={{background:x.color}}/><b>{x.name}</b><span>{x.days}</span><strong>{x.pct}%</strong></div><div className="bar-track"><span style={{width:`${x.pct}%`,background:x.color}}/></div><p>{x.reason}</p></div>)}</div>
        <div className="total"><span>责任建议合计</span><b>100%</b></div>
      </section>
      <section className="panel checks">
        <h3>签发前检查</h3>
        {['时间轴与原始记录一致','原生/传导延误划分合理','船司SLA附件已补充'].map((x,i)=><label key={x}><input type="checkbox" checked={checked[i]} onChange={()=>setChecked(v=>v.map((z,j)=>j===i?!z:z))}/><span>{x}</span>{i===2&&<em>待补证</em>}</label>)}
        <div className="gap"><FolderOpen size={18}/><div><b>证据缺口 GAP-001</b><p>缺少本航线有效船司SLA附件。可签发业务复盘，但合同责任应保留“待确认”。</p></div></div>
        <label className="comment-label">审核意见<textarea defaultValue="同意事实链及业务责任建议。船司合同责任待商务补充有效SLA附件后复核。"/></label>
        <button className="button primary wide" onClick={onSign} disabled={signed}><ClipboardCheck size={17}/>{signed?'报告已签发':'确认并签发复盘报告'}</button>
      </section>
    </div>
    <section className="panel learning"><Sparkles size={19}/><div><h3>签发后自动反哺</h3><p>沉淀1个复盘案例、2个根因标签，更新C船司航线画像，并建议新增“备货晚于截港窗口”预警规则。</p></div></section>
  </div>
}
