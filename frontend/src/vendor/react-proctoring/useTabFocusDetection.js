/**
 * Vendored from react-proctoring (MIT) by Ansh Saini
 * https://github.com/ansh-saini/react-proctoring
 *
 * Tab focus detection: Page Visibility API with vendor prefixes plus
 * focus/blur listeners with double-execution guards. Converted TS -> JS.
 * Only change: listeners are actually removed on unmount (the upstream
 * cleanup was commented out), detection behavior is identical.
 */
import { useState, useEffect } from 'react'

export function useTabFocusDetection({ disabled } = { disabled: false }) {
  const [tabFocusStatus, setTabFocusStatus] = useState(true)

  useEffect(() => {
    if (disabled) return

    const browserPrefixes = ['moz', 'ms', 'o', 'webkit']
    let isVisible = true // internal flag, defaults to true

    function getHiddenPropertyName(prefix) {
      return prefix ? prefix + 'Hidden' : 'hidden'
    }

    function getVisibilityEvent(prefix) {
      return (prefix ? prefix : '') + 'visibilitychange'
    }

    function getBrowserPrefix() {
      for (let i = 0; i < browserPrefixes.length; i++) {
        if (getHiddenPropertyName(browserPrefixes[i]) in document) {
          return browserPrefixes[i]
        }
      }
      return null
    }

    const browserPrefix = getBrowserPrefix()
    const hiddenPropertyName = getHiddenPropertyName(browserPrefix)
    const visibilityEventName = getVisibilityEvent(browserPrefix)

    function onVisible() {
      if (isVisible) return
      isVisible = true
      setTabFocusStatus(true)
    }

    function onHidden() {
      if (!isVisible) return
      isVisible = false
      setTabFocusStatus(false)
    }

    function handleVisibilityChange(forcedFlag) {
      // forcedFlag is a boolean when triggered by focus/blur,
      // otherwise it is an Event object.
      if (typeof forcedFlag === 'boolean') {
        if (forcedFlag) return onVisible()
        return onHidden()
      }
      if (document[hiddenPropertyName]) return onHidden()
      return onVisible()
    }

    const onFocus = () => handleVisibilityChange(true)
    const onBlur = () => handleVisibilityChange(false)

    document.addEventListener(visibilityEventName, handleVisibilityChange, false)
    document.addEventListener('focus', onFocus, false)
    document.addEventListener('blur', onBlur, false)
    window.addEventListener('focus', onFocus, false)
    window.addEventListener('blur', onBlur, false)

    return () => {
      document.removeEventListener(visibilityEventName, handleVisibilityChange, false)
      document.removeEventListener('focus', onFocus, false)
      document.removeEventListener('blur', onBlur, false)
      window.removeEventListener('focus', onFocus, false)
      window.removeEventListener('blur', onBlur, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { tabFocusStatus }
}
