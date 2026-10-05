import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { META, type St } from './lib'

export interface PickItem { id: string; nameJa: string; parentId: string | null; status?: St }

/** サービス絞り込み用のコンボボックス(検索+親子グルーピング+キーボード操作) */
export default function ServicePicker({ items, value, onChange }: { items: PickItem[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // 親→子の順に並べ、検索語があれば子の名前/親の名前で絞る
  const rows = useMemo(() => {
    const parents = items.filter((s) => !s.parentId)
    const out: (PickItem & { depth: number })[] = []
    const k = kw.trim().toLowerCase()
    for (const p of parents) {
      const kids = items.filter((c) => c.parentId === p.id)
      const hit = (s: PickItem) => !k || s.nameJa.toLowerCase().includes(k)
      const ks = kids.filter((c) => hit(c) || hit(p))
      if (hit(p) || ks.length) { out.push({ ...p, depth: 0 }); ks.forEach((c) => out.push({ ...c, depth: 1 })) }
    }
    return [{ id: '', nameJa: 'すべてのサービス', parentId: null, depth: 0 }, ...out].filter((r) => r.id || !k)
  }, [items, kw])
  const cur = items.find((s) => s.id === value)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down); return () => document.removeEventListener('mousedown', down)
  }, [open])
  useEffect(() => { setHi(Math.max(0, rows.findIndex((r) => r.id === value))) }, [open, kw]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi])

  const pick = (id: string) => { onChange(id); setOpen(false); setKw('') }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(rows.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[hi]) pick(rows[hi].id) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={box} className="relative" onKeyDown={key}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="glass flex min-w-[200px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-fg/5">
        <span className="truncate">{cur?.nameJa ?? 'すべてのサービス'}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
            className="absolute right-0 z-30 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-line bg-card/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search className="size-4 text-muted" />
              <input autoFocus value={kw} onChange={(e) => setKw(e.target.value)} placeholder="サービスを検索" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
            </div>
            <div ref={list} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
              {rows.length === 0 || (rows.length === 1 && kw) ? <p className="py-6 text-center text-xs text-muted">該当するサービスがありません</p> :
                rows.map((r, i) => (
                  <button key={r.id || 'all'} type="button" role="option" aria-selected={r.id === value} data-i={i} onClick={() => pick(r.id)} onMouseEnter={() => setHi(i)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm ${hi === i ? 'bg-fg/10' : ''} ${r.depth ? 'pl-7 text-[13px]' : 'pl-2 font-medium'}`}>
                    {r.id && r.status && <span className="size-1.5 shrink-0 rounded-full" style={{ background: META[r.status].color }} />}
                    <span className="min-w-0 flex-1 truncate">{r.nameJa}</span>
                    {r.id === value && <Check className="size-4 shrink-0 text-muted" />}
                  </button>))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
