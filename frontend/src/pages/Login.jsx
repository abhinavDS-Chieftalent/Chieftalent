import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, EnvelopeSimple, LockKey, Eye, EyeSlash } from '@phosphor-icons/react'
import { useAuth } from '@/auth.jsx'
import { api } from '@/api.js'
import { usePageTitle } from '@/components/usePageTitle.js'
import Logo from '@/components/Logo.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const navigate = useNavigate()

  // view: 'login' | 'forgot' | 'otp-sent'
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const doLogin = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message || 'Sign-in failed. Check your credentials and try again.')
    } finally {
      setBusy(false)
    }
  }

  const doForgot = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api.forgotPassword(email)
      setNotice(res.message)
      setView('otp-sent')
    } catch (err) {
      setError(err.message || 'Could not send the code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const errorBox = error && (
    <p
      role="alert"
      aria-live="polite"
      className="rounded-md border border-destructive/40 bg-fail-bg px-3 py-2 text-sm text-fail"
    >
      {error}
    </p>
  )

  return (
    <div className="flex min-h-[100dvh]">
      {/* Brand panel: solid ink, the full-colour logo, one sentence */}
      <aside className="on-dark hidden w-[44%] flex-col justify-between bg-ink p-10 text-ink-foreground lg:flex">
        <Link to="/" aria-label="ChiefTalent home" className="inline-flex w-fit rounded-md">
          <Logo onDark className="h-11" />
        </Link>
        <div>
          <p className="display max-w-[13ch] text-[clamp(2rem,3.4vw,3rem)]">The first round runs itself.</p>
          <p className="mt-5 max-w-[38ch] text-base text-ink-muted">
            You keep the final word. ChiefTalent screens every CV against the role and runs the video interviews. You
            review the evidence and decide.
          </p>
        </div>
        <p className="text-sm text-ink-muted">A DotStark product. The AI recommends, people decide.</p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" aria-label="ChiefTalent home" className="mb-8 inline-flex rounded-md lg:hidden">
            <Logo className="h-10" />
          </Link>

          {view === 'login' && (
            <>
              <h1 className="text-3xl font-extrabold">Sign in</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Access the hiring dashboard with your work account.</p>
              <form onSubmit={doLogin} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="you@dotstark.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('')
                        setView('forgot')
                      }}
                      className="cursor-pointer rounded-sm text-xs font-semibold text-orange-deep hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="current-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                {errorBox}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </>
          )}

          {view === 'forgot' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setView('login')
                }}
                className="mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
              </button>
              <h1 className="text-3xl font-extrabold">Reset your password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your work email and we&rsquo;ll send a verification code to it.
              </p>
              <form onSubmit={doForgot} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Work email</Label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="you@dotstark.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {errorBox}
                <Button type="submit" className="w-full" disabled={busy}>
                  <EnvelopeSimple aria-hidden="true" />
                  {busy ? 'Sending code…' : 'Send verification code'}
                </Button>
              </form>
            </>
          )}

          {view === 'otp-sent' && (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <EnvelopeSimple size={22} weight="fill" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-3xl font-extrabold">Check your email</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {notice || 'If that email is registered, a verification code is on its way.'}
              </p>
              <div className="mt-8 space-y-1.5">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  disabled
                  aria-describedby="otp-note"
                />
                <p id="otp-note" className="text-xs text-muted-foreground">
                  Code verification goes live in the next phase. The field is ready.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => {
                  setView('login')
                  setNotice('')
                }}
              >
                <LockKey aria-hidden="true" />
                Back to sign in
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
