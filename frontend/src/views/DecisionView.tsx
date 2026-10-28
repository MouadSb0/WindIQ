/**
 * DecisionView — "What did we know at time T?"
 *
 * This is the product's most important screen. It implements point-in-time
 * correctness: given a user-chosen cutoff time, it shows ONLY forecasts
 * whose publishTime <= cutoff. This mirrors exactly what a trader would
 * have seen on their desk at that moment.
 *
 * UX design:
 * - Datetime picker for cutoff (defaults to yesterday 12:00 UTC)
 * - Date range for delivery day (defaults to the following calendar day)
 * - Animated chart overlaying forecast vs actuals
 * - Side panel showing data freshness (how old is the latest used forecast?)
 * - "Ingest data" button with loading state
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { format, parseISO, addDays, subDays } from 'date-fns'
import {
  getForecastsAtCutoff, triggerIngest, getIngestStatus,
  type ForecastsAtCutoffResponse, type IngestStatus,
} from '../api/client'
import { WindTurbine } from '../components/WindTurbine'

/* ─── Helpers ───────────────────────────────────────────── */

function formatMW(mw: number) {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${Math.round(mw)} MW`
}

function isoToLabel(iso: string): string {
  try {
    return format(parseISO(iso), 'HH:mm')
  } catch {
    return iso
  }
}

/* ─── Custom Tooltip ─────────────────────────────────────── */

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number; name: string; color: string}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'rgba(6,14,30,0.97)',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 10,
        padding: '12px 16px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 0 24px rgba(0,212,255,0.2)',
        minWidth: 180,
      }}
    >
      <div style={{ color: '#7a9bbd', marginBottom: 8, fontSize: 11 }}>🕐 {label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ color: '#e8f4ff', fontWeight: 700 }}>{formatMW(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Loading skeleton ───────────────────────────────────── */

function ChartSkeleton() {
  return (
    <div style={{ height: 380, display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
      {[100, 60, 85, 45, 70, 55, 90].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 4 }} />
      ))}
    </div>
  )
}

/* ─── Main View ──────────────────────────────────────────── */

export function DecisionView() {
  // Default: cutoff = yesterday 12:00 UTC, delivery = today
  const yesterday = subDays(new Date(), 1)
  const defaultCutoff = format(yesterday, "yyyy-MM-dd") + "T12:00"
  const defaultDeliveryFrom = format(new Date(), "yyyy-MM-dd")
  const defaultDeliveryTo = format(addDays(new Date(), 1), "yyyy-MM-dd")

  const [cutoff, setCutoff] = useState(defaultCutoff)
  const [deliveryFrom, setDeliveryFrom] = useState(defaultDeliveryFrom)
  const [deliveryTo, setDeliveryTo] = useState(defaultDeliveryTo)

  const [data, setData] = useState<ForecastsAtCutoffResponse | null>(null)
  const [status, setStatus] = useState<IngestStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch ingest status on mount & auto-sync parameters to ingested data window
  useEffect(() => {
    getIngestStatus()
      .then(st => {
        setStatus(st)
        if (st && st.data_window && st.data_window.from) {
          const base = st.data_window.from.slice(0, 7) // '2025-10'
          setCutoff(base + "-15T12:00")
          setDeliveryFrom(base + "-16")
          setDeliveryTo(base + "-16")
        }
      })
      .catch(() => setStatus(null))
  }, [])

  const fetchData = useCallback(async () => {
    if (!cutoff || !deliveryFrom) return
    setLoading(true)
    setError(null)
    try {
      const cutoffISO = cutoff.includes('Z') ? cutoff : cutoff + ':00Z'
      const result = await getForecastsAtCutoff(cutoffISO, deliveryFrom, deliveryTo)
      setData(result)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail ?? (e as Error)?.message ?? 'API error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [cutoff, deliveryFrom, deliveryTo])

  const handleIngest = async () => {
    setIngesting(true)
    try {
      const result = await triggerIngest()
      setStatus(result)
      await fetchData()
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Ingest failed')
    } finally {
      setIngesting(false)
    }
  }

  // Build chart data: merge forecasts + actuals on delivery_period
  const chartData = (() => {
    if (!data) return []
    const actualsMap = new Map(data.actuals.map(a => [a.delivery_period, a.generation_mw]))

    // For each delivery_period, take the LATEST forecast <= cutoff
    // (the server already filtered by publishTime <= cutoff; here we pick the newest vintage)
    const forecastMap = new Map<string, number>()
    const forecastTimeMap = new Map<string, string>()
    for (const f of data.forecasts) {
      const lastPt = forecastTimeMap.get(f.delivery_period)
      if (lastPt === undefined || f.publish_time > lastPt) {
        forecastMap.set(f.delivery_period, f.generation_mw)
        forecastTimeMap.set(f.delivery_period, f.publish_time)
      }
    }

    // Collect all unique delivery periods and sort
    const periods = [...new Set([
      ...data.forecasts.map(f => f.delivery_period),
      ...data.actuals.map(a => a.delivery_period),
    ])].sort()

    return periods.map(period => ({
      time:     isoToLabel(period),
      forecast: forecastMap.get(period) ?? null,
      actual:   actualsMap.get(period) ?? null,
    })).filter(d => d.forecast !== null || d.actual !== null)
  })()

  // Summary stats
  const maxForecast = chartData.length ? Math.max(...chartData.map(d => d.forecast ?? 0)) : 0
  const minForecast = chartData.length ? Math.min(...chartData.filter(d => d.forecast !== null).map(d => d.forecast!)) : 0
  const forecastsUsed = data ? [...new Set(data.forecasts.map(f => f.publish_time))].length : 0

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>

      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <WindTurbine size={42} speed={2.8} glowColor="#00d4ff" />
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>
              Decision View
            </h2>
            <p style={{ color: '#7a9bbd', fontSize: 13 }}>
              What did the market know at your chosen cutoff time?
            </p>
          </div>
        </div>
        <div className="electric-line" style={{ marginTop: 20 }} />
      </div>

      {/* Explainer banner */}
      <div
        className="glass-card fade-in-up delay-100"
        style={{
          padding: '16px 24px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          borderColor: 'rgba(255,184,0,0.25)',
          background: 'rgba(255,184,0,0.04)',
        }}
      >
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb800', marginBottom: 4 }}>
            Point-in-Time Correctness
          </div>
          <div style={{ fontSize: 12, color: '#7a9bbd', lineHeight: 1.6 }}>
            Only forecasts where <code style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>publishTime ≤ cutoff</code> are shown.
            This eliminates look-ahead bias — you see exactly what a trader would have seen on their desk at the cutoff moment.
            Showing the <em>latest</em> forecast for a delivery period without this filter is a common but fatal modelling error.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Controls Panel ── */}
        <div className="fade-in-up delay-200">
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#7a9bbd', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
              Parameters
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Cutoff time */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6, letterSpacing: '0.06em' }}>
                  ⏱ DECISION CUTOFF
                </label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={cutoff}
                  onChange={e => setCutoff(e.target.value)}
                />
                <div style={{ fontSize: 10, color: '#3d5a7a', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                  Forecasts published after this time are hidden
                </div>
              </div>

              {/* Delivery From */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#00ffcc', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6, letterSpacing: '0.06em' }}>
                  📅 DELIVERY FROM
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={deliveryFrom}
                  onChange={e => setDeliveryFrom(e.target.value)}
                />
              </div>

              {/* Delivery To */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#7b4cff', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6, letterSpacing: '0.06em' }}>
                  📅 DELIVERY TO
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={deliveryTo}
                  onChange={e => setDeliveryTo(e.target.value)}
                />
              </div>

              {/* Action buttons */}
              <button
                className="btn-primary"
                onClick={fetchData}
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              >
                {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Loading…</> : '⚡ Fetch Forecasts'}
              </button>

              <button
                className="btn-secondary"
                onClick={handleIngest}
                disabled={ingesting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {ingesting ? '⏳ Ingesting…' : '🔄 Re-ingest from Elexon'}
              </button>
            </div>

            {/* Ingest status */}
            {status && (
              <div style={{ marginTop: 24, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,255,204,0.05)', border: '1px solid rgba(0,255,204,0.15)' }}>
                <div style={{ fontSize: 11, color: '#00ffcc', fontWeight: 700, marginBottom: 8, letterSpacing: '0.08em' }}>
                  DATA STATUS
                </div>
                <div style={{ fontSize: 11, color: '#7a9bbd', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: 'JetBrains Mono, monospace' }}>
                  <span>WINDFOR: <b style={{ color: '#e8f4ff' }}>{status.windfor_rows?.toLocaleString() ?? '—'}</b> rows</span>
                  <span>FUELHH:  <b style={{ color: '#e8f4ff' }}>{status.fuelhh_rows?.toLocaleString() ?? '—'}</b> rows</span>
                  <span>Window: <b style={{ color: '#e8f4ff' }}>{status.data_window?.from?.slice(0, 10)} → {status.data_window?.to?.slice(0, 10)}</b></span>
                  {status.using_fallback && (
                    <span style={{ color: '#ffb800' }}>⚠ Fallback window in use</span>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.25)', fontSize: 12, color: '#ff2d78' }}>
                ⛔ {error}
              </div>
            )}
          </div>

          {/* Forecast count cards */}
          {data && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              {[
                { label: 'Vintages used', value: forecastsUsed, color: '#00d4ff' },
                { label: 'Periods covered', value: chartData.length, color: '#00ffcc' },
                { label: 'Peak forecast', value: formatMW(maxForecast), color: '#7b4cff' },
                { label: 'Trough forecast', value: formatMW(minForecast), color: '#ff2d78' },
              ].map((s, i) => (
                <div key={i} className="metric-card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: 'JetBrains Mono, monospace', textShadow: `0 0 12px ${s.color}60` }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, color: '#7a9bbd', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Chart Panel ── */}
        <div className="fade-in-up delay-300">
          <div className="glass-card" style={{ padding: '28px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                  Wind Generation Forecast vs Actual
                </h3>
                <p style={{ fontSize: 12, color: '#7a9bbd', fontFamily: 'JetBrains Mono, monospace' }}>
                  Cutoff: <span style={{ color: '#00d4ff' }}>{cutoff.replace('T', ' ') + ' UTC'}</span>
                </p>
              </div>
              {data && (
                <div className="badge-live">
                  <div className="pulse-dot" />
                  {data.forecasts.length} forecasts
                </div>
              )}
            </div>

            {loading && <ChartSkeleton />}

            {!loading && !data && (
              <div style={{ height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <WindTurbine size={80} speed={4} glowColor="#3d5a7a" />
                <p style={{ color: '#3d5a7a', fontSize: 14 }}>Set parameters and click Fetch Forecasts</p>
              </div>
            )}

            {!loading && data && chartData.length === 0 && (
              <div style={{ height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ fontSize: 40 }}>📭</span>
                <p style={{ color: '#7a9bbd', fontSize: 14 }}>No forecasts found for this cutoff/window combination.</p>
                <p style={{ color: '#3d5a7a', fontSize: 12 }}>Try re-ingesting data or adjusting the date range.</p>
              </div>
            )}

            {!loading && data && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00ffcc" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00ffcc" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#3d5a7a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(0,212,255,0.1)' }}
                    interval={5}
                  />
                  <YAxis
                    tickFormatter={v => `${(v/1000).toFixed(0)}GW`}
                    tick={{ fill: '#3d5a7a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: 16, fontSize: 12, color: '#7a9bbd' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast (publishTime ≤ cutoff)"
                    stroke="#00d4ff"
                    strokeWidth={2.5}
                    fill="url(#forecastGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#00d4ff', stroke: '#001824', strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    name="Actual (FUELHH)"
                    stroke="#00ffcc"
                    strokeWidth={2.5}
                    fill="url(#actualGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#00ffcc', stroke: '#001824', strokeWidth: 2 }}
                    strokeDasharray="6 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Forecast vintage timeline */}
          {data && data.forecasts.length > 0 && (
            <div className="glass-card fade-in-up" style={{ padding: '20px 24px', marginTop: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#7a9bbd', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                Forecast Vintages Used  <span style={{ color: '#00d4ff' }}>(publishTime ≤ cutoff)</span>
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...new Set(data.forecasts.map(f => f.publish_time))].sort().map(pt => (
                  <div
                    key={pt}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      background: 'rgba(0,212,255,0.06)',
                      border: '1px solid rgba(0,212,255,0.15)',
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#7a9bbd',
                    }}
                  >
                    {pt.replace('T', ' ').replace('Z', ' UTC').slice(0, 19)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
