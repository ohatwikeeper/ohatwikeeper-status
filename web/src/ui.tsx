import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { META, fmtDtFull, pct, uptimeColor, type Day, type St } from './lib'

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`glass rounded-2xl border border-line ${className}`}>{children}</div>
)

export function Dot({ status, live }: { status: St; live?: boolean }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${live && status === 'operational' ? 'pulse' : ''}`} style={{ background: META[status].color, color: META[status].color }} />
}

/** past=過去の障害表示(「発生中」ではなく「障害」と表示する) */
export function Badge({ status, past }: { status: St; past?: boolean }) {
  const label = past && status === 'outage' ? '障害' : META[status].label
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-medium"><Dot status={status} />{label}</span>
}

/** 日別稼働率バー。ホバーで日付と稼働率を表示。欠けている日は灰色 */
export function UptimeBars({ days, count, tall, serviceId }: { days: Day[]; count: number; tall?: boolean; serviceId?: string }) {
  const map = new Map(days.map((d) => [d.date, d]))
  const cells = Array.from({ length: count }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (count - 1 - i))
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    return { key, d: map.get(key) }
  })
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const nav = useNavigate()
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 幅から1本ずつの幅を小数のまま計算して描く(CSS flex だと端数の丸めで太さがばらつくため)
  const H = tall ? 36 : 28, GAP = count > 120 ? 1 : 2, cw = W ? Math.max(1, (W - GAP * (count - 1)) / count) : 0
  return (
    <div ref={ref} className="w-full" role="img" aria-label="日別の稼働率">
      <svg key={count} width={W} height={H} className="block overflow-visible">
        {cw > 0 && cells.map(({ key, d }, i) => {
          const title = `${key}  ${d ? `稼働率 ${pct(d.uptime)}(${d.ok}/${d.total}回)` : 'データなし'}`
          const rect = <rect className="bar" x={i * (cw + GAP)} width={cw} height={H} rx={Math.min(3, cw / 2)} fill={uptimeColor(d?.uptime ?? null)} style={{ animationDelay: `${Math.round(i * Math.min(8, 400 / count))}ms` }}><title>{title}</title></rect>
          return serviceId && d
            ? <a key={key} href={`/s/${serviceId}/d/${key}`} onClick={(e) => { e.preventDefault(); nav(`/s/${serviceId}/d/${key}`) }} className="cursor-pointer hover:opacity-75" aria-label={title}>{rect}</a>
            : <g key={key}>{rect}</g>
        })}
      </svg>
    </div>
  )
}

/** 応答時間のSVG折れ線。障害のあった区間は赤で塗る */
export function Spark({ points, from, to, step }: { points: { t: number; ms: number | null; bad: number }[]; from: number; to: number; step: number }) {
  const W = 640, H = 120, P = 6
  const v = points.filter((p) => p.ms != null)
  if (!v.length) return <div className="grid h-[120px] place-items-center text-sm text-muted">データがまだありません</div>
  const max = Math.ceil(Math.max(...v.map((p) => p.ms!), 200) / 100) * 100
  const x = (t: number) => P + ((t - from) / (to - from)) * (W - P * 2), y = (ms: number) => H - P - (ms / max) * (H - P * 2)
  const bw = Math.max(2, (step / (to - from)) * (W - P * 2))
  // 記録のない区間(step の2倍超)は線をつながず途切れさせる
  const segs: typeof v[] = []
  v.forEach((p, i) => { if (i && p.t - v[i - 1].t <= step * 2) segs[segs.length - 1].push(p); else segs.push([p]) })
  const d = (g: typeof v) => g.length === 1 ? `M${x(g[0].t) - bw / 2},${y(g[0].ms!)}L${x(g[0].t) + bw / 2},${y(g[0].ms!)}` : g.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.ms!).toFixed(1)}`).join('')
  const tf = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const hm = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
  const span = to - from, fmt = span > 36 * 3600_000 ? tf : hm
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[120px] w-full" preserveAspectRatio="none" role="img" aria-label="応答時間の推移">
          {[0.5, 1].map((r) => <line key={r} x1={0} x2={W} y1={y(max * r)} y2={y(max * r)} stroke="var(--border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          {points.filter((p) => p.bad).map((p) => <rect key={p.t} x={x(p.t) - bw / 2} y={0} width={bw} height={H} fill="var(--bad)" opacity=".22" />)}
          {segs.map((g, i) => g.length > 1 && <path key={`a${i}`} d={`${d(g)}L${x(g[g.length - 1].t)},${H - P}L${x(g[0].t)},${H - P}Z`} fill="var(--ok)" opacity=".10" />)}
          {segs.map((g, i) => <path key={i} d={d(g)} fill="none" stroke="var(--ok)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
        </svg>
        <span className="tnum pointer-events-none absolute left-1 top-0 text-[10px] text-muted">{max}ms</span>
        <span className="tnum pointer-events-none absolute bottom-0 left-1 text-[10px] text-muted">0</span>
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-muted"><span>{fmt.format(from)}</span><span>{fmt.format(from + span / 2)}</span><span>{fmt.format(to)}</span></div>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between border-b border-line/60 bg-bg/60 px-4 py-4 backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">おはツイKeeper <span className="font-normal text-muted">ステータス</span></Link>
        <nav className="flex gap-4 text-sm text-muted"><Link className="hover:text-fg" to="/incidents">障害履歴</Link><a className="hover:text-fg" href="https://ohatwikeeper.com">サイトへ</a></nav>
      </header>
      {children}
      <footer className="mt-12 text-center text-xs text-muted">3分ごとに自動チェック・履歴はすべて保存されています</footer>
    </div>
  )
}

export const Loading = () => <div className="py-24 text-center text-sm text-muted">読み込み中…</div>
export const Failed = () => <div className="py-24 text-center text-sm text-bad">データを取得できませんでした。しばらくしてからお試しください。</div>

/** Arc UI 風: 文字を1字ずつ blur から現す */
export function BlurText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {[...text].map((c, i) => (
        <motion.span key={i} aria-hidden initial={{ opacity: 0, filter: 'blur(8px)', y: 6 }} animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.45 }} className="inline-block whitespace-pre">{c}</motion.span>
      ))}
    </span>
  )
}

/** 数値を 0 からカウントアップ表示 */
export function CountUp({ to, digits = 2, suffix = '' }: { to: number; digits?: number; suffix?: string }) {
  const v = useMotionValue(0)
  const text = useTransform(v, (n) => n.toFixed(digits) + suffix)
  useEffect(() => { const a = animate(v, to, { duration: 1.2, ease: 'easeOut' }); return () => a.stop() }, [to, v])
  return <motion.span className="tnum">{text}</motion.span>
}

/** 子要素を順番にふわっと表示 */
export const Reveal = ({ children, i = 0 }: { children: ReactNode; i?: number }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.4, ease: 'easeOut' }}>{children}</motion.div>
)
