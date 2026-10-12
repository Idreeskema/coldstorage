import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, UserPlus } from 'lucide-react'
import { useDerived, useStore } from '../../core/store'
import type { NewGrower } from '../../core/store'
import { num } from '../../core/format'
import { inr } from '../../core/format'
import {
  Avatar, Button, Card, Chips, EmptyState, Field, Input, Modal, PageHeader, SearchInput, StatusPill, TableWrap, toast,
} from '../../ui'
import './growers.css'

type Filter = 'all' | 'active' | 'pending' | 'storage' | 'due' | 'completed'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'pending', label: 'Pending' },
  { id: 'storage', label: 'Storage Active' }, { id: 'due', label: 'Payment Due' }, { id: 'completed', label: 'Completed' },
]
const PAGE = 15

const EMPTY: Record<string, string> = { name: '', fatherName: '', phone: '', village: '', district: '', orchard: '', expectedStorage: '' }

export default function GrowersPage() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const registerGrower = useStore((s) => s.registerGrower)
  const approveGrower = useStore((s) => s.approveGrower)

  const filter = (FILTERS.some((f) => f.id === sp.get('filter')) ? sp.get('filter') : 'all') as Filter
  const q = sp.get('q') ?? ''
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v && v !== 'all') n.set(k, v); else n.delete(k)
    setSp(n, { replace: true })
    setPage(0)
  }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return growers
      .map((g) => ({ g, s: d.growerStats.get(g.id)! }))
      .filter(({ g, s }) => {
        if (t && !(g.name.toLowerCase().includes(t) || g.phone.replace(/\s/g, '').includes(t.replace(/\s/g, '')) || g.code.toLowerCase().includes(t) || g.village.toLowerCase().includes(t))) return false
        switch (filter) {
          case 'active': return g.status === 'ACTIVE'
          case 'pending': return g.status === 'PENDING'
          case 'storage': return s.stored > 0
          case 'due': return s.due > 1
          case 'completed': return s.lots > 0 && s.stored === 0
          default: return true
        }
      })
      .sort((a, b) => a.g.name.localeCompare(b.g.name))
  }, [growers, d, q, filter])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE)

  const submit = () => {
    const g: NewGrower = {
      name: form.name, fatherName: form.fatherName || undefined, phone: form.phone, village: form.village,
      district: form.district || 'Not specified', orchard: form.orchard || undefined,
      expectedStorage: form.expectedStorage ? Number(form.expectedStorage) : undefined,
    }
    if (!g.village.trim()) return setErr('Village is required')
    const res = registerGrower(g, 'ACTIVE')
    if (!res.ok) return setErr(res.error ?? 'Could not add grower')
    toast(`${g.name} added`)
    setOpen(false); setForm(EMPTY); setErr('')
    nav(`/admin/growers/${res.id}`)
  }
  const f = (k: string) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <div className="page">
      <PageHeader
        title="Growers"
        sub={`${num(growers.length)} registered · ${d.store.pendingGrowers} awaiting approval`}
        actions={<Button variant="primary" icon={<UserPlus />} onClick={() => { setErr(''); setOpen(true) }}>Add grower</Button>}
      />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search name, mobile, ID, village" width={300} />
          <Chips options={FILTERS} value={filter} onChange={(v) => setParam('filter', v)} />
        </div>
        {slice.length === 0 ? (
          <EmptyState title="No growers match" text="Try a different search or filter." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Grower ID</th><th>Name</th><th>Mobile</th><th>Village</th>
                <th className="r">Allocated</th><th className="r">Issued</th><th className="r">Received</th>
                <th className="r">Current storage</th><th className="r">Outstanding</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {slice.map(({ g, s }) => (
                <tr key={g.id} className="click" onClick={() => nav(`/admin/growers/${g.id}`)}>
                  <td className="mono">{g.code}</td>
                  <td><div className="gr-name"><Avatar name={g.name} /><b>{g.name}</b></div></td>
                  <td className="num">{g.phone}</td>
                  <td>{g.village}</td>
                  <td className="r num">{num(s.allocated)}</td>
                  <td className="r num">{num(s.issued)}</td>
                  <td className="r num">{num(s.received)}</td>
                  <td className="r num strong">{num(s.stored)}</td>
                  <td className="r num" style={{ color: s.due > 1 ? 'var(--red)' : s.due < -1 ? 'var(--primary)' : undefined }}>{s.due < -1 ? `Advance ${inr(-s.due)}` : inr(Math.max(0, s.due))}</td>
                  <td><StatusPill status={g.status} /></td>
                  <td className="r" onClick={(e) => e.stopPropagation()}>
                    {g.status === 'PENDING' ? (
                      <Button size="sm" variant="primary" icon={<Check />} onClick={() => { approveGrower(g.id); toast(`${g.name} approved`) }}>Approve</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => nav(`/admin/growers/${g.id}`)}>View</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div className="pager">
          <span>{rows.length === 0 ? '0 growers' : `${cur * PAGE + 1}–${Math.min(rows.length, cur * PAGE + PAGE)} of ${num(rows.length)}`}</span>
          <div className="row">
            <Button size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
            <span>Page {cur + 1} / {pages}</span>
            <Button size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add grower"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={submit}>Add grower</Button></>}>
        <div className="form-grid">
          <Field label="Full name"><Input {...f('name')} /></Field>
          <Field label="Father's name"><Input {...f('fatherName')} /></Field>
          <Field label="Mobile number"><Input inputMode="tel" placeholder="98xxxxxxxx" {...f('phone')} /></Field>
          <Field label="Village"><Input {...f('village')} /></Field>
          <Field label="District"><Input {...f('district')} /></Field>
          <Field label="Orchard name"><Input {...f('orchard')} /></Field>
          <Field label="Expected storage (boxes)"><Input type="number" min={0} {...f('expectedStorage')} /></Field>
          {err && <div className="full"><div className="err" style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div></div>}
        </div>
      </Modal>
    </div>
  )
}
