import { invoke } from '../lib/ipc'

// The card every widget lives in. The whole card is draggable; interactive
// children must use the `no-drag` class. Right-click opens the widget menu
// (size, layer, corner, hide...). On Windows, right-clicks on the draggable area
// are handled by the main process ('system-context-menu').
export default function WidgetFrame({ children }) {
  return (
    <div className="h-screen w-screen p-3">
      <div
        className="widget-card drag relative h-full w-full overflow-hidden rounded-[22px] text-fg"
        onContextMenu={(e) => {
          e.preventDefault()
          invoke('widget:context-menu')
        }}
      >
        {children}
      </div>
    </div>
  )
}
