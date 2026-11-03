import { FilePdf, UploadSimple } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const roleLabel = (r) => r.replace(/_/g, ' ')

function RoleSelect({ value, onChange, roles, label }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder="Select role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            <span className="capitalize">{roleLabel(r)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * One intake area in two columns: add a job description (left), screen CVs against a role (right).
 * No card-in-card: a single bordered panel with a rule between the columns. All state and handlers
 * live in the page; this component only lays them out.
 */
export default function IntakeArea({
  jobRoles,
  // job description
  jdText, setJdText, jdFile, setJdFile, jdFileRef, jdBusy, jdMsg, jdCreatedRole, onCreateJdText, onUploadJd,
  jdRole, setJdRole,
  // CV screening
  role, setRole, files, setFiles, fileRef, uploading, uploadMsg, onUpload, processingCount,
}) {
  return (
    <section className="grid rounded-lg border bg-card lg:grid-cols-2" aria-label="Add jobs and screen CVs">
      <div className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-bold">Add a job description</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the raw text or upload a file. It is structured, stored as a PDF, and a matching role is created.
          </p>
        </div>

        <Textarea
          rows={4}
          placeholder="Paste the raw job description text here…"
          aria-label="Raw JD text"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
        />
        <Button onClick={onCreateJdText} disabled={jdText.trim().length < 40 || jdBusy}>
          {jdBusy ? 'Processing…' : 'Create role from text'}
        </Button>

        <div className="space-y-2 border-t border-line pt-4">
          <Input
            ref={jdFileRef}
            type="file"
            accept=".pdf,.txt"
            aria-label="JD file"
            onChange={(e) => setJdFile(e.target.files?.[0] || null)}
          />
          <Button variant="outline" onClick={onUploadJd} disabled={!jdFile || jdBusy}>
            {jdBusy ? 'Processing…' : 'Create role from file'}
          </Button>
        </div>

        {jdMsg && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {jdMsg}{' '}
            {jdCreatedRole && (
              <a href={api.jdPdfUrl(jdCreatedRole)} className="link inline-flex items-center gap-1 underline underline-offset-4">
                <FilePdf size={14} aria-hidden="true" /> Download the structured JD PDF
              </a>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted-foreground">Download a role&rsquo;s JD PDF</span>
          <div className="w-52">
            <RoleSelect value={jdRole} onChange={setJdRole} roles={jobRoles} label="Job role for JD download" />
          </div>
          <a
            href={api.jdPdfUrl(jdRole)}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            title="Download the structured JD PDF for the selected role"
          >
            <FilePdf aria-hidden="true" />
            JD PDF
          </a>
        </div>
      </div>

      <div className="space-y-4 border-t border-line p-6 lg:border-l lg:border-t-0">
        <div>
          <h2 className="text-base font-bold">Screen new CVs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload one or more PDF resumes. They are screened one by one, and shortlisted candidates get an interview
            link automatically.
          </p>
        </div>

        <div className="max-w-xs">
          <RoleSelect value={role} onChange={setRole} roles={jobRoles} label="Job role" />
        </div>
        <Input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          aria-label="CV files"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        <Button onClick={onUpload} disabled={!files.length || uploading}>
          <UploadSimple aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload & screen'}
        </Button>

        {uploadMsg && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {uploadMsg}
          </p>
        )}
        {processingCount > 0 && (
          <p role="status" aria-live="polite" className="num text-sm text-muted-foreground">
            Screening {processingCount} CV(s)…
          </p>
        )}
      </div>
    </section>
  )
}
