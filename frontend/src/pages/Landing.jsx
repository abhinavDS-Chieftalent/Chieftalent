import { useEffect } from 'react'
import Navbar from '@/components/landing/Navbar.jsx'
import Hero from '@/components/landing/Hero.jsx'
import Idea from '@/components/landing/Idea.jsx'
import RoleTimeline from '@/components/landing/RoleTimeline.jsx'
import WhoDoesWhat from '@/components/landing/WhoDoesWhat.jsx'
import ForCandidates from '@/components/landing/ForCandidates.jsx'
import Planned from '@/components/landing/Planned.jsx'
import DataPrivacy from '@/components/landing/DataPrivacy.jsx'
import Closing from '@/components/landing/Closing.jsx'
import Footer from '@/components/landing/Footer.jsx'

/** Public landing page: composition only. Copy lives in components/landing/content.js. */
export default function Landing() {
  useEffect(() => {
    document.title = 'ChiefTalent - CV screening and video interviews | DotStark'
  }, [])

  return (
    <div className="min-h-[100dvh] bg-paper">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <Idea />
        <RoleTimeline />
        <WhoDoesWhat />
        <ForCandidates />
        <Planned />
        <DataPrivacy />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
