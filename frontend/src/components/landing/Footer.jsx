import { Link } from 'react-router-dom'
import Logo from '@/components/Logo.jsx'
import { SALES_EMAIL, SALES_MAILTO, SUPPORT_EMAIL, SUPPORT_MAILTO } from './content.js'

export default function Footer() {
  return (
    <footer className="border-t border-line bg-fog">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto_auto] md:items-start md:gap-14">
        <div className="flex items-center gap-3">
          <Logo mark className="h-9" />
          <p className="text-sm text-muted-foreground">ChiefTalent, a DotStark product</p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/terms" className="link">Terms</Link>
          <Link to="/privacy" className="link">Privacy</Link>
          <a href="https://www.dotstark.com" target="_blank" rel="noreferrer" className="link">DotStark</a>
          <Link to="/login" className="link">Sign in</Link>
        </nav>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Companies:{' '}
            <a href={SALES_MAILTO} className="link text-foreground">{SALES_EMAIL}</a>
          </p>
          <p>
            Candidates:{' '}
            <a href={SUPPORT_MAILTO} className="link text-foreground">{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
