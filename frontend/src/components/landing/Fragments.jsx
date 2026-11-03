import { VideoCamera } from '@phosphor-icons/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import StatusBadge from '@/components/StatusBadge.jsx'

/**
 * Small previews built from the app's own components with sample data, one per timeline stage.
 * They are illustrations, so assistive tech skips them (the stage text carries the meaning) and
 * `inert` keeps the sample controls out of the tab order. Nothing here shows an unbuilt feature.
 */
function Sample({ children, label = 'Sample' }) {
  return (
    <figure aria-hidden="true" inert="" className="m-0 rounded-lg border border-line bg-paper p-4 text-ink">
      <figcaption className="mb-3 text-right text-xs text-muted-foreground">{label}</figcaption>
      {children}
    </figure>
  )
}

export function JobFragment() {
  return (
    <Sample>
      <p className="text-sm font-bold">.NET Development Intern</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Internship, Jaipur</p>
      <p className="mt-3 text-xs font-semibold">Core requirements</p>
      <ul className="mt-1.5 space-y-1.5 text-sm">
        <li>Good understanding of at least one programming language, such as C#, Java or Python</li>
        <li>Understanding of object-oriented programming, data structures and algorithms</li>
        <li>Familiarity with relational databases, SQL and CRUD operations</li>
      </ul>
    </Sample>
  )
}

export function CvFragment() {
  return (
    <Sample>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar>
          <AvatarFallback>MI</AvatarFallback>
        </Avatar>
        <div className="min-w-[9rem] flex-1">
          <p className="truncate text-sm font-semibold">Meera Iyer</p>
          <p className="truncate text-xs text-muted-foreground">meera.iyer@example.com</p>
        </div>
        <span className="num text-sm font-bold text-pass">78</span>
        <div className="meter">
          <span style={{ width: '78%', background: 'var(--pass)' }} />
        </div>
        <StatusBadge status="shortlisted" />
      </div>
      <p className="mt-3 text-xs font-semibold">Matched</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {['C# and OOP', 'SQL', 'REST APIs'].map((m) => (
          <Badge key={m} variant="secondary">
            {m}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Solid junior profile with evidenced C# and SQL work. Limited deployment experience.
      </p>
    </Sample>
  )
}

export function InviteFragment() {
  return (
    <Sample>
      <p className="text-sm font-bold">Your interview link for .NET Development Intern</p>
      <p className="mt-3 text-sm">Hello Meera,</p>
      <p className="mt-2 text-sm">
        Your profile has been shortlisted for the .NET Development Intern position at DotStark Technologies. The next
        step is a short online interview that you take from your own computer, at a time that suits you.
      </p>
      <span className={`${buttonVariants()} mt-3`}>Start your interview</span>
    </Sample>
  )
}

export function InterviewFragment() {
  const options = [
    ['GET', false],
    ['POST', true],
    ['DELETE', false],
    ['HEAD', false],
  ]
  return (
    <Sample>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Question 2 of 21</span>
        <span className="num font-semibold text-ink">Interview time left: 29:41</span>
      </div>
      <p className="mt-3 text-sm font-semibold">Which HTTP method is normally used to create a resource in a REST API?</p>
      <div className="mt-3 space-y-2">
        {options.map(([label, selected]) => (
          <div key={label} className={`option-row ${selected ? 'selected' : ''}`}>
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                selected ? 'border-primary bg-primary' : 'border-input'
              }`}
            />
            {label}
          </div>
        ))}
      </div>
    </Sample>
  )
}

export function ReviewFragment() {
  return (
    <Sample>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Recommend progress</Badge>
        <span className="num text-sm font-semibold">17 of 20 correct</span>
      </div>
      <p className="mt-3 text-xs font-semibold">Self-introduction, transcript</p>
      <p className="mt-1 rounded-md bg-muted p-3 text-sm">
        For my final-year project I built a REST API in ASP.NET Core with a SQL Server backend and deployed it with
        Docker.
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <VideoCamera size={14} aria-hidden="true" /> Video answer, 3:42
      </p>
    </Sample>
  )
}

export function DecisionFragment() {
  return (
    <Sample>
      <div className="flex flex-wrap gap-2">
        <Button>Select</Button>
        <Button variant="outline">Needs more review</Button>
        <Button variant="outline">Reject</Button>
      </div>
      <Textarea className="mt-3" rows={2} readOnly tabIndex={-1} placeholder="Review notes…" aria-label="Review notes" />
    </Sample>
  )
}

export const FRAGMENTS = {
  job: JobFragment,
  cvs: CvFragment,
  invite: InviteFragment,
  interview: InterviewFragment,
  review: ReviewFragment,
  decide: DecisionFragment,
}
