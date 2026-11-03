import { useEffect, useRef, useState } from 'react'
import { EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react'
import { api } from '@/api.js'

const RESEND_COOLDOWN_S = 55

/**
 * Phase 0 - prove the person opening the interview link controls the email
 * address that was on the resume. A 6-digit code is emailed there; entering
 * it unlocks the details form. Works for ANY email provider (unlike Google
 * sign-in, which would lock out candidates on Yahoo/Outlook/company mail).
 */
export default function VerifyEmail({ token, maskedEmail, onDone }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef(null)

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendCode = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.requestVerification(token)
      setSent(true)
      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (busy || code.trim().length !== 6) return
    setBusy(true)
    setError('')
    try {
      await api.confirmVerification(token, code.trim())
      onDone()
    } catch (e) {
      setError(e.message)
      setCode('')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <ShieldCheck size={24} className="text-accent-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold">Verify it&rsquo;s you</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          This interview link is personal. To continue, confirm you own the email
          address from your resume
          {maskedEmail ? (
            <>
              : <span className="font-medium text-foreground">{maskedEmail}</span>
            </>
          ) : (
            '.'
          )}
        </p>

        {!sent ? (
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="mt-6 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#db4f25] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <EnvelopeSimple size={16} aria-hidden="true" />
            {busy ? 'Sending…' : 'Email me a verification code'}
          </button>
        ) : (
          <div className="mt-6">
            <label htmlFor="verify-code" className="mb-1.5 block text-sm font-semibold">
              6-digit code
            </label>
            <input
              id="verify-code"
              name="code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
              placeholder="••••••"
              className="num w-full rounded-md border border-input bg-card px-4 py-2.5 text-center text-lg tracking-[0.5em]"
            />
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="mt-3 h-10 w-full cursor-pointer rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#db4f25] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Didn&rsquo;t get it? Check spam, or{' '}
              <button
                type="button"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="font-semibold text-orange-deep hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
              </button>
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-fail-bg p-3 text-center text-sm text-fail">
            {error}
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        The code expires in 10 minutes. If your resume email is wrong, contact the
        hiring team.
      </p>
    </div>
  )
}
