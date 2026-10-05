import services from './services.json' with { type: 'json' }
import { query } from './db'
import { rank, type Service, type Status } from './types'

export const SERVICES = services as Service[]
export const byId = new Map(SERVICES.map((s) => [s.id, s]))
const GAP_MS = 5 * 60 * 1000 // チェック間隔(3分)より空いたら別の障害とみなす
const STEP_MS = 3 * 60 * 1000

const cache = new Map<string, { at: number; v: unknown }>()
async function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v as T
  const v = await fn()
  cache.set(key, { at: Date.now(), v })
  return v
}

export interface Day { date: string; total: number; ok: number; uptime: number | null }

/** サービスごとの日次稼働率。days を大きくすれば全期間も取れる */
export const dailyUptime = (ids: string[], days: number) => memo(`d:${ids.join()}:${days}`, 60_000, async () => {
  type R = { service_id: string; d: string; total: number; ok: number }
  const run = (col: string) => query<R>(
    `SELECT service_id, DATE_FORMAT(${col},'%Y-%m-%d') d, COUNT(*) total, SUM(status='operational') ok
       FROM service_checks WHERE ${col} >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND service_id IN (?)
      GROUP BY service_id, ${col} ORDER BY ${col}`, [days, ids])
  // checked_date(生成列・索引つき)を優先し、無い環境では DATE(checked_at) に切り替える
  const rows = await run('checked_date').catch(() => run('DATE(checked_at)'))
  const out: Record<string, Day[]> = Object.fromEntries(ids.map((i) => [i, []]))
  for (const r of rows) out[r.service_id].push({ date: r.d, total: Number(r.total), ok: Number(r.ok), uptime: r.total ? (Number(r.ok) / Number(r.total)) * 100 : null })
  return out
})

export interface Latest { status: Status; ms: number | null; code: number | null; at: string }
export const latestChecks = () => memo('latest', 15_000, async () => {
  const rows = await query<{ service_id: string; status: Status; response_time_ms: number | null; status_code: number | null; checked_at: Date; detail: unknown }>(
    `SELECT c.service_id, c.status, c.response_time_ms, c.status_code, c.checked_at FROM service_checks c
       JOIN (SELECT service_id, MAX(checked_at) m FROM service_checks WHERE checked_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) GROUP BY service_id) x
         ON x.service_id = c.service_id AND x.m = c.checked_at`)
  const out: Record<string, Latest> = {}
  for (const r of rows) out[r.service_id] = { status: r.status, ms: r.response_time_ms, code: r.status_code, at: new Date(r.checked_at).toISOString() }
  return out
})

/** 直近 hours 時間の応答時間(15分平均)。グラフ用 */
export const recentSeries = (id: string, hours: number) => memo(`r:${id}:${hours}`, 60_000, async () => {
  const rows = await query<{ t: number; ms: number | null; bad: number }>(
    `SELECT UNIX_TIMESTAMP(FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(checked_at)/900)*900)) t, AVG(response_time_ms) ms, SUM(status<>'operational') bad
       FROM service_checks WHERE service_id = ? AND checked_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) GROUP BY t ORDER BY t`, [id, hours])
  return rows.map((r) => ({ t: Number(r.t) * 1000, ms: r.ms == null ? null : Math.round(Number(r.ms)), bad: Number(r.bad) }))
})

export interface Incident { id: string; serviceId: string; severity: Status; startedAt: string; endedAt: string | null; minutes: number; checks: number }

/** operational 以外のチェックが連続した区間を障害として導出する(障害専用テーブルは持たない) */
export const incidents = () => memo('inc', 60_000, async () => {
  const rows = await query<{ service_id: string; status: Status; checked_at: Date }>(
    `SELECT service_id, status, checked_at FROM service_checks WHERE status <> 'operational' ORDER BY service_id, checked_at`)
  const out: Incident[] = []
  let cur: (Incident & { last: number }) | null = null
  const flush = () => {
    if (!cur) return
    const { last, ...i } = cur
    const ongoing = Date.now() - last <= GAP_MS
    out.push({ ...i, endedAt: ongoing ? null : new Date(last + STEP_MS).toISOString(), minutes: Math.max(1, Math.round((last - Date.parse(i.startedAt) + STEP_MS) / 60000)) })
    cur = null
  }
  for (const r of rows) {
    if (!byId.has(r.service_id)) continue
    const t = new Date(r.checked_at).getTime()
    if (cur && (cur.serviceId !== r.service_id || t - cur.last > GAP_MS)) flush()
    if (!cur) cur = { id: `${r.service_id}.${Math.floor(t / 1000)}`, serviceId: r.service_id, severity: r.status, startedAt: new Date(t).toISOString(), endedAt: null, minutes: 0, checks: 0, last: t }
    cur.last = t; cur.checks++
    if (rank[r.status] > rank[cur.severity]) cur.severity = r.status
  }
  flush()
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
})

export async function incidentChecks(i: Incident) {
  const from = new Date(Date.parse(i.startedAt) - STEP_MS * 2), to = new Date((i.endedAt ? Date.parse(i.endedAt) : Date.now()) + STEP_MS * 2)
  const rows = await query<{ status: Status; response_time_ms: number | null; status_code: number | null; checked_at: Date; detail: unknown }>(
    `SELECT c.status, c.response_time_ms, c.status_code, c.checked_at, d.detail FROM service_checks c LEFT JOIN service_check_details d ON d.check_id = c.id WHERE c.service_id = ? AND c.checked_at BETWEEN ? AND ? ORDER BY c.checked_at LIMIT 2000`, [i.serviceId, from, to])
  return rows.map((r) => ({ at: new Date(r.checked_at).toISOString(), status: r.status, ms: r.response_time_ms, code: r.status_code, detail: parseDetail(r.detail) }))
}

/** 1日分の全チェック(DB側の DATE(checked_at) と dailyUptime の集計日を揃える) */
export async function dayChecks(serviceId: string, date: string) {
  const rows = await query<{ status: Status; response_time_ms: number | null; status_code: number | null; checked_at: Date; detail: unknown }>(
    `SELECT c.status, c.response_time_ms, c.status_code, c.checked_at, d.detail FROM service_checks c LEFT JOIN service_check_details d ON d.check_id = c.id WHERE c.service_id = ? AND DATE(c.checked_at) = ? ORDER BY c.checked_at LIMIT 2000`, [serviceId, date])
  return rows.map((r) => ({ at: new Date(r.checked_at).toISOString(), status: r.status, ms: r.response_time_ms, code: r.status_code, detail: parseDetail(r.detail) }))
}

function parseDetail(v: unknown) {
  if (!v) return null
  try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null }
}
