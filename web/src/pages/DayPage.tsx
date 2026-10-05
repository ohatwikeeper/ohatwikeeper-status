import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Pagination } from '../arc/pagination'
import { cause, type CheckDetail, reason, fmtDt, fmtMin, pct, uptimeColor, useApi, type Inc, type St } from '../lib'
import { Badge, Card, Failed, Loading, Reveal, Spark } from '../ui'

interface Chk { at: string; status: St; ms: number | null; code: number | null; detail: CheckDetail | null }
interface DayData { id: string; nameJa: string; date: string; checks: Chk[]; incidents: Inc[] }

const shift = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hm = (s: string) => new Date(s).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const WEEK = ['日', '月', '火', '水', '木', '金', '土']

/** /s/:id/d/:date その日のチェック結果・時間別稼働率・応答時間・障害 */
export default function DayPage() {
  const { id = '', date = '' } = useParams()
  const { data, err } = useApi<DayData>(`/api/services/${id}/day?date=${date}`)
  const [pg, setPg] = useState(1)
  useEffect(() => { document.title = `${date} ${data?.nameJa ?? ''} - ステータス` }, [date, data?.nameJa])
  useEffect(() => setPg(1), [date])
  if (err && !data) return <Failed />
  if (!data) return <Loading />

  const ck = data.checks, ok = ck.filter((c) => c.status === 'operational').length
  const ms = ck.map((c) => c.ms).filter((v): v is number => v != null)
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null
  const hours = Array.from({ length: 24 }, (_, h) => {
    const g = ck.filter((c) => new Date(c.at).getHours() === h)
    return { h, total: g.length, uptime: g.length ? (g.filter((c) => c.status === 'operational').length / g.length) * 100 : null }
  })
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const points = ck.map((c) => ({ t: Date.parse(c.at), ms: c.ms, bad: c.status === 'operational' ? 0 : 1 }))
  const today = shift(date, 0) >= shift(new Date().toISOString().slice(0, 10), 0)
  const wd = WEEK[new Date(`${date}T00:00:00`).getDay()]
  const rows = [...ck].reverse(), PER = 50, pages = Math.max(1, Math.ceil(rows.length / PER)), shown = rows.slice((pg - 1) * PER, pg * PER)

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to={`/s/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />{data.nameJa}</Link>
        <div className="flex items-center gap-1">
          <Link to={`/s/${id}/d/${shift(date, -1)}`} aria-label="前日" className="rounded-md border border-line p-1.5 hover:bg-fg/5"><ChevronLeft className="size-4" /></Link>
          {!today && <Link to={`/s/${id}/d/${shift(date, 1)}`} aria-label="翌日" className="rounded-md border border-line p-1.5 hover:bg-fg/5"><ChevronRight className="size-4" /></Link>}
        </div>
      </div>
      <Reveal>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">{date.replaceAll('-', '/')} <span className="text-base font-normal text-muted">({wd})</span></h1>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['稼働率', ck.length ? pct((ok / ck.length) * 100) : '—'], ['チェック回数', `${ck.length}回`], ['平均応答', avg != null ? `${avg}ms` : '—'], ['最大応答', ms.length ? `${Math.max(...ms)}ms` : '—']].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs text-muted">{k}</div><div className="tnum mt-1 text-xl font-semibold">{v}</div></Card>))}
        </div>
      </Reveal>
      {ck.length === 0 ? <Card className="p-10 text-center text-sm text-muted">この日の記録はありません</Card> : (
        <>
          <Card className="mb-4 p-4">
            <h2 className="mb-3 text-sm font-semibold">時間別の稼働率</h2>
            <div className="flex h-9 gap-px">{hours.map((x) => (
              <span key={x.h} className="bar flex-1 rounded-[3px]" style={{ animationDelay: `${x.h * 15}ms`, background: uptimeColor(x.uptime) }} title={`${x.h}時台  ${x.total ? `${pct(x.uptime)}(${x.total}回)` : 'データなし'}`} />))}</div>
            <div className="mt-1 flex justify-between text-[11px] text-muted"><span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>24時</span></div>
          </Card>
          <Card className="mb-4 p-4"><h2 className="mb-3 text-sm font-semibold">応答時間</h2><Spark points={points} from={dayStart} to={dayStart + 86_400_000} step={180_000} /></Card>
          {data.incidents.length > 0 && (
            <Card className="mb-4 p-4"><h2 className="mb-2 text-sm font-semibold">この日の障害</h2>
              <ul className="divide-y divide-line">{data.incidents.map((i) => (
                <li key={i.id}><Link to={`/incidents/${i.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-70">
                  <span className="flex items-center gap-2"><Badge status={i.severity} past={!!i.endedAt} /><span className="tnum text-muted">{fmtDt(i.startedAt)}</span></span>
                  <span className="tnum text-muted">{i.endedAt ? fmtMin(i.minutes) : '継続中'}</span></Link></li>))}</ul></Card>)}
          <Card className="overflow-hidden">
            <h2 className="p-4 pb-2 text-sm font-semibold">チェック履歴(新しい順)</h2>
            <table className="w-full text-sm"><tbody className="divide-y divide-line">{shown.map((c) => (
              <tr key={c.at}><td className="tnum px-4 py-2 text-muted">{hm(c.at)}</td><td className="py-2"><Badge status={c.status} past />{reason(c.status, c.code, c.ms) && <span className="ml-2 text-xs text-muted">{reason(c.status, c.code, c.ms)}</span>}{c.detail && <span className="ml-2 text-xs text-muted">· {cause(c.detail, c.code)?.title}</span>}</td>
                <td className="tnum py-2 text-right text-muted">{c.code ?? '—'}</td><td className="tnum px-4 py-2 text-right text-muted">{c.ms != null ? `${c.ms}ms` : '—'}</td></tr>))}</tbody></table>
            {pages > 1 && <div className="flex justify-center border-t border-line p-3"><Pagination page={pg} pageCount={pages} onPageChange={setPg} label="ページ送り" /></div>}
          </Card>
        </>
      )}
    </>
  )
}
