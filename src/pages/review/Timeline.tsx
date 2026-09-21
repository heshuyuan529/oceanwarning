// 事件时间轴页（自 main.tsx 原样迁出，内容未改动）
import { useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { events } from '../../data/review'
import { Tag } from '../../components/ui'

export function Timeline() {
  const [filter,setFilter] = useState('全部')
  const shown = filter==='全部'?events:events.filter(e=>e.type===filter)
  return <div className="page">
    <div className="page-title"><div><h2>统一事件时间轴</h2><p>计划时间、实际时间与延误传导关系均来自可追溯数据源。</p></div><div className="filters">{['全部','原生延误','传导延误'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div></div>
    <section className="panel table-panel"><table><thead><tr><th>业务环节 / 节点</th><th>计划时间</th><th>实际时间</th><th>累计偏差</th><th>类型</th><th>数据来源</th></tr></thead><tbody>{shown.map((e,i)=><tr key={e.name}><td><div className="node-cell"><span>{String(i+1).padStart(2,'0')}</span><div><b>{e.name}</b><small>{e.group}</small></div></div></td><td>{e.plan}</td><td>{e.actual}</td><td className={e.delay>0?'late':''}>{e.delay>0?`+${e.delay} 天`:'按期'}</td><td><Tag type={e.type}/></td><td><span className="source"><Check size={12}/>{e.source}</span></td></tr>)}</tbody></table></section>
    <section className="insight"><AlertTriangle size={18}/><div><b>首个主要异常：工厂备货</b><p>工厂备货晚7天，导致原截港窗口失效。后续提箱、报关和码头放行为传导延误，不应重复归责。</p></div></section>
  </div>
}
