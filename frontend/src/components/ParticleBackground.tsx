/**
 * ParticleBackground — animated canvas with floating wind particles.
 *
 * Design rationale:
 * - Uses <canvas> + requestAnimationFrame for buttery 60fps performance
 * - Particles drift upward at variable speeds/angles simulating wind flow
 * - A scanline effect reinforces the "energy monitoring dashboard" aesthetic
 * - All rendering is in a useEffect that cleans up properly on unmount
 */
import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  size: number
  speed: number
  angle: number        // drift angle in radians
  opacity: number
  color: string
  twinkle: number      // phase for opacity oscillation
  twinkleSpeed: number
}

const COLORS = [
  'rgba(0,212,255,',   // electric blue
  'rgba(0,255,204,',   // electric cyan
  'rgba(123,76,255,',  // electric purple
  'rgba(10,255,239,',  // electric teal
]

function createParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: height + Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 0.6 + 0.2,
    angle: (Math.random() - 0.5) * 0.4,  // slight horizontal drift
    opacity: Math.random() * 0.6 + 0.2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: Math.random() * 0.03 + 0.01,
  }
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let animFrame: number
    let particles: Particle[] = []
    const PARTICLE_COUNT = 80

    function resize() {
      canvas!.width  = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function init() {
      resize()
      particles = Array.from({ length: PARTICLE_COUNT }, () =>
        createParticle(canvas!.width, canvas!.height)
      )
      // Scatter initial y positions across the canvas (not all at bottom)
      particles.forEach(p => { p.y = Math.random() * canvas!.height })
    }

    let scanlineY = 0

    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)

      // Subtle scanline sweep — single pixel horizontal line drifting down
      scanlineY = (scanlineY + 0.4) % canvas!.height
      const grad = ctx.createLinearGradient(0, scanlineY - 80, 0, scanlineY + 80)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.5, 'rgba(0,212,255,0.015)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, scanlineY - 80, canvas!.width, 160)

      // Draw and update each particle
      particles.forEach(p => {
        // Twinkle: oscillate opacity
        p.twinkle += p.twinkleSpeed
        const displayOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.twinkle))

        // Glow: draw a soft radial halo then a bright core
        const glowRadius = p.size * 4
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius)
        glow.addColorStop(0, `${p.color}${displayOpacity.toFixed(2)})`)
        glow.addColorStop(1, `${p.color}0)`)

        ctx.beginPath()
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        // Bright core dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `${p.color}${Math.min(1, displayOpacity * 1.5).toFixed(2)})`
        ctx.fill()

        // Move particle
        p.y -= p.speed
        p.x += Math.sin(p.angle + p.twinkle * 0.1) * 0.3

        // Recycle when off-screen
        if (p.y < -10) {
          const fresh = createParticle(canvas!.width, canvas!.height)
          Object.assign(p, fresh)
        }
      })

      animFrame = requestAnimationFrame(draw)
    }

    init()
    draw()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.8,
      }}
    />
  )
}
