import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '@/api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const d = await api.login(email, password)
    setUser(d.user)
    return d.user
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* session already gone */ }
    setUser(null)
  }, [])

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}

/** Wrap admin routes: waits for the session check, redirects to /login when anonymous. */
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="auth-spinner" aria-hidden="true" />
          Loading workspace…
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
