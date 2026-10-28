/**
 * AccuracyView — "How good are the forecasts, and at what horizon?"
 *
 * This view quantifies forecast error and shows how MAE/RMSE/bias
 * degrade as the forecast horizon increases. This is the analytical
 * justification for thermal capacity procurement buffers.
 *
 * Key insight for the recruiter to notice:
 * - At short horizons (0-6h), MAE might be ~200 MW
 * - At long horizons (30-36h), MAE might be ~1,500 MW
 * - That spread directly translates to procured reserve capacity
 *
 * Design:
 * - 3 large metric cards (MAE, RMSE, Bias) with animated number counters
 * - Horizon bar chart — the "degradation curve" — most important visual
 * - Scatter of all (forecast, actual) pairs for distribution insight
 * - Procurement implication callout
 */
import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { getAccuracy, type AccuracyResponse, type HorizonBucket } from '../api/client'
import { WindTurbine } from '../components/WindTurbine'

/* ─── Animated number ────────────────────────────────────── */

function AnimatedNumber({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  const prevVal = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const from = prevVal.current
    const to = value
    prevVal.current = value

    function tick(now: number) {
      const t = Math.min((now - start) / 1400, 1)
      const ease = 1 - Math.pow(1 - t, 4)
      setDisplay(from + (to - from) * ease)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return <>{display.toFixed(decimals)}{suffix}</>
}

/* ─── Horizon colour ramp (green → amber → red) ─────────── */

function horizonColor(hours: number): string {
  // 0h = good (cyan), 36h = bad (pink/red)
  const t = Math.min(hours / 36, 1)
  if (t < 0.5) {
    const r = Math.round(0 + (255 - 0) * t * 2)
    const g = Math.round(212 + (184 - 212) * t * 2)
    const b = Math.round(255 + (0 - 255) * t * 2)
    return `rgb(${r},${g},${b})`
  } else {
    const t2 = (t - 0.5) * 2
    const r = Math.round(255 + (255 - 255) * t2)
    const g = Math.round(184 + (45 - 184) * t2)
    const b = Math.round(0 + (120 - 0) * t2)
    return `rgb(${r},${g},${b})`
  }
}

/* ─── Custom bar tooltip ─────────────────────────────────── */

function HorizonTooltip({ active, payload }: { active?: boolean; payload?: { payload: HorizonBucket }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'rgba(6,14,30,0.97)',
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: '12px 16px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11,
      boxShadow: '0 0 20px rgba(0,212,255,0.2)',
    }}>
      <div style={{ color: '#00d4ff', fontWeight: 700, marginBottom: 8 }}>{d.horizon_label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span style={{ color: '#7a9bbd' }}>MAE</span>
          <span style={{ color: '#e8f4ff', fontWeight: 700 }}>{d.mae.toFixed(0)} MW</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span style={{ color: '#7a9bbd' }}>RMSE</span>
          <span style={{ color: '#ffb800', fontWeight: 700 }}>{d.rmse.toFixed(0)} MW</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span style={{ color: '#7a9bbd' }}>Bias</span>
          <span style={{ color: d.bias >= 0 ? '#00ffcc' : '#ff2d78', fontWeight: 700 }}>
            {d.bias >= 0 ? '+' : ''}{d.bias.toFixed(0)} MW
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span style={{ color: '#7a9bbd' }}>n</span>
          <span style={{ color: '#3d5a7a' }}>{d.count} pairs</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Main View ──────────────────────────────────────────── */

export function AccuracyView() {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const [cutoff, setCutoff] = useState(`${yesterday}T12:00`)
  const [deliveryFrom, setDeliveryFrom] = useState('2026-01-01')
  const [deliveryTo, setDeliveryTo] = useState('2026-01-31')
  const [data, setData] = useState<AccuracyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'mae' | 'rmse' | 'bias'>('mae')

  const fetch = async () => {
    setLoading(true)
    setError(null)
    try {
      const cutoffISO = cutoff.includes('Z') ? cutoff : cutoff + ':00Z'
      const result = await getAccuracy(cutoffISO, deliveryFrom, deliveryTo)
      setData(result)
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ?? (e as Error)?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>

      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <WindTurbine size={42} speed={1.5} glowColor="#00ffcc" />
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>
              Accuracy Analysis
            </h2>
            <p style={{ color: '#7a9bbd', fontSize: 13 }}>
              MAE · RMSE · Bias — stratified by forecast horizon
            </p>
          </div>
        </div>
        <div className="electric-line" style={{ marginTop: 20 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Controls ── */}
        <div className="fade-in-up delay-100">
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7a9bbd', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
              Parameters
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
                  ⏱ DECISION CUTOFF
                </label>
                <input type="datetime-local" className="input-field" value={cutoff} onChange={e => setCutoff(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#00ffcc', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
                  📅 ANALYSIS FROM
                </label>
                <input type="date" className="input-field" value={deliveryFrom} onChange={e => setDeliveryFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#7b4cff', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
                  📅 ANALYSIS TO
                </label>
                <input type="date" className="input-field" value={deliveryTo} onChange={e => setDeliveryTo(e.target.value)} />
              </div>
              <button
                className="btn-primary"
                onClick={fetch}
                disabled={loading}
                style={{ justifyContent: 'center' }}
              >
                {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Calculating…</> : '📊 Compute Accuracy'}
              </button>
            </div>
            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.25)', fontSize: 12, color: '#ff2d78' }}>
                ⛔ {error}
              </div>
            )}
          </div>

          {/* Procurement implication card */}
          <div
            className="glass-card"
            style={{
              padding: '18px 20px',
              marginTop: 16,
              borderColor: 'rgba(255,184,0,0.2)',
              background: 'rgba(255,184,0,0.04)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800', marginBottom: 10 }}>
              ⚡ Procurement Implication
            </div>
            <p style={{ fontSize: 12, color: '#7a9bbd', lineHeight: 1.65 }}>
              MAE at <b style={{ color: '#e8f4ff' }}>day-ahead horizon</b> defines your minimum thermal capacity buffer.
              If MAE is <b style={{ color: '#ffb800' }}>1,200 MW</b> at 36h horizon, you must hold at least that much
              fast-response generation on standby to cover wind shortfalls.
              Larger RMSE signals fat-tailed risk — consider procuring an additional volatility premium.
              Negative <b style={{ color: '#00ffcc' }}>bias</b> (systematic over-forecast) is particularly dangerous:
              it leads to under-procurement.
            </p>
          </div>
        </div>

        {/* ── Charts ── */}
        <div className="fade-in-up delay-200">

          {/* Overall metrics */}
          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              {[
                {
                  label: 'MAE',
                  sub: 'Mean Absolute Error',
                  value: data.overall.mae,
                  color: '#00d4ff',
                  icon: '📏',
                  desc: 'Average magnitude of forecast error'
                },
                {
                  label: 'RMSE',
                  sub: 'Root Mean Sq. Error',
                  value: data.overall.rmse,
                  color: '#ffb800',
                  icon: '📐',
                  desc: 'Penalises large errors more heavily'
                },
                {
                  label: 'Bias',
                  sub: 'Systematic over/under',
                  value: data.overall.bias,
                  color: data.overall.bias >= 0 ? '#00ffcc' : '#ff2d78',
                  icon: '⚖️',
                  desc: data.overall.bias >= 0 ? 'Systematically over-forecasting' : 'Systematically under-forecasting'
                },
              ].map((m, i) => (
                <div key={i} className="metric-card" style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: 'JetBrains Mono, monospace', color: m.color, textShadow: `0 0 20px ${m.color}50` }}>
                    {m.value >= 0 ? '' : '−'}
                    <AnimatedNumber value={Math.abs(m.value)} decimals={0} suffix=" MW" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e8f4ff', marginTop: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: '#3d5a7a', marginTop: 4 }}>{m.sub}</div>
                  <div style={{ fontSize: 10, color: '#3d5a7a', marginTop: 6, lineHeight: 1.4 }}>{m.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* Horizon chart */}
          <div className="glass-card" style={{ padding: '24px 24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                  Error vs Forecast Horizon
                </h3>
                <p style={{ fontSize: 12, color: '#7a9bbd' }}>
                  How accuracy degrades as horizon increases — the procurement buffer driver
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['mae', 'rmse', 'bias'] as const).map(mode => (
                  <button
                    key={mode}
                    className={`btn-secondary ${chartMode === mode ? 'active' : ''}`}
                    onClick={() => setChartMode(mode)}
                    style={{
                      padding: '6px 14px',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      ...(chartMode === mode ? {
                        color: '#00d4ff',
                        borderColor: 'rgba(0,212,255,0.4)',
                        background: 'rgba(0,212,255,0.08)',
                      } : {}),
                    }}
                  >
                    {mode.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" />
              </div>
            )}

            {!loading && !data && (
              <div style={{ height: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <WindTurbine size={60} speed={4} glowColor="#3d5a7a" />
                <p style={{ color: '#3d5a7a', fontSize: 14 }}>Click Compute Accuracy to start</p>
              </div>
            )}

            {!loading && data && data.by_horizon.length === 0 && (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#7a9bbd' }}>No paired data — ingest actuals + forecasts first.</p>
              </div>
            )}

            {!loading && data && data.by_horizon.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.by_horizon} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
                  <XAxis
                    dataKey="horizon_label"
                    tick={{ fill: '#3d5a7a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(0,212,255,0.1)' }}
                  />
                  <YAxis
                    tickFormatter={v => `${Math.round(v)} MW`}
                    tick={{ fill: '#3d5a7a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip content={<HorizonTooltip />} />
                  {chartMode === 'bias' && <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />}
                  <Bar dataKey={chartMode} name={chartMode.toUpperCase()} radius={[4, 4, 0, 0]}>
                    {data.by_horizon.map((entry, i) => (
                      <Cell key={i} fill={horizonColor(entry.horizon_hours)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Procurement buffer table */}
          {data && data.by_horizon.length > 0 && (
            <div className="glass-card" style={{ padding: '20px 24px', marginTop: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#7a9bbd', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
                Implied Procurement Buffer by Horizon
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                  <thead>
                    <tr>
                      {['Horizon', 'MAE', 'RMSE', 'Bias', 'Recommended buffer*', 'n pairs'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#3d5a7a', borderBottom: '1px solid rgba(0,212,255,0.1)', fontWeight: 600, letterSpacing: '0.05em' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_horizon.map((row, i) => {
                      // Recommended buffer = MAE + 0.5 * (RMSE - MAE) for conservatism
                      const buffer = row.mae + 0.5 * (row.rmse - row.mae)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(0,212,255,0.05)' }}>
                          <td style={{ padding: '10px 12px', color: horizonColor(row.horizon_hours), fontWeight: 700 }}>{row.horizon_label}</td>
                          <td style={{ padding: '10px 12px', color: '#00d4ff' }}>{row.mae.toFixed(0)} MW</td>
                          <td style={{ padding: '10px 12px', color: '#ffb800' }}>{row.rmse.toFixed(0)} MW</td>
                          <td style={{ padding: '10px 12px', color: row.bias >= 0 ? '#00ffcc' : '#ff2d78' }}>
                            {row.bias >= 0 ? '+' : ''}{row.bias.toFixed(0)} MW
                          </td>
                          <td style={{ padding: '10px 12px', color: '#e8f4ff', fontWeight: 700 }}>{buffer.toFixed(0)} MW</td>
                          <td style={{ padding: '10px 12px', color: '#3d5a7a' }}>{row.count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 10, color: '#3d5a7a', marginTop: 12 }}>
                * Recommended buffer = MAE + 0.5 × (RMSE − MAE). Conservative estimate; adjust with risk appetite.
                Bias-correct by shifting buffer by the bias value.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
