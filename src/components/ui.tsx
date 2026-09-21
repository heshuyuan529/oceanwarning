// 共享 UI 小组件（自 main.tsx 原样迁出，内容未改动）
import React from 'react'
import { Check, ChevronRight, FileSearch, RotateCcw } from 'lucide-react'

// 会诊 Agent 运行状态
export type AgentStatus = 'waiting' | 'running' | 'done'

export function Meta({label,value}:{label:string,value:string}){return <div><span>{label}</span><b>{value}</b></div>}

export function Metric({label,value,unit,note,tone}:{label:string,value:string,unit:string,note:string,tone?:string}){return <div className={`metric ${tone||''}`}><span>{label}</span><div><b>{value}</b><em>{unit}</em></div><small>{note}</small></div>}

export function PanelHead({title,action,onClick}:{title:string,action:string,onClick?:()=>void}){return <div className="panel-head"><h3>{title}</h3><button onClick={onClick}>{action}{onClick&&<ChevronRight size={15}/>}</button></div>}

export function Tag({type}:{type:string}){return <span className={`tag ${type==='原生延误'?'native':type==='传导延误'?'transmitted':'normal'}`}>{type}</span>}

export function Status({status}:{status:AgentStatus}){return <span className={`agent-status ${status}`}>{status==='done'?<><Check size={12}/>完成</>:status==='running'?<><RotateCcw className="spin" size={12}/>分析中</>:'等待'}</span>}

export function Message({who,text,cite,accent}:{who:string,text:string,cite:string,accent?:boolean}){return <div className={`message ${accent?'accent':''}`}><div className="avatar">{who.slice(0,1)}</div><div><b>{who}</b><p>{text}</p><span><FileSearch size={12}/>{cite}</span></div></div>}
