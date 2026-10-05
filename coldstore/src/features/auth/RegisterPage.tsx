import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Apple, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../core/store'
import { Button, Field, Input, toast } from '../../ui'
import './auth.css'

const MOCK_OTP = '123456'
const TITLES = ['Mobile number', 'Verify OTP', 'Personal details', 'Orchard details']

export default function RegisterPage() {
  const nav = useNavigate()
  const registerGrower = useStore((s) => s.registerGrower)
  const login = useStore((s) => s.login)

  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [f, setF] = useState({
    mobile: '', otp: '', name: '', fatherName: '', village: '', district: '', address: '',
    orchard: '', production: '', storage: '',
  })
  const [growerId, setGrowerId] = useState<string | undefined>()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (step === 0 && f.mobile.replace(/\D/g, '').length < 10) e.mobile = 'Enter a valid 10-digit mobile number'
    if (step === 1 && f.otp !== MOCK_OTP) e.otp = 'Incorrect OTP. Use 123456 for this demo.'
    if (step === 2) {
      if (!f.name.trim()) e.name = 'Full name is required'
      if (!f.village.trim()) e.village = 'Village is required'
      if (!f.district.trim()) e.district = 'District is required'
    }
    if (step === 3) {
      if (!f.orchard.trim()) e.orchard = 'Orchard or village name is required'
      if (!(Number(f.storage) > 0)) e.storage = 'Enter the boxes you expect to store'
    }
    return e
  }

  const next = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    if (step < 3) return setStep(step + 1)
    const res = registerGrower({
      name: f.name.trim(), fatherName: f.fatherName.trim() || undefined, phone: f.mobile.trim(),
      village: f.village.trim(), district: f.district.trim(), address: f.address.trim() || undefined,
      orchard: f.orchard.trim(), expectedProduction: f.production ? Number(f.production) : undefined,
      expectedStorage: Number(f.storage),
    }, 'PENDING')
    if (!res.ok) {
      toast(res.error ?? 'Could not register', 'error')
      if (res.error?.includes('mobile')) { setStep(0); setErrors({ mobile: res.error }) }
      return
    }
    setGrowerId(res.id)
    setStep(4)
  }

  const finish = () => {
    if (growerId) { login('GROWER', growerId); nav('/app', { replace: true }) }
    else nav('/login')
  }

  return (
    <div className="auth-shell">
      <div className="auth-col">
        <div className="auth-brand">
          <div className="auth-mark"><Apple /></div>
          <h1>Grower registration</h1>
          <p>Kashmir Fresh CA Storage</p>
        </div>

        {step < 4 ? (
          <>
            <div className="auth-steps" aria-label={`Step ${step + 1} of 4`}>
              {TITLES.map((_, i) => <i key={i} className={i <= step ? 'done' : ''} />)}
            </div>
            <div className="auth-card">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Step {step + 1} of 4</div>
                <b style={{ fontSize: 16 }}>{TITLES[step]}</b>
              </div>

              {step === 0 && (
                <Field label="Mobile number" error={errors.mobile} hint="We will send a one-time password to verify it.">
                  <Input inputMode="tel" placeholder="+91 98765 43210" value={f.mobile} autoFocus onChange={(e) => set('mobile', e.target.value)} />
                </Field>
              )}
              {step === 1 && (
                <Field label={`OTP sent to ${f.mobile}`} error={errors.otp} hint="Demo OTP: 123456">
                  <Input className="auth-otp" inputMode="numeric" maxLength={6} autoFocus value={f.otp}
                    onChange={(e) => set('otp', e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
                </Field>
              )}
              {step === 2 && (
                <>
                  <Field label="Full name" error={errors.name}><Input value={f.name} autoFocus onChange={(e) => set('name', e.target.value)} /></Field>
                  <Field label="Father's name"><Input value={f.fatherName} onChange={(e) => set('fatherName', e.target.value)} /></Field>
                  <div className="auth-two">
                    <Field label="Village" error={errors.village}><Input value={f.village} onChange={(e) => set('village', e.target.value)} /></Field>
                    <Field label="District" error={errors.district}><Input value={f.district} onChange={(e) => set('district', e.target.value)} /></Field>
                  </div>
                  <Field label="Address"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="Orchard / village" error={errors.orchard}><Input value={f.orchard} autoFocus onChange={(e) => set('orchard', e.target.value)} /></Field>
                  <Field label="Approx. apple production (boxes)"><Input type="number" inputMode="numeric" min={0} value={f.production} onChange={(e) => set('production', e.target.value)} /></Field>
                  <Field label="Expected storage quantity (boxes)" error={errors.storage}><Input type="number" inputMode="numeric" min={0} value={f.storage} onChange={(e) => set('storage', e.target.value)} /></Field>
                </>
              )}

              <div className="auth-actions">
                {step > 0 && <Button size="lg" onClick={() => { setErrors({}); setStep(step - 1) }}>Back</Button>}
                <Button variant="primary" size="lg" onClick={next}>
                  {step === 0 ? 'Send OTP' : step === 1 ? 'Verify' : step === 3 ? 'Submit' : 'Continue'}
                </Button>
              </div>
            </div>
            <div className="auth-foot"><span>Already registered? <Link to="/login" className="link">Sign in</Link></span></div>
          </>
        ) : (
          <div className="auth-card">
            <div className="auth-success">
              <CheckCircle2 />
              <b style={{ fontSize: 18 }}>Registration submitted</b>
              <span className="pill amber">Pending approval by store</span>
              <p className="muted">The store team will review your details. You can sign in meanwhile; storage requests unlock once you are approved.</p>
            </div>
            <Button variant="primary" size="lg" block onClick={finish}>Continue to my account</Button>
          </div>
        )}
      </div>
    </div>
  )
}
