/**
 * Vendored from react-proctoring (MIT) by Ansh Saini
 * https://github.com/ansh-saini/react-proctoring
 *
 * Cross-browser full-screen detection with vendor prefixes, F11/Esc
 * interception and mobile-Safari handling. Converted from TS to JS.
 */
import { useCallback, useEffect, useState } from 'react'
import { isMobileSafari, isIOS, isChrome } from 'react-device-detect'

export const triggerFullscreen = () => {
  const methods = [
    'requestFullscreen',
    'webkitRequestFullscreen',
    'webkitRequestFullScreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
  ]

  const ref = document.body
  if (ref) {
    for (const name of methods) {
      if (name in ref) {
        try {
          const p = ref[name]()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {
          /* ignore */
        }
        ref.style.overflowY = 'auto'
        break
      }
    }
  }
}

export function useFullScreenDetection({ disabled } = { disabled: false }) {
  const [fullScreenStatus, setFullScreenStatus] = useState('pending')

  const changeFullscreenStatus = useCallback(() => {
    setFullScreenStatus(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
        ? 'on'
        : 'off',
    )
  }, [])

  const listener = useCallback((e) => {
    // Prevent the user from ENTERING full screen with the keyboard.
    // Browsers do not allow preventing EXIT - fullscreenchange does not
    // fire for the manual hotkey either (browser security restriction).
    if (['F11', 'Escape'].includes(e.key)) {
      e.preventDefault()
    }
  }, [])

  useEffect(() => {
    if (disabled) {
      setFullScreenStatus('pending')
      return
    }

    // Mobile Safari / iOS Chrome do not support the Fullscreen API.
    if (isMobileSafari || (isChrome && isIOS)) {
      setFullScreenStatus('not-supported')
      return
    }

    changeFullscreenStatus()

    const vendorPrefix = ['', 'moz', 'webkit', 'ms']
    vendorPrefix.forEach(function (prefix) {
      document.addEventListener(prefix + 'fullscreenchange', changeFullscreenStatus)
    })
    window.addEventListener('keydown', listener)

    return () => {
      vendorPrefix.forEach(function (prefix) {
        document.removeEventListener(prefix + 'fullscreenchange', changeFullscreenStatus)
      })
      window.removeEventListener('keydown', listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { fullScreenStatus, triggerFullscreen }
}
