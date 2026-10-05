import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { reason, ago, fmtDt, fmtMin, pct, useApi, type Day, type Inc, type St } from '../lib'
import { Badge, Card, Failed, Loading, Spark, UptimeBars } from '../ui'

interface Detail { id: string; parentId: string | null; nameJa: string; publicUrl: string; affectsJa: string[]; uptime: number | null; days: Day[]; incidents: Inc[]; latest: { status: St; ms: number | null; code: number | null; at: string } | null
  series: { t: number; ms: number | null; bad: number }[]; children: { id: string; nameJa: string; category?: 'system' | 'page' | 'api' }[] }

const CATS = [['system', 'システム'], ['page', '個別ページ'], ['api', 'API']] as const
const RANGES = [{ d: 30, l: '30日' }, { d: 90, l: '90日' }, { d: 365, l: '1年' }, { d: 3650, l: '全期間' }] as const

/** 全期間は棒が多すぎるので月単位にまとめる */
function monthly(days: Day[]): Day[] {
  const m = new Map<string, Day>()
  for (const d of days) { const k = d.date.slice(0, 7); const x = m.get(k) ?? { date: k, total: 0, ok: 0, uptime: null }; x.total += d.total; x.ok += d.ok; m.set(k, x) }
  return [...m.values()].map((x) => ({ ...x, uptime: x.total ? (x.ok / x.total) * 100 : null }))
}

export default function ServicePage() {
  const { id, sub } = useParams()
  const [range, setRange] = useState<number>(90)
  const sel = sub ? `${id}-${sub}` : null
  const root = useApi<Detail>(`/api/services/${id}?days=1`, true)
  const { data, err } = useApi<Detail>(`/api/services/${sel ?? id}?days=${range}`, true)
  useEffect(() => { if (data) document.title = `${data.nameJa} - ステータス - おはツイKeeper` }, [data])
  if (root.data?.parentId) return <Navigate to={`/s/${root.data.parentId}/${root.data.id.slice(root.data.parentId.length + 1)}`} replace />
  if (err && !data) return <Failed />
  if (!data || !root.data) return <Loading />
  const kids = root.data.children
  const all = range > 365
  const cur = data.latest
  return (
    <div className={`transition-opacity ${data.id !== (sel ?? id) ? 'opacity-50' : ''}`}>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />一覧へ</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{data.nameJa}</h1>
          <a href={data.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">{data.publicUrl.replace(/^https?:\/\//, '')}<ExternalLink className="size-3" /></a></div>
        {cur && <div className="text-right"><Badge status={cur.status} />{reason(cur.status, data.latest?.code ?? null, cur.ms) && <p className="mt-1 text-xs text-muted">{reason(cur.status, data.latest?.code ?? null, cur.ms)}</p>}</div>}
      </div>
      {kids.length > 0 && <Card className="mb-4 space-y-3 p-4">
        {[['', '', [{ id: '', nameJa: `${root.data.nameJa} 全体` }]], ...CATS.map(([k, l]) => [k, l, kids.filter((c) => (c.category ?? 'page') === k)] as const)].filter(([, , l]) => l.length).map(([k, l, list]) => (
          <div key={k as string}>
            {l && <h2 className="mb-1.5 text-xs font-semibold text-muted">{l as string}</h2>}
            <div className="flex flex-wrap gap-2">{(list as { id: string; nameJa: string }[]).map((c) => { const on = (sel ?? '') === c.id
              return <Link key={c.id} replace to={c.id ? `/s/${id}/${c.id.slice(id!.length + 1)}` : `/s/${id}`} aria-current={on}
                className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-fg bg-fg text-bg' : 'border-line hover:bg-line/40'}`}>{c.nameJa}</Link> })}</div>
          </div>))}
      </Card>}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[['稼働率', pct(data.uptime)], ['応答時間', cur?.ms != null ? `${cur.ms}ms` : '—'], ['最終チェック', cur ? ago(cur.at) : '—']].map(([k, v]) => (
          <Card key={k} className="p-4"><div className="text-xs text-muted">{k}</div><div className="tnum mt-1 text-xl font-semibold">{v}</div></Card>
        ))}
      </div>
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">稼働率の推移<span className="ml-2 text-[11px] font-normal text-muted">日付をクリックで詳細</span></h2>
          <div className="flex gap-1 rounded-lg border border-line p-0.5" role="tablist">
            {RANGES.map((r) => <button key={r.d} type="button" role="tab" aria-selected={range === r.d} onClick={() => setRange(r.d)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs ${range === r.d ? 'bg-fg text-bg' : 'text-muted hover:text-fg'}`}>{r.l}</button>)}
          </div></div>
        {all ? <UptimeMonths days={monthly(data.days)} /> : <UptimeBars days={data.days} count={range} tall serviceId={data.id} />}
      </Card>
      <Card className="mb-4 p-4"><h2 className="mb-3 text-sm font-semibold">応答時間(直近48時間)</h2><Spark points={data.series} from={Date.now() - 48 * 3600_000} to={Date.now()} step={900_000} /></Card>
      {data.affectsJa.length > 0 && <Card className="mb-4 p-4"><h2 className="mb-2 text-sm font-semibold">障害時に影響する範囲</h2><ul className="list-inside list-disc space-y-1 text-sm text-muted">{data.affectsJa.map((a) => <li key={a}>{a}</li>)}</ul></Card>}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">障害履歴</h2><Link to={`/incidents?service=${data.id}`} className="text-xs text-muted hover:text-fg">すべて見る</Link></div>
        {data.incidents.length === 0 ? <p className="py-4 text-center text-sm text-muted">記録されている障害はありません</p> :
          <ul className="divide-y divide-line">{data.incidents.slice(0, 8).map((i) => (
            <li key={i.id}><Link to={`/incidents/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-70">
              <span className="flex items-center gap-2"><Badge status={i.severity} past={!!i.endedAt} /><span className="tnum text-muted">{fmtDt(i.startedAt)}</span></span>
              <span className="tnum text-muted">{i.endedAt ? fmtMin(i.minutes) : '継続中'}</span></Link></li>))}</ul>}
      </Card>
    </div>
  )
}

function UptimeMonths({ days }: { days: Day[] }) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
      {days.map((d) => (
        <div key={d.date} className="rounded-md p-1.5 text-center text-[10px] leading-tight text-white" title={`${d.date} 稼働率 ${pct(d.uptime)}`}
          style={{ background: d.uptime == null ? 'var(--none)' : d.uptime >= 99.5 ? 'var(--ok)' : d.uptime >= 95 ? 'var(--warn)' : 'var(--bad)' }}>
          {d.date.slice(2).replace('-', '/')}<div className="tnum font-semibold">{pct(d.uptime)}</div></div>
      ))}
    </div>
  )
}
