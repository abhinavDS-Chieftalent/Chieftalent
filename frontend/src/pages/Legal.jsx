import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '@/components/Logo.jsx'

const UPDATED = 'November 2026'
const SALES = 'sales@dotstark.com' // companies: accounts, trials, commercial questions
const SUPPORT = 'yash@dotstark.com' // candidates: interviews, their data, corrections and deletion

const Mail = ({ to }) => (
  <a href={`mailto:${to}`} className="link underline underline-offset-4">
    {to}
  </a>
)

export function LegalShell({ title, updated, children }) {
  useEffect(() => {
    document.title = `${title} - ChiefTalent`
  }, [title])

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link to="/" aria-label="ChiefTalent home" className="inline-flex rounded-md">
            <Logo className="h-9" />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#db4f25]"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-4xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
        <div className="mt-8 max-w-[68ch] space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:pt-2 [&_h2]:text-lg [&_h2]:font-bold">
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>ChiefTalent, a DotStark product</span>
          <span className="flex gap-4">
            <Link to="/terms" className="link">Terms</Link>
            <Link to="/privacy" className="link">Privacy</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service" updated={UPDATED}>
      <section>
        <h2>1. What ChiefTalent is</h2>
        <p>ChiefTalent is a hiring platform provided by DotStark to the companies that use it. It screens candidate CVs with AI, runs timed browser-based interviews, and presents scores and recordings to the company&rsquo;s authorised hiring staff. The AI output is advisory. Every hiring decision is made by a human reviewer.</p>
      </section>
      <section>
        <h2>2. Accounts and access</h2>
        <p>Access is by invitation. Accounts are created by your company&rsquo;s workspace administrator and are role-based (admin or recruiter). You are responsible for keeping your credentials confidential and for all activity under your account.</p>
      </section>
      <section>
        <h2>3. Candidate data</h2>
        <p>CVs, interview answers, and audio/video recordings are processed solely for recruitment purposes. Candidates receive unique, non-transferable interview links. Deleting a candidate removes their CV, answers, recordings, and evaluation from the system.</p>
      </section>
      <section>
        <h2>4. Acceptable use</h2>
        <p>Do not share interview links, export candidate data for non-recruitment purposes, or attempt to probe the AI evaluation beyond its intended use. Misuse may result in access revocation.</p>
      </section>
      <section>
        <h2>5. Availability</h2>
        <p>ChiefTalent is provided as a service. DotStark does not commit to an uptime level unless one is agreed with you in writing, and may modify or discontinue features with notice to workspace administrators.</p>
      </section>
      <section>
        <h2>6. Contact</h2>
        <p>Questions about these terms, accounts or a trial: <Mail to={SALES} />. Candidates with a question about an interview: <Mail to={SUPPORT} />. More about DotStark at dotstark.com.</p>
      </section>
    </LegalShell>
  )
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated={UPDATED}>
      <section>
        <h2>1. What we collect</h2>
        <p>From candidates: CV contents, contact details extracted from the CV, interview answers, and audio/video recordings made during the interview. From staff users: name, work email, and role.</p>
      </section>
      <section>
        <h2>2. How it is used</h2>
        <p>Candidate data is used only to evaluate suitability for the role applied for: AI screening, interview scoring, and human review. Staff data is used for authentication and access control.</p>
      </section>
      <section>
        <h2>3. AI processing</h2>
        <p>CV text and interview transcripts are processed by AI models through an AI API to produce scores and structured evaluations. AI output is advisory and always reviewed by a human before any decision.</p>
      </section>
      <section>
        <h2>4. Retention and deletion</h2>
        <p>Candidate records are kept for the duration of the hiring process. Admins can delete a candidate at any time, which removes the CV file, all answers, all recordings, and the AI evaluation.</p>
      </section>
      <section>
        <h2>5. Security</h2>
        <p>Access is authenticated and role-based. Interview links are unique tokens. Passwords are stored only as salted hashes. Password reset codes expire after 10 minutes.</p>
      </section>
      <section>
        <h2>6. Contact</h2>
        <p>Candidates can write to <Mail to={SUPPORT} /> for access, correction, or deletion requests. Companies using ChiefTalent can also contact their workspace administrator or <Mail to={SALES} />.</p>
      </section>
    </LegalShell>
  )
}
