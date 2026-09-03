import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, AlertTriangle, Anchor, Bot, Check, ChevronRight, CircleUserRound,
  ClipboardCheck, Clock3, FileSearch, FolderOpen, Gavel, LayoutDashboard,
  Play, RotateCcw, Scale, Ship, ShieldCheck, Sparkles, Upload, UsersRound
} from 'lucide-react'
import './styles.css'

type Tab = 'overview' | 'timeline' | 'agents' | 'review'
type AgentStatus = 'waiting' | 'running' | 'done'

const events = [
  { group: '订单下达', name: '录单', plan: '7月01日 09:00', actual: '7月01日 09:12', delay: 0, type: '正常', source: '订单系统' },
  { group: '订单下达', name: '工厂排产', plan: '7月03日 18:00', actual: '7月03日 17:40', delay: 0, type: '正常', source: '工厂MES' },
  { group: '物流订舱', name: '发起订舱', plan: '7月04日 10:00', actual: '7月04日 10:05', delay: 0, type: '正常', source: '订舱平台' },
  { group: '物流订舱', name: 'Booking确认', plan: '7月05日 18:00', actual: '7月06日 11:20', delay: 0.7, type: '原生延误', source: '船司EDI' },
  { group: '拖车背箱', name: '工厂备货', plan: '7月08日 18:00', actual: '7月15日 17:52', delay: 7, type: '原生延误', source: '工厂MES' },
  { group: '拖车背箱', name: '提箱', plan: '7月09日 14:00', actual: '7月16日 10:18', delay: 6.8, type: '传导延误', source: '拖车TMS' },
  { group: '报关集港', name: '报关放行', plan: '7月10日 16:00', actual: '7月17日 14:35', delay: 6.9, type: '传导延误', source: '关务系统' },
  { group: '报关集港', name: '码头放行', plan: '7月11日 18:00', actual: '7月18日 13:10', delay: 6.8, type: '传导延误', source: '码头系统' },
  { group: '离港出运', name: '装船发运', plan: '7月12日 20:00', actual: '7月25日 22:30', delay: 13.1, type: '原生延误', source: 'AIS + 船司' },
  { group: '离港出运', name: '到港清关', plan: '8月02日 08:00', actual: '8月17日 09:25', delay: 15, type: '传导延误', source: '海外代理' },
]

const agents = [
  { name: '数据观测代理', role: '数据专员', icon: Activity, summary: '已统一10个关键事件，识别2个原生异常、4个传导节点。', confidence: '数据完整度 92%', evidence: 18 },
  { name: '物流专家', role: '物流 / 货代', icon: Ship, summary: '工厂备货晚7天是首个主要原生异常，直接压缩截港窗口。', confidence: '置信度 91%', evidence: 6 },
  { name: '船司专家', role: '船司对接', icon: Anchor, summary: '改船及晚开新增约6.1天；历史表现提示偶发扰动，合同责任待核。', confidence: '置信度 76%', evidence: 5 },
  { name: '港口关务专家', role: '关务 / 海外代理', icon: FileSearch, summary: '目的港拥堵贡献约2天净新增影响，另有2天与上游延误重叠。', confidence: '置信度 84%', evidence: 4 },
  { name: '法务专家', role: '法务商务', icon: Scale, summary: 'FOB不等于工厂承担全部运输责任；船司SLA条款版本仍需补证。', confidence: '置信度 72%', evidence: 3 },
  { name: '主持代理', role: '复盘主持', icon: UsersRound, summary: '已消解重复计时并生成责任建议，最终结论需业务负责人签发。', confidence: '综合可信度 82%', evidence: 21 },
]

