import { useState } from 'react'
import { ParticleBackground } from './components/ParticleBackground'
import { NavBar } from './components/NavBar'
import { HeroSection } from './components/HeroSection'
import { DecisionView } from './views/DecisionView'
import { AccuracyView } from './views/AccuracyView'
import { Footer } from './components/Footer'

export type View = 'hero' | 'decision' | 'accuracy'

export default function App() {
  const [activeView, setActiveView] = useState<View>('hero')

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Animated background that lives behind everything */}
      <ParticleBackground />

      {/* Ambient radial gradients — the "aurora" effect */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 20% 20%, rgba(0,212,255,0.04) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(123,76,255,0.05) 0%, transparent 60%),
            radial-gradient(ellipse 100% 100% at 50% 50%, rgba(0,255,204,0.02) 0%, transparent 70%)
          `,
        }}
      />

      {/* Content layer */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <NavBar activeView={activeView} setActiveView={setActiveView} />

        <main>
          {activeView === 'hero'     && <HeroSection setActiveView={setActiveView} />}
          {activeView === 'decision' && <DecisionView />}
          {activeView === 'accuracy' && <AccuracyView />}
        </main>

        <Footer />
      </div>
    </div>
  )
}
