import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Funnel, X } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { useAuth } from '@/auth.jsx'
import { usePageTitle } from '@/components/usePageTitle.js'
import AdminShell from '@/components/AdminShell.jsx'
import StatsRow from '@/components/dashboard/StatsRow.jsx'
import IntakeArea from '@/components/dashboard/IntakeArea.jsx'
import CandidatesTable, { TABS } from '@/components/dashboard/CandidatesTable.jsx'
import {
  ANY, DEFAULTS, FILTER_KEYS, applyFilters, isFiltered, readFilters, statusOptions as buildStatusOptions,
} from '@/components/dashboard/filtering.js'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function inTab(c, tab) {
  switch (tab) {
    case 'shortlisted':
      return ['shortlisted', 'interview_sent'].includes(c.status)
    case 'interviewing':
      return ['interview_in_progress', 'interview_completed', 'evaluation_pending'].includes(c.status)
    case 'evaluated':
      return ['evaluation_completed', 'manual_review', 'selected'].includes(c.status)
    case 'rejected':
      return ['rejected', 'ats_error'].includes(c.status)
    default:
      return true
  }
}

export default function Dashboard() {
  usePageTitle('Dashboard')
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const roleFilter = searchParams.get('role')
  // Status / ATS / interview score / sort live in the URL so a filtered view can be bookmarked and shared.
  const urlFilters = useMemo(() => readFilters(searchParams), [searchParams])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [role, setRole] = useState('business_analyst')
  // Separate selection for the JD-PDF download: picking a role to download must not silently
  // change which role new CVs screen against.
  const [jdRole, setJdRole] = useState('business_analyst')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [tab, setTab] = useState('all')
  const fileRef = useRef(null)

  // JD creation state
  const [jdText, setJdText] = useState('')
  const [jdFile, setJdFile] = useState(null)
  const [jdBusy, setJdBusy] = useState(false)
  const [jdMsg, setJdMsg] = useState('')
  const [jdCreatedRole, setJdCreatedRole] = useState(null)
  const jdFileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setData(await api.overview())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const doCreateJd = async () => {
    if (jdBusy) return
    setJdBusy(true)
    setJdMsg('')
    try {
      const res = await api.createJdFromText(jdText)
      setJdCreatedRole(res.job.role)
      setJdMsg(`Created role "${res.job.title}".`)
      setJdText('')
      load()
    } catch (e) {
      setJdCreatedRole(null)
      setJdMsg(`Could not create role: ${e.message}`)
    } finally {
      setJdBusy(false)
    }
  }

  const doUploadJd = async () => {
    if (jdBusy || !jdFile) return
    setJdBusy(true)
    setJdMsg('')
    try {
      const res = await api.uploadJdFile(jdFile)
      setJdCreatedRole(res.job.role)
      setJdMsg(`Created role "${res.job.title}".`)
      setJdFile(null)
      if (jdFileRef.current) jdFileRef.current.value = ''
      load()
    } catch (e) {
      setJdCreatedRole(null)
      setJdMsg(`Could not create role: ${e.message}`)
    } finally {
      setJdBusy(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const jobs = data?.job_roles || []
    if (jobs.length && !jobs.includes(role)) setRole(jobs[0])
    if (jobs.length && !jobs.includes(jdRole)) setJdRole(jobs[0])
  }, [data, role, jdRole])

  const doUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setUploadMsg('')
    try {
      const res = await api.uploadCvs(role, files)
      const parts = []
      if (res.saved?.length) parts.push(`Uploaded ${res.saved.length} CV(s). Screening started.`)
      if (res.skipped?.length) {
        parts.push(
          `${res.skipped.length} skipped as duplicate${res.skipped.length > 1 ? 's' : ''}: ` +
            res.skipped.map((s) => `${s.file} (same as ${s.existing_name || '#' + s.existing_id})`).join(', ')
        )
      }
      setUploadMsg(parts.join(' ') || 'Nothing to upload.')
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) {
      setUploadMsg(`Upload failed: ${e.message}`)
    } finally {
      setUploading(false)
    }
  }

  const copyLink = async (c) => {
    try {
      await navigator.clipboard.writeText(c.interview_url)
      setCopiedId(c.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      window.prompt('Copy interview link:', c.interview_url)
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.deleteCandidate(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch (e) {
      // Keep the dialog open and show the reason where the user is looking: a silent close
      // looks like "the button did nothing".
      setDeleteError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const stats = useMemo(() => {
    let cs = data?.candidates || []
    if (roleFilter) cs = cs.filter((c) => c.role === roleFilter)
    const evaluated = cs.filter((c) => c.interview_score != null)
    const avg = evaluated.length
      ? Math.round(evaluated.reduce((s, c) => s + c.interview_score, 0) / evaluated.length)
      : null
    return {
      total: cs.length,
      scored: evaluated.length,
      // Same definition as the "Shortlisted" tab: the two numbers must never disagree on one screen.
      shortlisted: cs.filter((c) => ['shortlisted', 'interview_sent'].includes(c.status)).length,
      interviewing: cs.filter((c) => ['interview_in_progress', 'interview_completed', 'evaluation_pending'].includes(c.status)).length,
      avg,
    }
  }, [data, roleFilter])

  const counts = useMemo(() => {
    let cs = data?.candidates || []
    if (roleFilter) cs = cs.filter((c) => c.role === roleFilter)
    const m = { all: cs.length }
    for (const [key] of TABS.slice(1)) m[key] = cs.filter((c) => inTab(c, key)).length
    return m
  }, [data, roleFilter])

  // Stage breakdown for the stats strip (the tabs' stages are disjoint; everything else is "other").
  const breakdown = useMemo(() => {
    const staged = counts.shortlisted + counts.interviewing + counts.evaluated + counts.rejected
    return {
      shortlisted: counts.shortlisted,
      interviewing: counts.interviewing,
      evaluated: counts.evaluated,
      rejected: counts.rejected,
      other: Math.max(0, counts.all - staged),
    }
  }, [counts])

  // Rows of the current role and tab, before the extra filters.
  const tabRows = useMemo(() => {
    let cs = data?.candidates || []
    if (roleFilter) cs = cs.filter((c) => c.role === roleFilter)
    return cs.filter((c) => inTab(c, tab))
  }, [data, tab, roleFilter])

  const statusOptions = useMemo(() => buildStatusOptions(tabRows), [tabRows])
  // A status from the URL that this tab has no candidates for counts as "any" (the URL is left alone).
  const filters = useMemo(
    () => ({ ...urlFilters, status: statusOptions.some(([s]) => s === urlFilters.status) ? urlFilters.status : ANY }),
    [urlFilters, statusOptions]
  )
  const rows = useMemo(
    () => applyFilters(tabRows, filters, data?.ats_threshold ?? 70),
    [tabRows, filters, data]
  )

  const setFilter = (key, value) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (value === DEFAULTS[key]) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true }
    )
  const resetFilters = () =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        FILTER_KEYS.forEach((k) => p.delete(k))
        return p
      },
      { replace: true }
    )
  const clearRoleFilter = () =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('role')
        return p
      },
      { replace: true }
    )

  return (
    <AdminShell active="candidates">
      <div
        className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
        {...(data ? { 'data-dashboard-ready': '' } : {})}
      >
        <header>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-3xl font-extrabold">Candidates</h1>
            {roleFilter && (
              <button
                type="button"
                onClick={clearRoleFilter}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-orange-deep/40 bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors hover:bg-[#fbd5c4]"
                title="Clear role filter"
              >
                <Funnel size={12} weight="fill" aria-hidden="true" />
                <span className="capitalize">{roleFilter.replace(/_/g, ' ')}</span>
                <X size={12} aria-hidden="true" />
                <span className="sr-only">Clear role filter</span>
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Screen CVs against a role, send interviews and review results.
            {data && (
              <>
                {' '}
                ATS threshold <span className="num font-semibold text-foreground">{data.ats_threshold}</span>
              </>
            )}
          </p>
        </header>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-fail" role="alert">
              {error}
            </CardContent>
          </Card>
        )}

        <StatsRow ready={!!data} {...stats} breakdown={breakdown} activeTab={tab} onSelectTab={setTab} />

        <IntakeArea
          jobRoles={data?.job_roles || []}
          jdText={jdText}
          setJdText={setJdText}
          jdFile={jdFile}
          setJdFile={setJdFile}
          jdFileRef={jdFileRef}
          jdBusy={jdBusy}
          jdMsg={jdMsg}
          jdCreatedRole={jdCreatedRole}
          onCreateJdText={doCreateJd}
          onUploadJd={doUploadJd}
          jdRole={jdRole}
          setJdRole={setJdRole}
          role={role}
          setRole={setRole}
          files={files}
          setFiles={setFiles}
          fileRef={fileRef}
          uploading={uploading}
          uploadMsg={uploadMsg}
          onUpload={doUpload}
          processingCount={data?.processing?.length || 0}
        />

        <CandidatesTable
          loading={!data}
          rows={rows}
          tab={tab}
          setTab={setTab}
          counts={counts}
          isAdmin={isAdmin}
          atsThreshold={data?.ats_threshold}
          onCopy={copyLink}
          onDelete={setDeleteTarget}
          copiedId={copiedId}
          filters={filters}
          onFilterChange={setFilter}
          onFilterReset={resetFilters}
          filtersActive={isFiltered(filters)}
          statusOptions={statusOptions}
          totalInTab={tabRows.length}
        />
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the candidate, including their interview answers, recordings, evaluation, and the
              uploaded CV file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-fail-bg p-3 text-sm text-fail">
              Delete failed: {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                doDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-[#a52c24]"
            >
              {deleting ? 'Deleting…' : 'Delete candidate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  )
}
