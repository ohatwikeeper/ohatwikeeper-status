import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import fs from 'node:fs'
import { startChecker } from './checker'
import { SERVICES, byId, dailyUptime, dayChecks, incidentChecks, incidents, latestChecks, recentSeries } from './queries'
import { rank, type Status } from './types'

const app = new Hono()
const clampDays = (v: string | undefined, def: number) => Math.min(Math.max(Number(v) || def, 1), 3650)
const pub = (s: (typeof SERVICES)[number]) => ({ id: s.id, name: s.name, nameJa: s.nameJa, publicUrl: s.publicUrl, parentId: s.parentId ?? null, category: s.category ?? 'page', affectsJa: s.affectsJa ?? [], pageSlug: s.pageSlug ?? null })

app.use('/api/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=15') })

app.get('/api/status', async (c) => {
  const days = clampDays(c.req.query('days'), 90)
  const [latest, daily] = await Promise.all([latestChecks(), dailyUptime(SERVICES.map((s) => s.id), days)])
  const list = SERVICES.map((s) => {
    const d = daily[s.id] ?? [], total = d.reduce((a, x) => a + x.total, 0), ok = d.reduce((a, x) => a + x.ok, 0)
    const l = latest[s.id]
    return { ...pub(s), status: (l?.status ?? 'unknown') as Status | 'unknown', ms: l?.ms ?? null, code: l?.code ?? null, checkedAt: l?.at ?? null, uptime: total ? (ok / total) * 100 : null, days: d }
  })
  const worst = list.reduce<Status>((w, s) => (s.status !== 'unknown' && rank[s.status] > rank[w] ? s.status : w), 'operational')
  return c.json({ overall: worst, services: list, generatedAt: new Date().toISOString() })
})

app.get('/api/services/:id/day', async (c) => {
  const s = byId.get(c.req.param('id')), date = c.req.query('date') ?? ''
  if (!s) return c.json({ error: 'not_found' }, 404)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'bad_date' }, 400)
  const from = new Date(`${date}T00:00:00`).getTime(), to = from + 86_400_000
  const [checks, inc] = await Promise.all([dayChecks(s.id, date), incidents()])
  return c.json({ id: s.id, nameJa: s.nameJa, date, checks,
    incidents: inc.filter((i) => i.serviceId === s.id && Date.parse(i.startedAt) < to && (i.endedAt ? Date.parse(i.endedAt) : Date.now()) >= from) })
})

app.get('/api/services/:id', async (c) => {
  const s = byId.get(c.req.param('id'))
  if (!s) return c.json({ error: 'not_found' }, 404)
  const days = clampDays(c.req.query('days'), 365)
  const [latest, daily, series, inc] = await Promise.all([latestChecks(), dailyUptime([s.id], days), recentSeries(s.id, 48), incidents()])
  const d = daily[s.id] ?? [], total = d.reduce((a, x) => a + x.total, 0), ok = d.reduce((a, x) => a + x.ok, 0)
  return c.json({ ...pub(s), latest: latest[s.id] ?? null, uptime: total ? (ok / total) * 100 : null, days: d, series, incidents: inc.filter((i) => i.serviceId === s.id).slice(0, 20),
    children: SERVICES.filter((x) => x.parentId === s.id).map(pub) })
})

app.get('/api/incidents', async (c) => {
  const sid = c.req.query('service'), page = Math.max(Number(c.req.query('page')) || 1, 1), per = 30
  const all = (await incidents()).filter((i) => !sid || i.serviceId === sid)
  return c.json({ total: all.length, page, per, items: all.slice((page - 1) * per, page * per), ongoing: all.filter((i) => !i.endedAt).length })
})

app.get('/api/incidents/:id', async (c) => {
  const i = (await incidents()).find((x) => x.id === c.req.param('id'))
  if (!i) return c.json({ error: 'not_found' }, 404)
  const s = byId.get(i.serviceId)!
  return c.json({ ...i, service: pub(s), timeline: await incidentChecks(i) })
})

// 本体の cron(過去24時間の成功/失敗)を取得して返す。本体が落ちていても status は動かす
const CRON_URL = process.env.CRON_STATS_URL ?? 'https://ohatwikeeper.com/app-api/cron-stats'
let cronCache: { at: number; data: unknown } | null = null
app.get('/api/cron', async (c) => {
  if (!cronCache || Date.now() - cronCache.at > 60_000) {
    try {
      const r = await fetch(CRON_URL, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(String(r.status))
      cronCache = { at: Date.now(), data: await r.json() }
    } catch { return c.json(cronCache?.data ?? {}) }
  }
  return c.json(cronCache.data)
})
app.get('/healthz', (c) => c.text('ok'))
app.use('/*', serveStatic({ root: './dist' }))
const index = () => (fs.existsSync('./dist/index.html') ? fs.readFileSync('./dist/index.html', 'utf8') : 'build required')
app.get('*', (c) => c.html(index()))

app.onError((e, c) => { console.error(e); return c.json({ error: 'internal' }, 500) })

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3120) })
if (process.env.DISABLE_CHECKER !== '1') startChecker()
console.log(`status server :${process.env.PORT ?? 3120}`)
