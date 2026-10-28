/**
 * API client — all backend calls go through here.
 *
 * Centralising API calls in one module means:
 * - Easy to swap the base URL (env var) for dev vs prod
 * - Single place to add auth headers when needed
 * - Type-safe response shapes via TypeScript interfaces
 */
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE,
  timeout: 30_000,
})

/* ─── Response Types ────────────────────────────────────── */

export interface ForecastPoint {
  delivery_period: string   // ISO 8601 UTC
  publish_time:    string   // ISO 8601 UTC
  generation_mw:  number
}

export interface ActualPoint {
  delivery_period: string
  generation_mw:   number
}

export interface AccuracyMetrics {
  mae:   number
  rmse:  number
  bias:  number
  count: number
}

export interface HorizonBucket {
  horizon_label: string   // e.g. "0–6h", "6–12h"
  horizon_hours: number   // mid-point of bucket in hours
  mae:           number
  rmse:          number
  bias:          number
  count:         number
}

export interface AccuracyResponse {
  overall: AccuracyMetrics
  by_horizon: HorizonBucket[]
  data_window: { from: string; to: string }
  cutoff_used: string
}

export interface ForecastsAtCutoffResponse {
  cutoff:    string
  forecasts: ForecastPoint[]
  actuals:   ActualPoint[]
  data_window: { from: string; to: string }
}

export interface IngestStatus {
  windfor_rows:  number
  fuelhh_rows:   number
  data_window:   { from: string; to: string }
  last_ingest:   string | null
  using_fallback: boolean
  fallback_reason?: string
}

/* ─── API Functions ─────────────────────────────────────── */

/** Trigger data ingestion from Elexon */
export async function triggerIngest(): Promise<IngestStatus> {
  const res = await api.post<IngestStatus>('/api/v1/ingest')
  return res.data
}

/** Get ingestion status without triggering */
export async function getIngestStatus(): Promise<IngestStatus> {
  const res = await api.get<IngestStatus>('/api/v1/ingest/status')
  return res.data
}

/**
 * Core point-in-time endpoint.
 * Returns all forecasts where publishTime <= cutoff for the given delivery window.
 */
export async function getForecastsAtCutoff(
  cutoff: string,           // ISO 8601 datetime e.g. "2026-01-14T12:00:00Z"
  deliveryFrom: string,     // date e.g. "2026-01-15"
  deliveryTo: string,
): Promise<ForecastsAtCutoffResponse> {
  const res = await api.get<ForecastsAtCutoffResponse>('/api/v1/forecasts/at-cutoff', {
    params: { cutoff, delivery_from: deliveryFrom, delivery_to: deliveryTo },
  })
  return res.data
}

/** Get raw actuals for a date range */
export async function getActuals(from: string, to: string): Promise<ActualPoint[]> {
  const res = await api.get<ActualPoint[]>('/api/v1/actuals', {
    params: { from, to },
  })
  return res.data
}

/** Get accuracy metrics with horizon breakdown */
export async function getAccuracy(
  cutoff: string,
  deliveryFrom: string,
  deliveryTo: string,
): Promise<AccuracyResponse> {
  const res = await api.get<AccuracyResponse>('/api/v1/accuracy', {
    params: { cutoff, delivery_from: deliveryFrom, delivery_to: deliveryTo },
  })
  return res.data
}

export default api
