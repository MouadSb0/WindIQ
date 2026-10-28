import type { View } from '../App'
import { WindTurbine } from './WindTurbine'

interface NavBarProps {
  activeView: View
  setActiveView: (v: View) => void
}

export function NavBar({ activeView, setActiveView }: NavBarProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
        background: 'rgba(2, 4, 10, 0.75)',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <button
          onClick={() => setActiveView('hero')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <WindTurbine size={36} speed={2.5} glowColor="#00d4ff" />
          <div>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 900,
                fontSize: 20,
                letterSpacing: '-0.04em',
                color: '#00d4ff',
                textShadow: '0 0 16px rgba(0,212,255,0.6)',
              }}
            >
              Wind
            </span>
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 300,
                fontSize: 20,
                letterSpacing: '-0.02em',
                color: '#e8f4ff',
              }}
            >
              IQ
            </span>
          </div>
          <div
            style={{
              height: 20,
              width: 1,
              background: 'rgba(0,212,255,0.2)',
              margin: '0 4px',
            }}
          />
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              color: '#3d5a7a',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            UK Grid Forecast Intelligence
          </span>
        </button>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 8 }}>
          {([
            { id: 'decision', label: ' Decision View', icon: '' },
            { id: 'accuracy', label: ' Accuracy View', icon: '' },
          ] as { id: View; label: string; icon: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`nav-tab ${activeView === id ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Live badge */}
        <div className="badge-live">
          <div className="pulse-dot" />
          Elexon · Live
        </div>
      </div>
    </header>
  )
}
