/**
 * Vendored from react-proctoring (MIT) by Ansh Saini
 * https://github.com/ansh-saini/react-proctoring
 * (context-menu / copy / selection blockers; TS -> JS)
 */
import { useCallback, useEffect } from 'react'

/** Block the right-click context menu. */
export function useDisableContextMenu({ disabled } = { disabled: false }) {
  const handler = useCallback((e) => e.preventDefault(), [])
  useEffect(() => {
    if (disabled) return
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [disabled, handler])
}

/** Block copy operations. */
export function useCopyDisable({ disabled } = { disabled: false }) {
  const handleCopy = useCallback((e) => e.preventDefault(), [])
  useEffect(() => {
    if (disabled) return
    document.addEventListener('copy', handleCopy)
    return () => document.removeEventListener('copy', handleCopy)
  }, [disabled, handleCopy])
}

/** Block text selection via CSS user-select. */
export function useSelectionDisable({ disabled } = { disabled: false }) {
  useEffect(() => {
    if (disabled) return
    const element = document.body
    const properties = [
      'user-select',
      '-webkit-user-select',
      '-ms-user-select',
      '-moz-user-select',
    ]
    properties.forEach((property) => element.style.setProperty(property, 'none'))
    return () => {
      properties.forEach((property) => element.style.setProperty(property, 'auto'))
    }
  }, [disabled])
}
