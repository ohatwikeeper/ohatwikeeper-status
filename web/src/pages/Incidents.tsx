import { useEffect } from 'react'
import ServicePicker from '../ServicePicker'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Pagination } from '../arc/pagination'
import { cause, facts, type CheckDetail, reason, fmtDt, fmtDtFull, fmtMin, useApi, type Inc, type St } from '../lib'
import { Badge, Card, Failed, Loading } from '../ui'

interface Svc { id: string; nameJa: string; parentId: string | null; status?: St }

export function IncidentList() {
  const [q, setQ] = useSearchParams()
  const page = Number(q.get('page')) || 1, sid = q.get('service') ?? ''
  const { data, err } = useApi<{ total: number; page: number; per: number; items: Inc[]; ongoing: number }>(`/api/incidents?page=${page}${sid ? `&service=${sid}` : ''}`)
  const { data: st } = useApi<{ services: Svc[] }>('/api/status?days=1')
  useEffect(() => { document.title = '障害履歴 - ステータス - おはツイKeeper' }, [])
  if (err && !data) return <Failed />
  if (!data) return <Loading />
  const name = (id: string) => st?.services.find((s) => s.id === id)?.nameJa ?? id
  const pages = Math.max(1, Math.ceil(data.total / data.per))
  const go = (p: number) => setQ((o) => { const n = new URLSearchParams(o); n.set('page', String(p)); return n })
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">障害履歴</h1><p className="text-sm text-muted">{data.total}件{data.ongoing > 0 && <span className="text-bad">・{data.ongoing}件が継続中</span>}</p></div>
        <ServicePicker items={st?.services ?? []} value={sid} onChange={(v) => setQ(v ? { service: v } : {})} />
      </div>
      <Card className="overflow-hidden">
        {data.items.length === 0 ? <p className="py-16 text-center text-sm text-muted">記録されている障害はありません</p> :
          <ul className="divide-y divide-line">{data.items.map((i) => (
            <li key={i.id}><Link to={`/incidents/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-line/30">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{name(i.serviceId)}</span><span className="tnum text-xs text-muted">{fmtDt(i.startedAt)}</span></span>
              <span className="flex shrink-0 items-center gap-3 text-sm"><span className="tnum text-muted">{i.endedAt ? fmtMin(i.minutes) : '継続中'}</span><Badge status={i.severity} past={!!i.endedAt} /></span></Link></li>))}</ul>}
      </Card>
      {pages > 1 && <div className="mt-4 flex justify-center"><Pagination page={page} pageCount={pages} onPageChange={go} label="ページ送り" /></div>}
    </>
  )
}

interface Detail extends Inc { service: { id: string; nameJa: string }; timeline: { at: string; status: St; ms: number | null; code: number | null; detail: CheckDetail | null }[] }

export function IncidentDetail() {
  const { id } = useParams()
  const { data, err } = useApi<Detail>(`/api/incidents/${id}`)
  useEffect(() => { if (data) document.title = `${data.service.nameJa}の障害 - ステータス - おはツイKeeper` }, [data])
  if (err && !data) return <Failed />
  if (!data) return <Loading />
  return (
    <>
      <Link to="/incidents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />障害履歴へ</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{data.service.nameJa}</h1><p className="tnum text-sm text-muted">{fmtDtFull(data.startedAt)} 〜 {data.endedAt ? fmtDtFull(data.endedAt) : '継続中'}</p></div>
        <div className="text-right"><Badge status={data.severity} past={!!data.endedAt} />{(() => { const bad = [...data.timeline].reverse().find((r) => r.status !== 'operational'); const t = bad && reason(bad.status, bad.code, bad.ms); return t ? <p className="mt-1 text-xs text-muted">{t}</p> : null })()}</div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="text-xs text-muted">継続時間</div><div className="tnum mt-1 text-xl font-semibold">{data.endedAt ? fmtMin(data.minutes) : `${fmtMin(data.minutes)}〜`}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">異常を検知した回数</div><div className="tnum mt-1 text-xl font-semibold">{data.checks}回</div></Card>
      </div>
      {(() => { const bad = [...data.timeline].reverse().find((r) => r.status !== 'operational'); if (!bad) return null
        const c = cause(bad.detail ?? (bad.code ? { kind: 'http', target: '' } : null), bad.code); const f = facts(bad.detail)
        if (!c && !f.length) return null
        return <Card className="mb-4 p-4"><h2 className="mb-2 text-sm font-semibold">原因の詳細<span className="ml-2 text-[11px] font-normal text-muted">最後に異常を検知したチェック</span></h2>
          {c && <p className="text-sm"><span className="font-semibold">{c.title}{bad.code ? `(HTTP ${bad.code})` : ''}</span>{c.hint && <span className="text-muted"> — {c.hint}</span>}</p>}
          {f.length > 0 && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">{f.map(([k, v]) => <><dt key={k} className="text-muted">{k}</dt><dd key={k + v} className="tnum break-all">{v}</dd></>)}</dl>}
          {!bad.detail && <p className="mt-2 text-[11px] text-muted">この障害は詳細記録の開始前のため、HTTPステータスから推定した内容です。</p>}
        </Card> })()}
      <Card className="overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2 font-medium">時刻</th><th className="px-2 py-2 font-medium">状態</th><th className="px-2 py-2 text-right font-medium">応答</th><th className="px-4 py-2 text-right font-medium">HTTP</th></tr></thead>
          <tbody className="divide-y divide-line">{data.timeline.map((r) => (
            <tr key={r.at}><td className="tnum px-4 py-2">{fmtDtFull(r.at)}</td><td className="px-2 py-2"><Badge status={r.status} past />{reason(r.status, r.code, r.ms) && <span className="ml-2 text-xs text-muted">{reason(r.status, r.code, r.ms)}</span>}{r.detail && <span className="ml-2 text-xs text-muted">· {cause(r.detail, r.code)?.title}</span>}</td>
              <td className="tnum px-2 py-2 text-right text-muted">{r.ms != null ? `${r.ms}ms` : '—'}</td><td className="tnum px-4 py-2 text-right text-muted">{r.code ?? 'タイムアウト'}</td></tr>))}</tbody></table>
      </Card>
    </>
  )
}
