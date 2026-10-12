// Formatting + date helpers
import type { RateType } from './types'

export const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN')

export const num = (n: number) => Math.round(n).toLocaleString('en-IN')

export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`

const pad = (n: number) => String(n).padStart(2, '0')

export const isoDay = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => isoDay(new Date())

const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (iso: string, n: number) => {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

export const addMonths = (iso: string, n: number) => {
  const d = parse(iso)
  d.setMonth(d.getMonth() + n)
  return isoDay(d)
}

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((parse(toIso).getTime() - parse(fromIso).getTime()) / 86400000)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 05 Oct 2026 */
export const fmtDate = (iso?: string) => {
  if (!iso) return '—'
  const d = parse(iso)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** 05 Oct */
export const fmtDateShort = (iso?: string) => {
  if (!iso) return '—'
  const d = parse(iso)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`
}

export const monthLabel = (iso: string) => MONTHS[parse(iso).getMonth()]

/** 14:05 from an ISO timestamp */
export const fmtTime = (ts: string) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const relativeDay = (ts: string) => {
  const diff = daysBetween(ts.slice(0, 10), today())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return fmtDateShort(ts)
}

export const nowIso = () => new Date().toISOString()

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const rateLabel = (type: RateType, rate: number) =>
  type === 'PER_CRATE'
    ? `₹${rate} / crate`
    : `₹${rate} / box / ${type === 'PER_DAY' ? 'day' : type === 'PER_MONTH' ? 'month' : 'season'}`
