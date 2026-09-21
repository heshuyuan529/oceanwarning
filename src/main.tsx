// 应用入口：双工作台导航壳
// - 风险预警工作台：W1-W4 全部启用
// - AI 复盘中心：自原单文件应用迁入，功能与外观不变
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Bot, Check, ClipboardCheck, ClipboardList, Clock3, CreditCard, LayoutDashboard,
  Play, Radar, ShieldCheck, Sparkles, CircleUserRound, Upload
} from 'lucide-react'
import './styles.css'
import type { Tab } from './types'
import { agents } from './data/review'
import { Overview } from './pages/review/Overview'
import { Timeline } from './pages/review/Timeline'
import { Agents } from './pages/review/Agents'
import { Review } from './pages/review/Review'
import { Workbench } from './pages/warning/Workbench'
import { RiskCard } from './pages/warning/RiskCard'
import { Network } from './pages/warning/Network'
import { Ledger } from './pages/warning/Ledger'
import { Landing } from './pages/Landing'

type AgentStatus = 'waiting' | 'running' | 'done'

const WARNING_TABS = ['workbench', 'riskcard', 'network', 'ledger']
const WARNING_TITLES: Record<string, string> = {
  workbench: '预警工作台',
  riskcard: '风险卡详情',
  network: '网络与证据治理',
  ledger: '处置台账',
}

function App() {
  const [hasStarted, setHasStarted] = useState(false)
  const [tab, setTab] = useState<Tab>('workbench')
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(-1)
  const [signed, setSigned] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [transferredKey, setTransferredKey] = useState<string | null>(null)

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

  const isWarning = WARNING_TABS.includes(tab)

  if (!hasStarted) {
    return <Landing onStart={() => setHasStarted(true)} />
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={20}/></div><div><b>海智航盾</b><span>风险预警 · AI 复盘</span></div></div>
      <nav>
        <div className="nav-group">风险预警</div>
        <Nav active={tab==='workbench'} icon={Radar} label="预警工作台" onClick={()=>setTab('workbench')}/>
        <button className={`nav-item ${tab==='riskcard'?'active':''}`} onClick={()=>setTab('riskcard')}><CreditCard size={18}/><span>风险卡详情</span></button>
        {/* W3 网络与证据已降级为次级页：主导航不展示，从风险卡①区“查看模型与条件频数表”进入 */}
        <Nav active={tab==='ledger'} icon={ClipboardList} label="处置台账" onClick={()=>setTab('ledger')}/>
        <div className="nav-group">AI 复盘中心</div>
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
        <div>
          <div className="eyebrow">{isWarning ? '风险预警 · 演示数据' : '异常复盘案件 · CASE-2026-0712'}</div>
          <h1>{isWarning ? (WARNING_TITLES[tab] ?? '预警工作台') : '青岛 → 鹿特丹 · 冰箱整柜延误'}</h1>
        </div>
        <div className="header-actions">
          {!isWarning && (<>
            <label className="button ghost"><Upload size={16}/> 导入材料<input type="file" hidden onChange={e=>e.target.files?.[0] && setNotice(`已读取：${e.target.files[0].name}`)}/></label>
            <button className="button primary" onClick={start} disabled={running}><Play size={16}/>{running ? '会诊进行中' : '重新运行会诊'}</button>
          </>)}
        </div>
      </header>

      {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}>×</button></div>}

      {/* 风险预警页面 */}
      {tab==='workbench' && <Workbench onSelect={(key)=>{setSelectedKey(key);setTab('riskcard')}}/>}
      {tab==='riskcard' && (
        selectedKey ? (
          <RiskCard
            shipmentKey={selectedKey}
            onBack={()=>setTab('workbench')}
            onTransfer={(key)=>{setNotice(`已移交 ${key} 至 AI 复盘中心`);setTransferredKey(key);setTab('overview')}}
            onViewNetwork={()=>setTab('network')}
          />
        ) : (
          <div className="page">
            <div className="wb-placeholder">
              <Radar size={32}/>
              <h3>请先从工作台选择任务</h3>
              <button className="button" onClick={()=>setTab('workbench')}>前往工作台</button>
            </div>
          </div>
        )
      )}
      {tab==='network' && <Network/>}
      {tab==='ledger' && <Ledger onNavigateToCard={(key)=>{setSelectedKey(key);setTab('riskcard')}}/>}

      {/* AI 复盘中心页面 */}
      {tab==='overview' && <Overview onNavigate={setTab} onStart={start} fromWarning={!!transferredKey} transferredKey={transferredKey}/>}
      {tab==='timeline' && <Timeline/>}
      {tab==='agents' && <Agents running={running} step={step} statusFor={statusFor}/>}
      {tab==='review' && <Review signed={signed} onSign={()=>{setSigned(true);setNotice('复盘报告已完成签发，并记录本次人工决策。')}}/>}
    </main>
  </div>
}

function Nav({active, icon:Icon, label, onClick}:{active:boolean,icon:React.ElementType,label:string,onClick:()=>void}) {
  return <button className={`nav-item ${active?'active':''}`} onClick={onClick}><Icon size={18}/><span>{label}</span></button>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
