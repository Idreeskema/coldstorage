// Shared UI kit. Import everything from '@/ui' style paths: `import { Button, Card, ... } from '../../ui'`
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Inbox, Printer, Share2, Download, X, XCircle, Search } from 'lucide-react'
import './ui.css'

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'secondary', size = 'md', block, icon, className = '', children, ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn ${variant} ${size === 'md' ? '' : size} ${block ? 'block' : ''} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/* ---------- Status pills (maps domain statuses to a tone) ---------- */
type Tone = 'green' | 'dark' | 'amber' | 'red' | 'blue' | 'grey'
const TONES: Record<string, Tone> = {
  ACTIVE: 'green', PAID: 'green', IN_STORAGE: 'green', COMPLETED: 'dark', 'IN STORAGE': 'green', APPROVED: 'green',
  FULLY_ALLOCATED: 'green', 'APPLES RECEIVED': 'green', SUCCESS: 'green',
  PENDING: 'amber', PARTIAL: 'amber', PARTIALLY_ALLOCATED: 'amber', DUE: 'red', READY: 'blue', PARTIALLY_ISSUED: 'amber',
  'PARTIALLY ISSUED': 'amber', 'NOT ISSUED': 'grey', 'FULLY ISSUED': 'blue', WARNING: 'amber',
  REJECTED: 'red', CRITICAL: 'red', INACTIVE: 'grey', DISPATCHED: 'blue', INFO: 'blue',
}
const LABELS: Record<string, string> = {
  IN_STORAGE: 'In Storage', PARTIAL: 'Partially Dispatched', READY: 'Ready for Dispatch', COMPLETED: 'Completed',
  PARTIALLY_ALLOCATED: 'Partially Allocated', FULLY_ALLOCATED: 'Fully Allocated',
}
export function StatusPill({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  const key = status.toUpperCase()
  const t = tone ?? TONES[key] ?? 'grey'
  const text = label ?? LABELS[key] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
  return <span className={`pill ${t === 'grey' ? '' : t}`}>{text}</span>
}

/* ---------- Card ---------- */
export function Card({ title, sub, action, children, pad = true, className = '' }: {
  title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean; className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  )
}

/* ---------- Page header ---------- */
export function PageHeader({ title, sub, actions, crumbs }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]
}) {
  return (
    <div className="page-header">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>{i > 0 && ' / '}{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  )
}

/* ---------- KPI (clickable when `to` or `onClick` given) ---------- */
export function Kpi({ label, value, unit, foot, icon, to, onClick, tone, progress }: {
  label: string; value: ReactNode; unit?: string; foot?: ReactNode; icon?: ReactNode
  to?: string; onClick?: () => void; tone?: 'warn' | 'bad'; progress?: number
}) {
  const inner = (
    <>
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
      {progress !== undefined && <div style={{ marginTop: 10 }}><Progress value={progress} /></div>}
      {foot && <div className="kpi-foot">{foot}</div>}
    </>
  )
  const cls = `card kpi ${tone ?? ''}`
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

/* ---------- Progress ---------- */
export function Progress({ value, tone }: { value: number; tone?: 'warn' | 'bad' }) {
  const v = Math.max(0, Math.min(100, value))
  const t = tone ?? (v >= 90 ? 'bad' : v >= 75 ? 'warn' : undefined)
  return <div className={`progress ${t ?? ''}`}><span style={{ width: `${v}%` }} /></div>
}

/* ---------- Segmented capacity bar ---------- */
export interface Segment { label: string; value: number; color: string; onClick?: () => void }
export function SegBar({ segments, total }: { segments: Segment[]; total: number }) {
  return (
    <>
      <div className="segbar">
        {segments.filter((s) => s.value > 0).map((s) => {
          const style = { flex: `${s.value} 1 0`, background: s.color }
          const label = `${((s.value / total) * 100).toFixed(0)}%`
          return s.onClick
            ? <button key={s.label} style={style} onClick={s.onClick} title={`${s.label}: ${s.value.toLocaleString('en-IN')}`}>{label}</button>
            : <div key={s.label} style={style}>{label}</div>
        })}
      </div>
      <div className="seg-legend">
        {segments.map((s) => (
          <span key={s.label}><i style={{ background: s.color }} />{s.label} · <b className="num" style={{ color: 'var(--text)' }}>{s.value.toLocaleString('en-IN')}</b></span>
        ))}
      </div>
    </>
  )
}

/* ---------- Table shell ---------- */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap"><table className="tbl">{children}</table></div>
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, error, children, full }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`input ${p.className ?? ''}`} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`select ${p.className ?? ''}`} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`textarea ${p.className ?? ''}`} />
export function SearchInput({ value, onChange, placeholder = 'Search…', width = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <div className="input-icon" style={{ width, maxWidth: '100%' }}>
      <Search />
      <input className="input sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/* ---------- Alert ---------- */
export function Alert({ kind = 'info', children }: { kind?: 'error' | 'warning' | 'info' | 'success' | 'critical'; children: ReactNode }) {
  const Icon = kind === 'error' || kind === 'critical' ? XCircle : kind === 'warning' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info
  return <div className={`alert ${kind}`}><Icon />{<div>{children}</div>}</div>
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} className={`tab ${t.id === value ? 'on' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  )
}

/* ---------- Filter chips ---------- */
export function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => <button key={o.id} className={`chip ${o.id === value ? 'on' : ''}`} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Empty state ---------- */
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

/* ---------- Loading skeleton ---------- */
export const Skeleton = ({ h = 16, w = '100%' }: { h?: number; w?: number | string }) => <div className="skeleton" style={{ height: h, width: w }} />

/* ---------- Toasts ---------- */
type ToastMsg = { id: number; text: string; kind: 'ok' | 'error' }
let toastId = 0
const listeners = new Set<(t: ToastMsg) => void>()
export const toast = (text: string, kind: 'ok' | 'error' = 'ok') => listeners.forEach((l) => l({ id: ++toastId, text, kind }))
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => {
    const l = (t: ToastMsg) => {
      setItems((x) => [...x, t])
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3800)
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return (
    <div className="toast-wrap" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          {t.kind === 'error' ? <XCircle /> : <CheckCircle2 />}{t.text}
        </div>
      ))}
    </div>
  )
}

/* ---------- Timeline ---------- */
export interface TimelineItem { id: string; time?: string; title: ReactNode; desc?: ReactNode; tone?: 'success' | 'info' | 'warning'; onClick?: () => void }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="timeline">
      {items.map((i) => (
        <div key={i.id} className={`tl-item ${i.onClick ? 'click' : ''}`} onClick={i.onClick}>
          <div className={`tl-dot ${i.tone === 'warning' ? 'warning' : i.tone === 'info' ? 'info' : ''}`} />
          {i.time && <div className="tl-time">{i.time}</div>}
          <div className="grow">
            <div className="tl-title">{i.title}</div>
            {i.desc && <div className="tl-desc">{i.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Fake QR (visual placeholder derived from the code) ---------- */
export function QrCode({ value, size = 84 }: { value: string; size?: number }) {
  const N = 21
  let seed = 0
  for (const c of value) seed = (seed * 31 + c.charCodeAt(0)) >>> 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const finder = (x: number, y: number) =>
    [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)
  const cells: ReactNode[] = []
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let on = rnd() > 0.52
      if (finder(x, y)) {
        const fx = x < 7 ? x : x - (N - 7), fy = y < 7 ? y : y - (N - 7)
        on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
      }
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  return <svg className="qr" style={{ width: size, height: size }} viewBox={`0 0 ${N} ${N}`} fill="#1c2b22" aria-label={`QR ${value}`}>{cells}</svg>
}

/* ---------- Printable document preview (receipts, gate pass, ledger…) ---------- */
export interface DocSpec {
  title: string // e.g. "Box Issue Receipt"
  code: string // BOX-ISSUE-2026-00123
  date: string
  rows: [string, ReactNode][]
  footer?: string
}
export function DocPreview({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: DocSpec | null }) {
  if (!doc) return null
  return (
    <Modal open={open} onClose={onClose} title="Document preview" wide
      footer={<>
        <Button icon={<Share2 />} onClick={() => toast('Share link copied (mock)')}>Share</Button>
        <Button icon={<Download />} onClick={() => toast('PDF download is a placeholder in this POC')}>PDF</Button>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>Print</Button>
      </>}>
      <div className="doc">
        <div className="doc-head">
          <div>
            <h2>Kashmir Fresh CA Storage</h2>
            <div className="muted">{doc.title}</div>
          </div>
          <div className="right">
            <div className="mono">{doc.code}</div>
            <div className="muted">{doc.date}</div>
          </div>
        </div>
        <div className="row spread" style={{ alignItems: 'flex-start', gap: 20 }}>
          <table><tbody>{doc.rows.map(([k, v], i) => <tr key={i}><td className="muted" style={{ fontWeight: 400, textAlign: 'left' }}>{k}</td><td>{v}</td></tr>)}</tbody></table>
          <QrCode value={doc.code} />
        </div>
        <div className="doc-foot"><span>{doc.footer ?? 'Computer generated document — no signature required'}</span><span>Authorised signatory</span></div>
      </div>
    </Modal>
  )
}

/* ---------- helpers ---------- */
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
export const Avatar = ({ name, lg }: { name: string; lg?: boolean }) => <div className={`avatar ${lg ? 'lg' : ''}`}>{initials(name)}</div>
