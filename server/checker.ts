import fs from 'node:fs'
import services from './services.json' with { type: 'json' }
import { query } from './db'
import type { Detail, Service, Status } from './types'

const INTERVAL_MS = 3 * 60 * 1000
const TIMEOUT_MS = 20_000
const SLOW_MS = 12_000
const SERVICES = services as Service[]

function authCookie(): string | null {
  try {
    const sid = fs.readFileSync(process.env.STATUS_SESSION_COOKIE_FILE ?? '.status_session_cookie', 'utf8').trim()
    return sid ? `PHPSESSID=${sid}` : null
  } catch { return null }
}

async function checkOne(s: Service): Promise<{ status: Status; ms: number; code: number | null; detail?: Detail }> {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { 'User-Agent': 'OhatwiKeeperStatusBot/2.0' }
    const cookie = s.requiresAuth ? authCookie() : null
    if (cookie) headers.Cookie = cookie
    // ベータの招待制ゲートを通すための合言葉(ベータ側 BETA_STATUS_TOKEN と同じ値)
    if (process.env.STATUS_BETA_TOKEN && new URL(s.url).hostname.startsWith('beta.')) headers['X-Status-Bot'] = process.env.STATUS_BETA_TOKEN
    const res = await fetch(s.url, { method: s.method ?? 'HEAD', headers, signal: ctl.signal, redirect: 'manual' })
    const ms = Date.now() - t0
    // 内部URL(localhost)は公開URLに置き換え、クエリは落とす
    const target = (s.url.startsWith('https://') ? s.url : s.publicUrl).split('?')[0]
    const h = res.headers
    const loc = h.get('location'); const safePath = (v: string | null) => (v ? v.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 120) : undefined)
    const det = (kind: Detail['kind']): Detail => ({ kind, target, location: safePath(loc), server: h.get('server')?.slice(0, 40) ?? undefined, ray: h.get('cf-ray')?.slice(0, 40) ?? undefined, ctype: h.get('content-type')?.split(';')[0].slice(0, 60) ?? undefined, retry: h.get('retry-after')?.slice(0, 20) ?? undefined })
    // 認証が必要なページがログインへ飛ばされた = テスト用セッション切れ
    if (s.requiresAuth && res.status >= 300 && res.status < 400 && (res.headers.get('location') ?? '').includes('/login'))
      return { status: 'outage', ms, code: res.status, detail: det('login') }
    if (s.okCodes?.includes(res.status)) return { status: ms > SLOW_MS ? 'degraded' : 'operational', ms, code: res.status, detail: ms > SLOW_MS ? det('slow') : undefined }
    if (res.status >= 500) return { status: 'outage', ms, code: res.status, detail: det('http') }
    if (res.status >= 400) return { status: 'degraded', ms, code: res.status, detail: det('http') }
    if (s.method === 'GET') {
      let ok = true
      try { ok = (await res.json())?.status === 'ok' } catch { /* JSONでなければ本文は見ない */ }
      return { status: ok && ms <= SLOW_MS ? 'operational' : 'degraded', ms, code: res.status, detail: !ok ? det('body') : ms > SLOW_MS ? det('slow') : undefined }
    }
    return { status: ms > SLOW_MS ? 'degraded' : 'operational', ms, code: res.status, detail: ms > SLOW_MS ? det('slow') : undefined }
  } catch (e) {
    // ネットワーク層の失敗: メッセージは出さず、原因コードだけ種別に落とす
    const code = String((e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code ?? '')
    const aborted = (e as Error)?.name === 'AbortError' || /TIMEOUT/.test(code)
    const kind: Detail['kind'] = aborted ? 'timeout' : code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'dns' : code === 'ECONNREFUSED' ? 'refused' : code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' ? 'reset' : /CERT|SSL|TLS/.test(code) ? 'tls' : 'network'
    const target = (s.url.startsWith('https://') ? s.url : s.publicUrl).split('?')[0]
    return { status: 'outage', ms: Date.now() - t0, code: null, detail: { kind, target, cause: /^[A-Z0-9_]{3,40}$/.test(code) ? code : undefined } }
  } finally { clearTimeout(timer) }
}

import { rank } from './types'
async function check(s: Service) {
  const rs = await Promise.all([checkOne(s), ...(s.extraUrls ?? []).map((u) => checkOne({ ...s, url: u }))])
  return rs.reduce((w, r) => (rank[r.status] > rank[w.status] ? r : w))
}

let running = false
export async function runChecks() {
  if (running) return
  running = true
  try {
    await Promise.allSettled(SERVICES.map(async (s) => {
      const r = await check(s)
      const ins = await query<{ insertId: number }>('INSERT INTO service_checks (service_id, status, response_time_ms, status_code) VALUES (?, ?, ?, ?)', [s.id, r.status, r.ms, r.code])
      if (r.detail) await query('INSERT IGNORE INTO service_check_details (check_id, detail) VALUES (?, ?)', [(ins as unknown as { insertId: number }).insertId, JSON.stringify(r.detail)]).catch(() => {})
    }))
  } finally { running = false }
}

export function startChecker() {
  runChecks().catch(console.error)
  setInterval(() => runChecks().catch(console.error), INTERVAL_MS)
}