const responsibility = [
  { name: '工厂', pct: 47, days: '7.0天', color: '#ef8354', reason: '备货延误为首个原生异常' },
  { name: '船司', pct: 33, days: '4.9天', color: '#4f7cac', reason: '改船及晚开形成净新增延误' },
  { name: '港口关务', pct: 13, days: '2.0天', color: '#7e9f77', reason: '拥堵与清关作业影响' },
  { name: '日日顺', pct: 7, days: '1.1天', color: '#a7a9be', reason: '协同升级仍有改进空间' },
]

function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(-1)
  const [signed, setSigned] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!running) return
    if (step >= agents.length - 1) {
      const t = window.setTimeout(() => { setRunning(false); setNotice('会诊完成，已生成责任建议与待补证清单。') }, 700)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setStep(v => v + 1), 650)
    return () => window.clearTimeout(t)
  }, [running, step])

  const start = () => { setSigned(false); setNotice(''); setStep(0); setRunning(true); setTab('agents') }
  const statusFor = (i: number): AgentStatus => i < step || (!running && step === agents.length - 1) ? 'done' : i === step ? 'running' : 'waiting'

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={20}/></div><div><b>海智航盾</b><span>AI 复盘中心</span></div></div>
      <nav>
        <Nav active={tab==='overview'} icon={LayoutDashboard} label="案件总览" onClick={()=>setTab('overview')}/>
        <Nav active={tab==='timeline'} icon={Clock3} label="事件时间轴" onClick={()=>setTab('timeline')}/>
        <Nav active={tab==='agents'} icon={Bot} label="Agent 会诊" onClick={()=>setTab('agents')}/>
        <Nav active={tab==='review'} icon={ClipboardCheck} label="人工复核" onClick={()=>setTab('review')}/>
      </nav>
      <div className="side-note"><Sparkles size={15}/><div><b>可信 AI</b><span>所有结论均关联证据，最终责任由人工签发。</span></div></div>
      <div className="profile"><CircleUserRound size={28}/><div><b>业务负责人</b><span>复盘审核员</span></div></div>
    </aside>

    <main>
      <header>
        <div><div className="eyebrow">异常复盘案件 · CASE-2026-0712</div><h1>青岛 → 鹿特丹 · 冰箱整柜延误</h1></div>
        <div className="header-actions">
          <label className="button ghost"><Upload size={16}/> 导入材料<input type="file" hidden onChange={e=>e.target.files?.[0] && setNotice(`已读取：${e.target.files[0].name}`)}/></label>
          <button className="button primary" onClick={start} disabled={running}><Play size={16}/>{running ? '会诊进行中' : '重新运行会诊'}</button>
        </div>
      </header>

      {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}>×</button></div>}
      {tab==='overview' && <Overview onNavigate={setTab} onStart={start}/>} 
      {tab==='timeline' && <Timeline/>}
      {tab==='agents' && <Agents running={running} step={step} statusFor={statusFor}/>} 
      {tab==='review' && <Review signed={signed} onSign={()=>{setSigned(true);setNotice('复盘报告已完成签发，并记录本次人工决策。')}}/>}
    </main>
  </div>
}

function Nav({active, icon:Icon, label, onClick}:{active:boolean,icon:React.ElementType,label:string,onClick:()=>void}) {
  return <button className={`nav-item ${active?'active':''}`} onClick={onClick}><Icon size={18}/><span>{label}</span></button>
}

function Overview({onNavigate,onStart}:{onNavigate:(t:Tab)=>void,onStart:()=>void}) {
  return <div className="page">
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
      </section>
    </div>
    <section className="panel action-panel"><div><h3>顺序会诊已准备就绪</h3><p>六个 AI 角色将依次处理事实、物流、船司、关务、合同与责任整合。</p></div><button className="button primary" onClick={onStart}><Play size={16}/> 开始会诊</button></section>
  </div>
}

