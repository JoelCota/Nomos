import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// One renderer bundle for every window; the query string picks the view. Each
// view is loaded on demand so widgets don't parse the Control Panel (and its charts).
const WidgetApp = lazy(() => import('./widget/WidgetApp'))
const PanelApp = lazy(() => import('./panel/PanelApp'))
const ToastApp = lazy(() => import('./toast/ToastApp'))

const params = new URLSearchParams(window.location.search)
const view = ['widget', 'toast', 'host'].includes(params.get('view')) ? params.get('view') : 'panel'
document.documentElement.classList.add(`${view}-view`)

if (view === 'host') {
  // Hidden window that hosts the widgets' shared process; it only plays sounds.
  import('./host/host').then((m) => m.default())
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Suspense fallback={null}>
        {view === 'widget' ? (
          <WidgetApp moduleId={params.get('module')} />
        ) : view === 'toast' ? (
          <ToastApp />
        ) : (
          <PanelApp initialPage={params.get('page') ?? 'modules'} />
        )}
      </Suspense>
    </React.StrictMode>
  )
}
