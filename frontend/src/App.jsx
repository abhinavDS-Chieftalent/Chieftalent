import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { RequireAuth } from './auth.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import { Terms, Privacy } from './pages/Legal.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CandidateDetail from './pages/CandidateDetail.jsx'
import Interview from './pages/Interview.jsx'
import InterviewDone from './pages/InterviewDone.jsx'

/** Every route change starts at the top of the page - never at the scroll
 *  position the previous page happened to be left at.
 *  NOTE: 'instant' is required - the app sets scroll-behavior:smooth
 *  globally, and a smooth animation gets cancelled mid-flight when the new
 *  page's content mounts, leaving the page stuck part-way down. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/candidate/:id"
        element={
          <RequireAuth>
            <CandidateDetail />
          </RequireAuth>
        }
      />
      <Route path="/interview/:token" element={<Interview />} />
      <Route path="/interview/:token/done" element={<InterviewDone />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
