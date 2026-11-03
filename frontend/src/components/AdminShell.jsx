import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Briefcase, SignOut, Crown, User, List, X } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { useAuth } from '@/auth.jsx'
import Logo from '@/components/Logo.jsx'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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

// Only claim "connected" or "unreachable" once the API has actually said so; until then (or if the
// payload carries no status) say we are checking rather than flashing a false red.
function aiStatusOf(ov) {
  if (ov?.ai?.ok === true) return { label: 'AI API connected', color: '#34d399' }
  if (ov?.ai?.ok === false) return { label: 'AI API unreachable', color: '#f87171' }
  return { label: 'Checking AI API…', color: '#a9a39b' }
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminShell({ active = 'candidates', children }) {
  const [ov, setOv] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState(null)
  const [roleDeleting, setRoleDeleting] = useState(false)
  const [roleDeleteError, setRoleDeleteError] = useState('')
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'
  const aiStatus = aiStatusOf(ov)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeRoleFilter = searchParams.get('role')

  // Keep the sidebar live (role list + counts) - a role deleted in the
  // dashboard must disappear here without a manual refresh.
  useEffect(() => {
    let alive = true
    const fetchOv = () => api.overview().then((d) => alive && setOv(d)).catch(() => {})
    fetchOv()
    const t = setInterval(fetchOv, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const doLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // Sidebar role deletion (replaces the old "Delete role" card button).
  // Same behavior as before: the role definition is deleted, candidates are
  // kept on the dashboard.
  const confirmDeleteRole = async () => {
    if (!roleToDelete || roleDeleting) return
    setRoleDeleting(true)
    setRoleDeleteError('')
    try {
      await api.deleteJob(roleToDelete)
      setOv((o) =>
        o ? { ...o, job_roles: (o.job_roles || []).filter((x) => x !== roleToDelete) } : o
      )
      if (activeRoleFilter === roleToDelete) navigate('/admin')
      setRoleToDelete(null)
    } catch (e) {
      setRoleDeleteError(e.message)
    } finally {
      setRoleDeleting(false)
    }
  }

  const sidebarContent = (
    <>
      <div className="flex items-center px-4 py-4">
        <Logo onDark className="h-9" />
      </div>
      <div className="h-px bg-ink-border" />
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-ink-muted">Workspace</div>
        <Link
          to="/admin"
          onClick={() => setDrawerOpen(false)}
          className={`nav-item ${active === 'candidates' ? 'active' : ''}`}
        >
          <Users size={16} className="shrink-0" weight={active === 'candidates' ? 'fill' : 'regular'} />
          Candidates
          {Array.isArray(ov?.candidates) && (
            <span className="num ml-auto text-xs text-ink-muted">
              {ov.candidates.length}
            </span>
          )}
        </Link>
        <div className="px-2 pb-1.5 pt-4 text-xs font-semibold text-ink-muted">Roles</div>
        {(ov?.job_roles || []).map((r) => (
          <div key={r} className="group relative flex items-center">
            <Link
              to={activeRoleFilter === r ? '/admin' : `/admin?role=${r}`}
              onClick={() => setDrawerOpen(false)}
              className={`nav-item min-w-0 flex-1 ${activeRoleFilter === r ? 'active' : ''}`}
              title={activeRoleFilter === r ? 'Clear role filter' : 'Show candidates in this role'}
              // Reserve the hover-X strip (inline style - the unlayered
              // .nav-item padding would beat a Tailwind pr-* utility).
              style={{ paddingRight: '26px' }}
            >
              <Briefcase size={16} className="shrink-0" weight={activeRoleFilter === r ? 'fill' : 'regular'} />
              <span className="truncate capitalize">{r.replace(/_/g, ' ')}</span>
            </Link>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setRoleToDelete(r)
                }}
                aria-label={`Delete role ${r.replace(/_/g, ' ')}`}
                title="Delete this role (candidates are kept)"
                className="absolute right-1 z-10 rounded p-1 text-ink-muted opacity-0 transition-opacity hover:bg-ink-2 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="h-px bg-ink-border" />
      <div className="space-y-1.5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="status-dot"
            style={{ background: aiStatus.color }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-ink-foreground">{aiStatus.label}</span>
        </div>
      </div>

      <div className="h-px bg-ink-border" />
      {/* User footer */}
      <div className="flex items-center gap-2.5 p-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-ink-2 text-xs text-ink-foreground">
            {initials(user?.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-ink-foreground">
              {user?.name || '-'}
            </span>
            {user?.role === 'admin' ? (
              <Badge className="h-4 gap-1 border-0 bg-primary/25 px-1.5 text-[10px] font-semibold text-glow hover:bg-primary/25">
                <Crown size={10} weight="fill" /> ADMIN
              </Badge>
            ) : (
              <Badge className="h-4 gap-1 border-0 bg-ink-2 px-1.5 text-[10px] font-semibold text-ink-muted hover:bg-ink-2">
                <User size={10} /> RECRUITER
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-ink-muted">{user?.email}</div>
        </div>
        <button
          type="button"
          onClick={doLogout}
          aria-label="Sign out"
          title="Sign out"
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-ink-2 hover:text-ink-foreground"
        >
          <SignOut size={16} />
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <aside className="sidebar sticky top-0 hidden flex-col lg:flex">{sidebarContent}</aside>

      {/* Mobile drawer: off-canvas sidebar with backdrop */}
      <div className="lg:hidden">
        {drawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`sidebar fixed top-0 left-0 z-50 flex flex-col overscroll-contain transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ height: '100dvh' }}
          aria-label="Workspace navigation"
          aria-hidden={!drawerOpen}
          // A closed drawer is off-screen: keep its links out of the keyboard tab order.
          {...(drawerOpen ? {} : { inert: '' })}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-ink-muted hover:bg-ink-2 hover:text-ink-foreground"
          >
            <X size={18} />
          </button>
          {sidebarContent}
        </aside>
      </div>

      <main id="main" className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <List size={20} />
          </button>
          <Logo className="h-7" />
          <span
            className="status-dot ml-auto"
            style={{ background: aiStatus.color }}
            role="img"
            aria-label={aiStatus.label}
            title={aiStatus.label}
          />
        </div>
        {children}
      </main>

      {/* Role deletion confirm (hover-X on a sidebar role) */}
      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete the role &ldquo;{roleToDelete?.replace(/_/g, ' ')}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The job definition, posting and question set are removed. Candidates of
              this role stay on the dashboard with their history - they are not deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {roleDeleteError && (
            <p className="text-sm text-destructive">Delete failed: {roleDeleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={roleDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDeleteRole()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {roleDeleting ? 'Deleting…' : 'Delete role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
