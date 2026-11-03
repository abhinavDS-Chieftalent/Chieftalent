import { useState } from 'react'
import { Link } from 'react-router-dom'
import { List, X } from '@phosphor-icons/react'
import Logo from '@/components/Logo.jsx'
import { NAV_LINKS } from './content.js'

/** Black top bar with the full-colour logo. Static (not sticky), single line on desktop. */
export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="on-dark bg-ink text-ink-foreground">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="ChiefTalent home" className="inline-flex shrink-0 rounded-md">
          <Logo onDark className="h-9" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-sm text-sm font-medium text-ink-muted transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-foreground transition-colors hover:bg-ink-2 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />}
          </button>
          <Link
            to="/login"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#db4f25]"
          >
            Sign in
          </Link>
        </div>
      </div>

      {open && (
        <nav
          id="landing-menu"
          aria-label="Main"
          className="border-t border-ink-border px-4 pb-4 pt-2 md:hidden sm:px-6"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md py-3 text-base font-medium text-ink-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
