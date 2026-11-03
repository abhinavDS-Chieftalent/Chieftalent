import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api.js'
import {
  useProctoring as useVendorProctoring,
  triggerFullscreen,
} from '@/vendor/react-proctoring'

/**
 * App-level proctoring wrapper around the vendored react-proctoring
 * library (github.com/ansh-saini/react-proctoring, MIT).
 *
 * Detection itself (tab focus, full screen, context menu, copy,
 * selection) is entirely the library's cross-browser implementation.
 * This wrapper only:
 *   - reports violations to the server (3 strikes -> abort),
 *   - blocks DevTools keyboard shortcuts,
 *   - guards accidental page close,
 *   - and renders the violation state for the UI.
 */
export function useProctoring(token, active) {
  const [warnings, setWarnings] = useState(0)
  const [violation, setViolation] = useState(null) // {type, message}
  const [aborted, setAborted] = useState(false)
  const firing = useRef(false)
  const armedRef = useRef(false)
  const violationRef = useRef(null)

  const proctor = useVendorProctoring({
    preventTabSwitch: true,
    forceFullScreen: true,
    preventContextMenu: true,
    preventUserSelection: true,
    preventCopy: true,
  })

  // Arm one tick after mount: the transition into the interview (auto
  // full-screen, focus shifts) must not count as a violation.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { armedRef.current = true }, 1500)
    return () => { armedRef.current = false; clearTimeout(t) }
  }, [active])

  const report = useCallback(async (type, message) => {
    if (!armedRef.current || firing.current) return
    firing.current = true
    violationRef.current = { type, message }
    setViolation({ type, message })
    try {
      const res = await api.reportTabWarning(token)
      setWarnings(res.warnings || 0)
      if (res.aborted) {
        setAborted(true)
        violationRef.current = null
        setViolation(null)
      }
    } catch {
      setWarnings((w) => w + 1)
    } finally {
      setTimeout(() => { firing.current = false }, 800)
    }
  }, [token])

  // --- Tab switch: library flag transition true -> false ---
  const tabFocused = proctor.tabFocus.status
  const prevTabRef = useRef(tabFocused)
  useEffect(() => {
    if (!active || aborted) return
    if (prevTabRef.current === true && tabFocused === false) {
      report('tab', 'Tab switching detected.')
    }
    prevTabRef.current = tabFocused
  }, [tabFocused, active, aborted, report])

  // --- Full screen: library flag transition on -> off ---
  const fsStatus = proctor.fullScreen.status
  const prevFsRef = useRef(fsStatus)
  useEffect(() => {
    if (!active || aborted) return
    if (prevFsRef.current === 'on' && fsStatus === 'off') {
      report('fullscreen', 'You left full-screen mode.')
    }
    prevFsRef.current = fsStatus
  }, [fsStatus, active, aborted, report])

  // --- Poll-based enforcement (deterministic backstop) ---
  // Event listeners can be suppressed or missed (browser quirks, extensions
  // like "Tab Always Active" that spoof the Visibility API). This poll does
  // not depend on any event:
  //   * full screen: once full screen has been seen ON, dropping out of it
  //     is a violation - even if the fullscreenchange event never fired.
  //   * focus: document.hasFocus() cannot be spoofed by visibility-spoofing
  //     extensions (they fake document.hidden/visibilityState, not real
  //     window focus). Two consecutive unfocused samples (~8s) = the
  //     candidate left the interview window.
  useEffect(() => {
    if (!active || aborted) return
    let fsSeen = false
    let unfocusedStreak = 0
    const iv = setInterval(() => {
      if (!armedRef.current || firing.current || violationRef.current) return
      const fsOn = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      )
      if (fsOn) fsSeen = true
      if (fsSeen && !fsOn) {
        report('fullscreen', 'You left full-screen mode.')
        return
      }
      if (document.hasFocus()) {
        unfocusedStreak = 0
      } else if (++unfocusedStreak >= 2) {
        unfocusedStreak = 0
        report('tab', 'The interview window lost focus. Keep this window in the foreground.')
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [active, aborted, report])

  // --- DevTools keyboard shortcuts (the library deliberately excludes
  //     devtools detection as unreliable; we still block the shortcuts) ---
  useEffect(() => {
    if (!active || aborted) return
    const onKey = (e) => {
      const k = e.key
      if (
        k === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(k))
      ) {
        e.preventDefault()
        e.stopPropagation()
        report('devtools', 'Developer tools shortcuts are disabled during the interview.')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, aborted, report])

  // --- Accidental close guard ---
  useEffect(() => {
    if (!active || aborted) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active, aborted])

  // Re-enter full screen when the candidate acknowledges a violation
  // (dismiss = a user gesture, which requestFullscreen requires).
  const dismissViolation = useCallback(() => {
    violationRef.current = null
    setViolation(null)
    if (!document.fullscreenElement) triggerFullscreen()
  }, [])

  return { warnings, violation, dismissViolation, aborted }
}
