import { useEffect, useState } from 'react'

export type St = 'operational' | 'degraded' | 'outage' | 'unknown'
export interface Day { date: string; total: number; ok: number; uptime: number | null }
export interface Svc { id: string; name: string; nameJa: string; publicUrl: string; parentId: string | null; affectsJa: string[]; status: St; ms: number | null; code: number | null; checkedAt: string | null; uptime: number | null; days: Day[] }
export interface Inc { id: string; serviceId: string; severity: St; startedAt: string; endedAt: string | null; minutes: number; checks: number }

export const META: Record<St, { label: string; color: string; text: string }> = {
  operational: { label: '正常', color: 'var(--ok)', text: 'text-ok' },
  degraded: { label: '一部障害', color: 'var(--warn)', text: 'text-warn' },
  outage: { label: '障害発生中', color: 'var(--bad)', text: 'text-bad' },
  unknown: { label: '未取得', color: 'var(--none)', text: 'text-muted' },
}

/** 稼働率→色。100%=緑、99%未満=黄、95%未満=赤、データなし=灰 */
export const uptimeColor = (u: number | null) => (u == null ? 'var(--none)' : u >= 99.5 ? 'var(--ok)' : u >= 95 ? 'var(--warn)' : 'var(--bad)')
export const pct = (u: number | null) => (u == null ? '—' : u >= 99.995 ? '100%' : `${u.toFixed(u >= 99 ? 2 : 1)}%`)

export function fmtMin(m: number) {
  if (m < 60) return `${m}分`
  const h = Math.floor(m / 60), r = m % 60
  return h < 24 ? `${h}時間${r ? `${r}分` : ''}` : `${Math.floor(h / 24)}日${h % 24 ? `${h % 24}時間` : ''}`
}
const dtf = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const dtfY = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtDt = (s: string) => dtf.format(new Date(s))
export const fmtDtFull = (s: string) => dtfY.format(new Date(s))
export const ago = (s: string) => { const m = Math.round((Date.now() - Date.parse(s)) / 60000); return m < 1 ? 'たった今' : m < 60 ? `${m}分前` : `${Math.round(m / 60)}時間前` }

/** 取得 + 60秒ごとの自動更新 */
export function useApi<T>(url: string, keep = false) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    const load = () => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => { if (alive) { setData(d); setErr(false) } }).catch(() => alive && setErr(true))
    if (!keep) setData(null)
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [url, keep])
  return { data, err }
}

const HTTP: Record<number, string> = { 400: '不正なリクエスト', 401: '認証が必要', 403: 'アクセス拒否', 404: 'ページが見つかりません', 408: 'リクエストタイムアウト', 429: 'リクエスト過多',
  500: 'サーバー内部エラー', 502: 'ゲートウェイエラー', 503: 'サービス利用不可', 504: 'ゲートウェイタイムアウト' }
/** 異常の内容(正常・未取得は null)。例: 「HTTP 403 アクセス拒否」 */
export function reason(status: St, code: number | null, ms: number | null): string | null {
  if (status === 'operational' || status === 'unknown') return null
  if (code == null) return '接続できません(タイムアウト・DNS・TLSのいずれか)'
  if (code >= 300 && code < 400) return `HTTP ${code} ログインページへ転送(認証切れ)`
  if (code >= 400) return `HTTP ${code} ${HTTP[code] ?? (code >= 500 ? 'サーバーエラー' : 'クライアントエラー')}`
  return ms != null && ms > 12000 ? `応答が遅い(${(ms / 1000).toFixed(1)}秒)` : `HTTP ${code} ヘルスチェックの応答が不正`
}

export interface CheckDetail { kind: 'timeout' | 'dns' | 'refused' | 'reset' | 'tls' | 'network' | 'http' | 'login' | 'body' | 'slow'; target: string; cause?: string; location?: string; server?: string; ray?: string; ctype?: string; retry?: string }

const KIND: Record<CheckDetail['kind'], [string, string]> = {
  timeout: ['タイムアウト', '20秒以内に応答が返りませんでした。サーバーの過負荷・停止、またはネットワーク遅延の可能性があります。'],
  dns: ['名前解決失敗', 'ドメインのIPアドレスを引けませんでした。DNS設定またはDNS障害の可能性があります。'],
  refused: ['接続拒否', 'サーバーが接続を受け付けませんでした。アプリのプロセス停止や再起動中の可能性があります。'],
  reset: ['接続切断', '通信の途中で接続が切られました。アプリのクラッシュや再起動、プロキシ側の切断の可能性があります。'],
  tls: ['TLS/証明書エラー', 'HTTPSの接続確立に失敗しました。証明書の期限切れや設定不備の可能性があります。'],
  network: ['ネットワークエラー', 'サーバーへ接続できませんでした。'],
  http: ['HTTPエラー', ''],
  login: ['ログイン画面へ転送', '認証が必要なページがログインへ転送されました。監視用セッションの失効、または認証基盤の不具合の可能性があります。'],
  body: ['応答内容が異常', 'APIは応答しましたが、期待する形式(status: ok)ではありませんでした。'],
  slow: ['応答が遅い', '応答に12秒以上かかりました。負荷が高い可能性があります。'],
}

/** 原因の1行説明(HTTPは状態コード別の補足を付ける) */
export function cause(d: CheckDetail | null | undefined, code: number | null): { title: string; hint: string } | null {
  if (!d) return null
  const [title, hint] = KIND[d.kind]
  if (d.kind !== 'http') return { title, hint }
  const h = code === 502 || code === 504 ? 'リバースプロキシの先(アプリ)が応答していません。再起動中・停止中の可能性があります。'
    : code === 503 ? 'サービスが一時的に利用できません(メンテナンスや過負荷)。'
    : code === 500 ? 'サーバー内部でエラーが発生しています(アプリ側の不具合)。'
    : code === 404 ? 'ページが見つかりません。公開URLの変更や削除の可能性があります。'
    : code === 403 ? 'アクセスが拒否されました(アクセス制限・WAFの可能性)。'
    : code === 429 ? 'リクエスト過多で制限されています。'
    : ''
  return { title, hint: h }
}

/** 取得できた事実を「項目: 値」の並びにする(本文・Cookie・内部ホストは含まない) */
export function facts(d: CheckDetail | null | undefined): [string, string][] {
  if (!d) return []
  const r: [string, string][] = [['監視URL', d.target]]
  if (d.cause) r.push(['エラーコード', d.cause])
  if (d.location) r.push(['転送先', d.location])
  if (d.server) r.push(['サーバー', d.server])
  if (d.ctype) r.push(['Content-Type', d.ctype])
  if (d.retry) r.push(['Retry-After', `${d.retry}秒`])
  if (d.ray) r.push(['Cloudflare Ray ID', d.ray])
  return r
}
