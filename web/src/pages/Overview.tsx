import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { META, reason, ago, pct, useApi, type St, type Svc } from '../lib'
import { BlurText, CountUp, Reveal, Badge, Card, Dot, Failed, Loading, UptimeBars } from '../ui'

const BANNER: Record<St, string> = { operational: 'すべてのシステムが正常に稼働しています', degraded: '一部のサービスで問題が発生しています', outage: '障害が発生しているサービスがあります', unknown: '状態を取得しています' }

function Row({ s, nested }: { s: Svc; nested?: boolean }) {
  return (
    <Link to={`/s/${s.id}`} className={`block px-4 py-3.5 transition-colors hover:bg-fg/[0.04] ${nested ? 'pl-8' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium"><Dot status={s.status} live /><span className="truncate">{s.nameJa}</span></span>
        <span className="flex shrink-0 items-center gap-3 text-sm"><span className="tnum text-muted">{pct(s.uptime)}</span><Badge status={s.status} /></span>
      </div>
      {reason(s.status, s.code, s.ms) && <p className="-mt-1 mb-2 pl-[18px] text-xs" style={{ color: META[s.status].color }}>{reason(s.status, s.code, s.ms)}</p>}
      <UptimeBars days={s.days} count={60} />
    </Link>
  )
}

type CronStat = { ok: number; ng: number; skip: number; runs: number; last: string; total: number }
const CRONS: [string, string][] = [['records', 'レコード更新(7日以内)'], ['records-today', '今日のレコード更新'], ['users', 'ユーザー情報更新']]

function CronCard() {
  const { data } = useApi<Record<string, CronStat>>('/api/cron')
  if (!data) return null
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-line px-4 py-3 text-sm font-medium">定期更新(直近1周分の合計)</div>
      <ul className="divide-y divide-line">
        {CRONS.map(([k, label]) => {
          const d = data[k], total = d ? d.ok + d.ng : 0
          return (
            <li key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="truncate">{label}</span>
              {d && total ? (
                <span className="tnum shrink-0 text-muted">{d.ok.toLocaleString()} / {(d.total ?? total).toLocaleString()}件更新 <span className={d.ng ? 'font-medium text-[#e5484d]' : ''}>{d.ng.toLocaleString()}件失敗</span></span>
              ) : <span className="shrink-0 text-muted">データなし</span>}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default function Overview() {
  const { data, err } = useApi<{ overall: St; services: Svc[]; generatedAt: string }>('/api/status?days=60')
  useEffect(() => { document.title = 'ステータス - おはツイKeeper' }, [])
  if (err && !data) return <Failed />
  if (!data) return <Loading />
  const ups = data.services.filter((x) => x.uptime != null).map((x) => x.uptime as number)
  const avg = ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : null
  const parents = data.services.filter((s) => !s.parentId)
  const last = data.services.map((s) => s.checkedAt).filter(Boolean).sort().pop()
  const m = META[data.overall]
  return (
    <>
      <Reveal>
        <Card className="relative mb-6 overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-25 blur-3xl" style={{ background: m.color }} />
          <div className="relative flex items-center gap-4">
            <span className="size-3.5 shrink-0 rounded-full pulse" style={{ background: m.color, color: m.color }} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl"><BlurText text={BANNER[data.overall]} /></h1>
              {last && <p className="mt-1 text-xs text-muted">最終チェック {ago(last)}</p>}
            </div>
            {avg != null && <div className="hidden text-right sm:block"><div className="text-2xl font-semibold" style={{ color: m.color }}><CountUp to={avg} suffix="%" /></div><div className="text-[11px] text-muted">60日平均稼働率</div></div>}
          </div>
        </Card>
      </Reveal>
      <Card className="divide-y divide-line overflow-hidden">
        {parents.map((p, pi) => {
          const kids = data.services.filter((c) => c.parentId === p.id)
          const bad = kids.filter((k) => k.status !== 'operational' && k.status !== 'unknown')
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + pi * 0.07 }}>
              <Row s={p} />
              {bad.length > 0 && (
                <div className="border-t border-line/60 bg-fg/[0.02] px-4 py-2.5 text-xs">
                  <span className="font-medium" style={{ color: META[bad.some((k) => k.status === 'outage') ? 'outage' : 'degraded'].color }}>
                    {bad.map((k) => k.nameJa).join('・')} のページで問題が発生しています
                  </span>
                  <ul className="mt-1 space-y-0.5 text-muted">{bad.map((k) => <li key={k.id}><Link to={`/s/${k.id}`} className="hover:text-fg">{k.nameJa}: {reason(k.status, k.code, k.ms)}</Link></li>)}</ul>
                </div>
              )}
            </motion.div>
          )
        })}
      </Card>
      <CronCard />
      <p className="mt-3 text-center text-xs text-muted">直近60日の稼働率。各バーにカーソルを合わせると日ごとの内訳が見られます。</p>
    </>
  )
}
