/**
 * 海智航盾 · 欢迎页（Landing）
 *
 * 视觉主题：
 *   - 海：深蓝渐变背景 + 波纹动画
 *   - 智：六边形网格 + 雷达扫描
 *   - 航：航线轨迹 SVG
 *   - 盾：中央盾牌徽标 + 光晕脉冲
 *
 * 仅展示，无业务功能。"开始使用"按钮 → 进入主应用（W1 预警工作台）
 */

import { useEffect, useState } from 'react'
import { ShieldCheck, Radar, Waves, Bot, ChevronRight, Anchor, Globe2 } from 'lucide-react'

interface LandingProps {
  onStart: () => void
}

export function Landing({ onStart }: LandingProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 50)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className={`landing ${mounted ? 'is-mounted' : ''}`}>
      {/* 背景层：渐变 + 网格 + 波纹 */}
      <div className="ld-bg">
        <div className="ld-grid" />
        <div className="ld-wave ld-wave-1" />
        <div className="ld-wave ld-wave-2" />
        <div className="ld-wave ld-wave-3" />
        <div className="ld-glow" />
      </div>

      {/* 顶部条 */}
      <header className="ld-top">
        <div className="ld-brand">
          <div className="ld-brand-mark">
            <ShieldCheck size={20} />
          </div>
          <div>
            <b>海智航盾</b>
            <span>OceanGuard AI</span>
          </div>
        </div>
        <nav className="ld-top-nav">
          <a>产品</a>
          <a>案例</a>
          <a>文档</a>
          <a>关于</a>
        </nav>
      </header>

      {/* 主舞台 */}
      <main className="ld-stage">
        {/* 左侧文案 */}
        <section className="ld-copy">
          <div className="ld-eyebrow">
            <span className="ld-pulse" /> 跨境物流 · 智能防线 · 实时复盘
          </div>
          <h1 className="ld-title">
            <span className="ld-title-1">海</span>
            <span className="ld-title-2">智</span>
            <span className="ld-title-3">航</span>
            <span className="ld-title-4">盾</span>
          </h1>
          <p className="ld-sub">
            LightGBM 概率推理 × 贝叶斯虚拟证据融合 × 多 Agent 事后复盘
            <br />
            为每一票整柜出口业务构筑晚开风险防线
          </p>

          {/* 关键指标装饰条 */}
          <div className="ld-stats">
            <div className="ld-stat">
              <b>7 / 3 / 1</b>
              <span>天提前期快照</span>
            </div>
            <div className="ld-stat">
              <b>5×5</b>
              <span>联合状态归因</span>
            </div>
            <div className="ld-stat">
              <b>4 Agent</b>
              <span>会诊与归因</span>
            </div>
            <div className="ld-stat">
              <b>2×2</b>
              <span>处置象限</span>
            </div>
          </div>

          {/* CTA */}
          <div className="ld-cta">
            <button className="ld-start" onClick={onStart}>
              <span className="ld-start-text">开始使用</span>
              <ChevronRight size={18} className="ld-start-arrow" />
              <span className="ld-start-glow" />
            </button>
            <small className="ld-cta-note">
              无需登录，演示数据已就位 · 进入后可上传 Excel/CSV
            </small>
          </div>
        </section>

        {/* 右侧视觉舞台 */}
        <section className="ld-visual">
          {/* 雷达环 */}
          <div className="ld-radar">
            <div className="ld-radar-ring ld-radar-ring-1" />
            <div className="ld-radar-ring ld-radar-ring-2" />
            <div className="ld-radar-ring ld-radar-ring-3" />
            <div className="ld-radar-sweep" />
            <div className="ld-radar-blip ld-radar-blip-1" />
            <div className="ld-radar-blip ld-radar-blip-2" />
            <div className="ld-radar-blip ld-radar-blip-3" />
            <Radar size={28} className="ld-radar-icon" />
          </div>

          {/* 中央盾牌 */}
          <div className="ld-crest">
            <svg viewBox="0 0 200 240" className="ld-crest-svg">
              <defs>
                <linearGradient id="ld-crest-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7fd4ff" />
                  <stop offset="55%" stopColor="#3a89c8" />
                  <stop offset="100%" stopColor="#1a3f63" />
                </linearGradient>
                <linearGradient id="ld-crest-edge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#bce8ff" />
                  <stop offset="100%" stopColor="#2a5d8a" />
                </linearGradient>
                <radialGradient id="ld-crest-shine" cx="50%" cy="35%" r="55%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* 盾牌外形 */}
              <path
                d="M100 12 L180 42 L180 130 C180 175 145 215 100 232 C55 215 20 175 20 130 L20 42 Z"
                fill="url(#ld-crest-grad)"
                stroke="url(#ld-crest-edge)"
                strokeWidth="2.5"
              />
              {/* 内层分隔线 */}
              <path
                d="M100 30 L160 52 L160 130 C160 165 132 198 100 212 C68 198 40 165 40 130 L40 52 Z"
                fill="none"
                stroke="#bce8ff"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
              {/* 中央锚 + 雷达 */}
              <circle cx="100" cy="120" r="38" fill="#0d2740" stroke="#7fd4ff" strokeWidth="1.5" strokeOpacity="0.7" />
              <circle cx="100" cy="120" r="22" fill="none" stroke="#7fd4ff" strokeOpacity="0.5" strokeWidth="0.8" />
              <circle cx="100" cy="120" r="6" fill="#bce8ff" />
              <line x1="100" y1="80" x2="100" y2="160" stroke="#7fd4ff" strokeOpacity="0.35" strokeWidth="0.6" />
              <line x1="60" y1="120" x2="140" y2="120" stroke="#7fd4ff" strokeOpacity="0.35" strokeWidth="0.6" />
              {/* 顶部光晕 */}
              <path
                d="M100 12 L180 42 L180 130 C180 175 145 215 100 232 C55 215 20 175 20 130 L20 42 Z"
                fill="url(#ld-crest-shine)"
              />
            </svg>
            <div className="ld-crest-orbit">
              <span className="ld-orbit-node ld-orbit-node-1" />
              <span className="ld-orbit-node ld-orbit-node-2" />
              <span className="ld-orbit-node ld-orbit-node-3" />
              <span className="ld-orbit-node ld-orbit-node-4" />
            </div>
          </div>

          {/* 航线轨迹 */}
          <svg className="ld-route-svg" viewBox="0 0 480 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ld-route-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7fd4ff" stopOpacity="0" />
                <stop offset="20%" stopColor="#7fd4ff" stopOpacity="0.9" />
                <stop offset="80%" stopColor="#bce8ff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#bce8ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 10 180 Q 120 60 240 110 T 470 80"
              fill="none"
              stroke="url(#ld-route-grad)"
              strokeWidth="2"
              strokeDasharray="6 5"
              className="ld-route-svg-path"
            />
            <circle cx="10" cy="180" r="5" fill="#7fd4ff" />
            <circle cx="240" cy="110" r="4" fill="#bce8ff" />
            <circle cx="470" cy="80" r="5" fill="#7fd4ff" />
          </svg>

          {/* 浮动信息卡片 */}
          <div className="ld-info ld-info-1">
            <Radar size={14} />
            <div>
              <b>事中预警</b>
              <small>LightGBM × 贝叶斯融合</small>
            </div>
          </div>
          <div className="ld-info ld-info-2">
            <Bot size={14} />
            <div>
              <b>事后复盘</b>
              <small>多 Agent 责任归因</small>
            </div>
          </div>
          <div className="ld-info ld-info-3">
            <Waves size={14} />
            <div>
              <b>跨境物流</b>
              <small>整柜出口 · 全链路</small>
            </div>
          </div>
          <div className="ld-info ld-info-4">
            <Globe2 size={14} />
            <div>
              <b>可信 AI</b>
              <small>结论可追溯 · 人工签发</small>
            </div>
          </div>
        </section>
      </main>

      {/* 底部 */}
      <footer className="ld-foot">
        <div className="ld-foot-left">
          <Anchor size={13} />
          <span>海智航盾 · OceanGuard AI · 2026</span>
        </div>
        <div className="ld-foot-right">
          <span>v1.0 · 演示数据 · 单人开发项目</span>
        </div>
      </footer>
    </div>
  )
}