function Timeline() {
  const [filter,setFilter] = useState('全部')
  const shown = filter==='全部'?events:events.filter(e=>e.type===filter)
  return <div className="page">
    <div className="page-title"><div><h2>统一事件时间轴</h2><p>计划时间、实际时间与延误传导关系均来自可追溯数据源。</p></div><div className="filters">{['全部','原生延误','传导延误'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div></div>
    <section className="panel table-panel"><table><thead><tr><th>业务环节 / 节点</th><th>计划时间</th><th>实际时间</th><th>累计偏差</th><th>类型</th><th>数据来源</th></tr></thead><tbody>{shown.map((e,i)=><tr key={e.name}><td><div className="node-cell"><span>{String(i+1).padStart(2,'0')}</span><div><b>{e.name}</b><small>{e.group}</small></div></div></td><td>{e.plan}</td><td>{e.actual}</td><td className={e.delay>0?'late':''}>{e.delay>0?`+${e.delay} 天`:'按期'}</td><td><Tag type={e.type}/></td><td><span className="source"><Check size={12}/>{e.source}</span></td></tr>)}</tbody></table></section>
    <section className="insight"><AlertTriangle size={18}/><div><b>首个主要异常：工厂备货</b><p>工厂备货晚7天，导致原截港窗口失效。后续提箱、报关和码头放行为传导延误，不应重复归责。</p></div></section>
  </div>
}

function Agents({running,step,statusFor}:{running:boolean,step:number,statusFor:(i:number)=>AgentStatus}) {
  return <div className="page">
    <div className="page-title"><div><h2>顺序会诊流水线</h2><p>每位专家仅基于上游结构化结果和授权证据作出判断。</p></div><span className={`status-pill ${running?'processing':'success'}`}>{running?<><RotateCcw className="spin" size={14}/> 会诊中 · {Math.min(step+1,6)}/6</>:<><Check size={14}/> 会诊已完成</>}</span></div>
    <div className="agent-flow">{agents.map((a,i)=>{const s=statusFor(i);const Icon=a.icon;return <React.Fragment key={a.name}><article className={`agent-card ${s}`}>
      <div className="agent-top"><div className="agent-icon"><Icon size={20}/></div><div><h3>{a.name}</h3><span>{a.role}</span></div><Status status={s}/></div>
      <p>{s==='waiting'?'等待上游结构化结果…':s==='running'?'正在核验证据并生成结构化结论…':a.summary}</p>
      <div className="agent-foot"><span>{s==='done'?a.confidence:'—'}</span><span>{s==='done'?`${a.evidence} 条证据`:'尚未输出'}</span></div>
    </article>{i<agents.length-1&&<ChevronRight className="flow-arrow" size={20}/>}</React.Fragment>})}</div>
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

function Review({signed,onSign}:{signed:boolean,onSign:()=>void}) {
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

function Meta({label,value}:{label:string,value:string}){return <div><span>{label}</span><b>{value}</b></div>}
function Metric({label,value,unit,note,tone}:{label:string,value:string,unit:string,note:string,tone?:string}){return <div className={`metric ${tone||''}`}><span>{label}</span><div><b>{value}</b><em>{unit}</em></div><small>{note}</small></div>}
function PanelHead({title,action,onClick}:{title:string,action:string,onClick?:()=>void}){return <div className="panel-head"><h3>{title}</h3><button onClick={onClick}>{action}{onClick&&<ChevronRight size={15}/>}</button></div>}
function Tag({type}:{type:string}){return <span className={`tag ${type==='原生延误'?'native':type==='传导延误'?'transmitted':'normal'}`}>{type}</span>}
function Status({status}:{status:AgentStatus}){return <span className={`agent-status ${status}`}>{status==='done'?<><Check size={12}/>完成</>:status==='running'?<><RotateCcw className="spin" size={12}/>分析中</>:'等待'}</span>}
function Message({who,text,cite,accent}:{who:string,text:string,cite:string,accent?:boolean}){return <div className={`message ${accent?'accent':''}`}><div className="avatar">{who.slice(0,1)}</div><div><b>{who}</b><p>{text}</p><span><FileSearch size={12}/>{cite}</span></div></div>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
