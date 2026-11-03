/**
 * Vendored from react-proctoring (MIT) by Ansh Saini
 * https://github.com/ansh-saini/react-proctoring
 *
 * Headless proctoring hook: full-screen enforcement, tab-switch
 * detection, context-menu/copy/selection blocking. Returns status
 * flags only - the UI reaction is up to the host app.
 */
import { useFullScreenDetection } from './useFullScreenDetection'
import { useTabFocusDetection } from './useTabFocusDetection'
import { useCopyDisable, useDisableContextMenu, useSelectionDisable } from './blockers'

export { triggerFullscreen } from './useFullScreenDetection'

export function useProctoring({
  preventTabSwitch = false,
  forceFullScreen = false,
  preventContextMenu = false,
  preventUserSelection = false,
  preventCopy = false,
} = {}) {
  useDisableContextMenu({ disabled: preventContextMenu === false })
  useCopyDisable({ disabled: preventCopy === false })
  useSelectionDisable({ disabled: preventUserSelection === false })

  const { tabFocusStatus } = useTabFocusDetection({
    disabled: preventTabSwitch === false,
  })
  const { fullScreenStatus } = useFullScreenDetection({
    disabled: forceFullScreen === false,
  })

  return {
    fullScreen: { status: fullScreenStatus },
    tabFocus: { status: tabFocusStatus },
  }
}
