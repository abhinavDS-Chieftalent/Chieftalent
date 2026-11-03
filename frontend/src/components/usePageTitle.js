import { useEffect } from 'react'

const BASE = 'ChiefTalent · DotStark'

/**
 * Set the browser tab title per page (and restore a sensible default on
 * unmount). Pass null to keep just the base title.
 */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}
