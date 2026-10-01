import { invoke } from '../lib/ipc'

// The card every widget lives in. The whole card is draggable; interactive
// children must use the `no-drag` class. Right-click opens the widget menu
// (size, layer, corner, hide...). On Windows, right-clicks on the draggable area
// are handled by the main process ('system-context-menu').
// In glass mode the window itself is the card (Windows draws the blur and the
// rounded corners), so there is no margin and the card is more transparent.
export default function WidgetFrame({ children, glass = false }) {
  return (
    <div className={`h-screen w-screen ${glass ? '' : 'p-3'}`}>
      <div
        className={`drag relative h-full w-full overflow-hidden text-fg ${glass ? 'glass-card rounded-[8px]' : 'widget-card rounded-[22px]'}`}
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
