/**
 * Animated SVG Wind Turbine — the hero visual element.
 *
 * The blades spin via a CSS animation. Speed is configurable (used to
 * show "high wind" vs "low wind" states). The glow pulses to signal
 * live data.
 */
import type { CSSProperties } from 'react'

interface TurbineProps {
  size?: number
  speed?: number   // animation duration in seconds (lower = faster)
  glowColor?: string
  style?: CSSProperties
}

export function WindTurbine({
  size = 200,
  speed = 3,
  glowColor = '#00d4ff',
  style,
}: TurbineProps) {
  const cx = size / 2
  const towerH = size * 0.45
  const hubY = size * 0.22
  const bladeL = size * 0.36

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <defs>
        {/* Hub glow filter */}
        <filter id="hub-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Tower gradient */}
        <linearGradient id="tower-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={glowColor} stopOpacity="0.15" />
          <stop offset="50%" stopColor={glowColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0.1" />
        </linearGradient>

        {/* Blade gradient */}
        <linearGradient id="blade-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={glowColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0.2" />
        </linearGradient>

        {/* Spinning blade group animation */}
        <style>{`
          @keyframes blade-rotate-${size} {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          .blades-${size} {
            transform-origin: ${cx}px ${hubY}px;
            animation: blade-rotate-${size} ${speed}s linear infinite;
          }
          @keyframes hub-pulse-${size} {
            0%, 100% { opacity: 1; r: ${size * 0.035}; }
            50%       { opacity: 0.7; r: ${size * 0.04}; }
          }
          .hub-${size} {
            animation: hub-pulse-${size} 2s ease-in-out infinite;
          }
        `}</style>
      </defs>

      {/* Ground base */}
      <ellipse
        cx={cx}
        cy={size - size * 0.04}
        rx={size * 0.14}
        ry={size * 0.025}
        fill={glowColor}
        fillOpacity={0.12}
      />

      {/* Tower */}
      <path
        d={`M ${cx - size*0.024} ${hubY + size*0.02} 
            L ${cx + size*0.024} ${hubY + size*0.02}
            L ${cx + size*0.05}  ${size - size*0.05}
            L ${cx - size*0.05}  ${size - size*0.05} Z`}
        fill="url(#tower-grad)"
        stroke={glowColor}
        strokeWidth={0.5}
        strokeOpacity={0.6}
      />

      {/* Spinning blades */}
      <g className={`blades-${size}`}>
        {/* Blade 1 — straight up */}
        <path
          d={`M ${cx} ${hubY} 
              C ${cx - size*0.02} ${hubY - bladeL*0.3},
                ${cx - size*0.04} ${hubY - bladeL*0.7},
                ${cx}             ${hubY - bladeL}
              C ${cx + size*0.04} ${hubY - bladeL*0.7},
                ${cx + size*0.02} ${hubY - bladeL*0.3},
                ${cx}             ${hubY} Z`}
          fill="url(#blade-grad)"
          opacity={0.9}
        />
        {/* Blade 2 — 120 deg */}
        <path
          d={`M ${cx} ${hubY} 
              C ${cx - size*0.02} ${hubY - bladeL*0.3},
                ${cx - size*0.04} ${hubY - bladeL*0.7},
                ${cx}             ${hubY - bladeL}
              C ${cx + size*0.04} ${hubY - bladeL*0.7},
                ${cx + size*0.02} ${hubY - bladeL*0.3},
                ${cx}             ${hubY} Z`}
          fill="url(#blade-grad)"
          opacity={0.9}
          style={{ transformOrigin: `${cx}px ${hubY}px`, transform: 'rotate(120deg)' }}
        />
        {/* Blade 3 — 240 deg */}
        <path
          d={`M ${cx} ${hubY} 
              C ${cx - size*0.02} ${hubY - bladeL*0.3},
                ${cx - size*0.04} ${hubY - bladeL*0.7},
                ${cx}             ${hubY - bladeL}
              C ${cx + size*0.04} ${hubY - bladeL*0.7},
                ${cx + size*0.02} ${hubY - bladeL*0.3},
                ${cx}             ${hubY} Z`}
          fill="url(#blade-grad)"
          opacity={0.9}
          style={{ transformOrigin: `${cx}px ${hubY}px`, transform: 'rotate(240deg)' }}
        />
      </g>

      {/* Hub centre */}
      <circle
        className={`hub-${size}`}
        cx={cx}
        cy={hubY}
        r={size * 0.035}
        fill={glowColor}
        filter="url(#hub-glow)"
      />
    </svg>
  )
}
