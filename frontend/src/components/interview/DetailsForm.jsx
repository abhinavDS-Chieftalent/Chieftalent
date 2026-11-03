import { useState } from 'react'
import { api } from '@/api.js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MIN_SKILL_CHARS = 300

const FIELDS = [
  ['first_name', 'First Name', 'text', true],
  ['last_name', 'Last Name', 'text', true],
  ['current_city', 'Current City', 'text', true],
  ['hometown', 'Hometown', 'text', true],
  ['current_company', 'Current Company (optional for freshers)', 'text', false],
  ['total_experience', 'Total Experience (years, 0 if fresher)', 'number', true],
  ['notice_period', 'Notice Period (days, 0 if immediate)', 'number', true],
  ['current_ctc', 'Current CTC (₹, e.g. 450000)', 'number', true],
  ['expected_ctc', 'Expected CTC (₹, e.g. 600000)', 'number', true],
  ['family_members', 'Number of Family Members', 'number', true],
  ['earning_members', 'Number of Earning Family Members', 'number', true],
]

export default function DetailsForm({ token, initial, onDone }) {
  const [values, setValues] = useState(initial || {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if ((values.skills_description || '').trim().length < MIN_SKILL_CHARS) {
      setError(
        `Your skills answer needs at least ${MIN_SKILL_CHARS} characters. Explain where you used each skill and what you achieved.`
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.submitDetails(token, values)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const skills = values.skills_description || ''
  const chars = skills.trim().length
  const charsOk = chars >= MIN_SKILL_CHARS

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <CardHeader>
          <h1 className="font-display text-2xl font-extrabold">Before we begin</h1>
          <CardDescription>
            Please fill in your details. This information is for our records only and is
            not part of your interview score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([key, label, type, required]) => (
                <div
                  key={key}
                  className={`space-y-1.5 ${key === 'earning_members' ? 'sm:col-span-2' : ''}`}
                >
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    name={key}
                    autoComplete="off"
                    type={type}
                    required={required}
                    value={values[key] || ''}
                    onChange={
                      type === 'number'
                        ? // Strip anything that is not a digit or dot - number
                          // inputs still accept 'e'/'+', and pasted junk must die.
                          (e) =>
                            setValues((v) => ({
                              ...v,
                              [key]: e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'),
                            }))
                        : set(key)
                    }
                    inputMode={type === 'number' ? 'decimal' : undefined}
                    min={type === 'number' ? 0 : undefined}
                    step={type === 'number' ? 'any' : undefined}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="skills_description">
                Which are your three strongest skills (two professional skills and one
                personal quality), and how have you used them in your work or studies?
              </Label>
              <p className="text-xs text-muted-foreground">
                Professional skills are whatever you are genuinely good at: tools,
                technologies, methods, or everyday work skills like client handling,
                analysis, writing or organising. They do not have to be technical. Answer
                in <strong>at least {MIN_SKILL_CHARS} characters</strong>, explaining where
                you used each skill, what you did with it, and the result you got.
              </p>
              <Textarea
                id="skills_description"
                name="skills_description"
                autoComplete="off"
                rows={9}
                required
                value={skills}
                onChange={set('skills_description')}
                placeholder={
                  'Professional skill 1: Client handling. In my current role I manage 6 key client accounts…\n\n' +
                  'Professional skill 2: Data analysis with Excel. I built tracking sheets for my team…\n\n' +
                  'Personal quality: I stay calm under deadline pressure. During our year-end closing…'
                }
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Write this yourself and be honest. AI-generated answers may be detected
                  and flagged.
                </p>
                <span
                  className={`num shrink-0 text-xs font-semibold ${
                    chars === 0
                      ? 'text-muted-foreground'
                      : charsOk
                        ? 'text-pass'
                        : 'text-fail'
                  }`}
                  aria-live="polite"
                >
                  {chars} / {MIN_SKILL_CHARS} characters minimum
                </span>
              </div>
            </div>

            {error && <p className="text-sm text-fail">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit & continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
