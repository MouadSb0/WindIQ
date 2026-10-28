/**
 * HeroSection — the landing page.
 *
 * Design goals:
 * - Immediate "wow" — recruiter sees it in 3 seconds and wants to explore
 * - Communicates the problem domain (UK energy / wind / trading) at a glance
 * - Three spinning turbines at different speeds signal wind variability
 * - Animated counter for "GB wind capacity" gives energy-sector authenticity
 * - Grid of stat cards uses glassmorphism
 */
import { useEffect, useRef, useState } from 'react'
import { WindTurbine } from './WindTurbine'
import type { View } from '../App'

interface HeroProps {
  setActiveView: (v: View) => void
}

function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

export function HeroSection({ setActiveView }: HeroProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  const capacityGW = useCountUp(28, 2200)
  const forecastsProcessed = useCountUp(48320, 2500)
  const horizonHours = useCountUp(36, 1800)

  return (
    <section
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />

      {/* Turbine trio */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0,
          marginBottom: 48,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(40px)',
          transition: 'all 0.9s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <WindTurbine size={140} speed={4.5} glowColor="#7b4cff"
          style={{ opacity: 0.6, transform: 'translateY(20px)' }} />
        <WindTurbine size={200} speed={2.2} glowColor="#00d4ff"
          style={{ filter: 'drop-shadow(0 0 20px rgba(0,212,255,0.5))' }} />
        <WindTurbine size={120} speed={3.8} glowColor="#00ffcc"
          style={{ opacity: 0.7, transform: 'translateY(30px)' }} />
      </div>

      {/* Main headline */}
      <div
        style={{
          textAlign: 'center',
          maxWidth: 800,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.9s cubic-bezier(0.16,1,0.3,1) 0.15s',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 99,
            background: 'rgba(0,212,255,0.07)',
            border: '1px solid rgba(0,212,255,0.2)',
            marginBottom: 20,
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#00d4ff',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#00ffcc',
            boxShadow: '0 0 8px #00ffcc', animation: 'pulse-glow 1.6s ease-in-out infinite'
          }} />
          UK National Grid · Day-Ahead Wind Intelligence
        </div>

        <h1
          style={{
            fontSize: 'clamp(42px, 7vw, 80px)',
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            marginBottom: 24,
          }}
        >
          <span style={{ color: '#e8f4ff' }}>Point-in-Time</span>
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #00ffcc 50%, #7b4cff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 30px rgba(0,212,255,0.4))',
            }}
          >
            Wind Forecasting
          </span>
        </h1>

        <p
          style={{
            fontSize: 18,
            color: '#7a9bbd',
            lineHeight: 1.6,
            maxWidth: 600,
            margin: '0 auto 40px',
          }}
        >
          Zero look-ahead bias. Correct forecasts at each decision cutoff.
          Built for GB energy traders who need to know exactly what the market
          knew — and when it knew it.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => setActiveView('decision')}
            style={{ fontSize: 15, padding: '14px 32px' }}
          >
            ⚡ Open Decision View
          </button>
          <button
            className="btn-secondary"
            onClick={() => setActiveView('accuracy')}
            style={{ fontSize: 15, padding: '14px 32px' }}
          >
            📊 Accuracy Analysis
          </button>
        </div>
      </div>

      {/* Electric divider */}
      <div
        className="electric-line"
        style={{
          width: '100%',
          maxWidth: 800,
          margin: '56px auto',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.9s ease 0.4s',
        }}
      />

      {/* Stats grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
          width: '100%',
          maxWidth: 900,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'all 0.9s cubic-bezier(0.16,1,0.3,1) 0.5s',
        }}
      >
        {[
          {
            value: `${capacityGW} GW`,
            label: 'GB installed wind capacity',
            sub: 'Onshore + offshore combined',
            color: '#00d4ff',
          },
          {
            value: forecastsProcessed.toLocaleString(),
            label: 'Forecast vintages indexed',
            sub: 'January 2026 · WINDFOR dataset',
            color: '#00ffcc',
          },
          {
            value: `${horizonHours}h`,
            label: 'Max forecast horizon',
            sub: 'Day-ahead delivery window',
            color: '#7b4cff',
          },
          {
            value: '½ hr',
            label: 'Settlement granularity',
            sub: '48 periods per delivery day',
            color: '#ff2d78',
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="metric-card"
            style={{
              textAlign: 'center',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: stat.color,
                textShadow: `0 0 20px ${stat.color}80`,
                fontFamily: 'JetBrains Mono, monospace',
                marginBottom: 6,
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: 13, color: '#e8f4ff', fontWeight: 600, marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 11, color: '#3d5a7a', fontFamily: 'JetBrains Mono, monospace' }}>
              {stat.sub}
            </div>

            {/* Corner decoration */}
            <div style={{
              position: 'absolute', top: 8, right: 8,
              width: 20, height: 20,
              borderTop: `1px solid ${stat.color}40`,
              borderRight: `1px solid ${stat.color}40`,
            }} />
            <div style={{
              position: 'absolute', bottom: 8, left: 8,
              width: 20, height: 20,
              borderBottom: `1px solid ${stat.color}40`,
              borderLeft: `1px solid ${stat.color}40`,
            }} />
          </div>
        ))}
      </div>

      {/* Architecture callout */}
      <div
        className="glass-card"
        style={{
          maxWidth: 900,
          width: '100%',
          marginTop: 40,
          padding: '28px 32px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.9s ease 0.7s',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {[
            { icon: '🐍', title: 'FastAPI Backend', desc: 'Async Python · aiosqlite · point-in-time SQL filter · Railway deploy' },
            { icon: '⚛️', title: 'React + TypeScript', desc: 'Vite · Recharts · Framer Motion · Vercel deploy' },
            { icon: '🏭', title: 'Elexon BMRS', desc: 'WINDFOR forecasts + FUELHH actuals · full vintage history preserved' },
            { icon: '🎯', title: 'Zero Lookahead Bias', desc: 'publishTime ≤ cutoff filter · correct for any decision time' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e8f4ff', marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#3d5a7a', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
