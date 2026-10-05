import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Apple, Briefcase, Sprout, Users } from 'lucide-react'
import { useStore } from '../../core/store'
import type { Role } from '../../core/types'
import { Button, Field, Input, Select, toast } from '../../ui'
import './auth.css'

const MOCK_OTP = '123456'
const digits = (s: string) => s.replace(/\D/g, '')

export default function LoginPage() {
  const nav = useNavigate()
  const session = useStore((s) => s.session)
  const growers = useStore((s) => s.growers)
  const login = useStore((s) => s.login)
  const resetDemo = useStore((s) => s.resetDemo)

  const [role, setRole] = useState<Role>('MANAGER')
  const [mode, setMode] = useState<'pick' | 'otp'>('pick')
  const [growerId, setGrowerId] = useState('')
  const [mobile, setMobile] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  if (session) return <Navigate to={session.role === 'GROWER' ? '/app' : '/admin'} replace />

  const enter = (r: Role, gid?: string) => {
    login(r, gid)
    nav(r === 'GROWER' ? '/app' : '/admin', { replace: true })
  }

  const submit = () => {
    setError('')
    if (role !== 'GROWER') return enter(role)
    if (mode === 'pick') {
      if (!growerId) return setError('Select a grower to continue')
      return enter('GROWER', growerId)
    }
    if (!otpSent) {
      if (digits(mobile).length < 10) return setError('Enter a valid 10-digit mobile number')
      setOtpSent(true)
      return
    }
    if (otp !== MOCK_OTP) return setError('Incorrect OTP. Use 123456 for this demo.')
    const g = growers.find((x) => digits(x.phone).slice(-10) === digits(mobile).slice(-10))
    if (!g) return setError('No grower found with this mobile number. Register a new account instead.')
    enter('GROWER', g.id)
  }

  const roles: { id: Role; label: string; icon: typeof Briefcase }[] = [
    { id: 'MANAGER', label: 'Store Manager', icon: Briefcase },
    { id: 'STAFF', label: 'Store Staff', icon: Users },
    { id: 'GROWER', label: 'Grower', icon: Sprout },
  ]

  return (
    <div className="auth-shell">
      <div className="auth-col">
        <div className="auth-brand">
          <div className="auth-mark"><Apple /></div>
          <h1>Kashmir Fresh CA Storage</h1>
          <p>Sign in to manage your cold store</p>
        </div>

        <div className="auth-roles" role="radiogroup" aria-label="Sign in as">
          {roles.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={role === r.id}
              className={`auth-role ${role === r.id ? 'on' : ''}`}
              onClick={() => { setRole(r.id); setError('') }}>
              <r.icon />{r.label}
            </button>
          ))}
        </div>

        <div className="auth-card">
          {role !== 'GROWER' ? (
            <div className="muted" style={{ fontSize: 13.5 }}>
              {role === 'MANAGER'
                ? 'Full access: approvals, allocation, rates, reports and payments.'
                : 'Counter access: issue boxes, receive apples, dispatch and record payments.'}
              {' '}Demo sign-in, no password needed.
            </div>
          ) : (
            <>
              <div className="auth-sub-tabs">
                <button type="button" className={mode === 'pick' ? 'on' : ''} onClick={() => { setMode('pick'); setError('') }}>Pick a grower</button>
                <button type="button" className={mode === 'otp' ? 'on' : ''} onClick={() => { setMode('otp'); setError('') }}>Mobile + OTP</button>
              </div>
              {mode === 'pick' ? (
                <Field label="Grower" hint="Seeded demo growers">
                  <Select value={growerId} onChange={(e) => setGrowerId(e.target.value)}>
                    <option value="">Select grower…</option>
                    {growers.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.village}{g.status === 'PENDING' ? ' (pending)' : ''}</option>)}
                  </Select>
                </Field>
              ) : (
                <>
                  <Field label="Mobile number">
                    <Input inputMode="tel" placeholder="+91 98765 43210" value={mobile} disabled={otpSent}
                      onChange={(e) => setMobile(e.target.value)} />
                  </Field>
                  {otpSent && (
                    <Field label="One-time password" hint="Demo OTP sent: 123456">
                      <Input className="auth-otp" inputMode="numeric" maxLength={6} value={otp} autoFocus
                        onChange={(e) => setOtp(digits(e.target.value))} placeholder="••••••" />
                    </Field>
                  )}
                </>
              )}
            </>
          )}
          {error && <div className="err" style={{ color: 'var(--red)', fontSize: 12.5 }}>{error}</div>}
          <Button variant="primary" size="lg" block onClick={submit}>
            {role === 'GROWER' && mode === 'otp' && !otpSent ? 'Send OTP' : 'Sign in'}
          </Button>
        </div>

        <div className="auth-foot">
          <span>New grower? <Link to="/register" className="link">Register</Link></span>
          <button type="button" onClick={() => { resetDemo(); toast('Demo data reset') }}>Reset demo data</button>
        </div>
      </div>
    </div>
  )
}
