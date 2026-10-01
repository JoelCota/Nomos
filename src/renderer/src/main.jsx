import React from 'react'
import ReactDOM from 'react-dom/client'
import WidgetApp from './widget/WidgetApp'
import PanelApp from './panel/PanelApp'
import ToastApp from './toast/ToastApp'
import './index.css'

// One renderer for every window; the query string picks the view.
const params = new URLSearchParams(window.location.search)
const view = ['widget', 'toast'].includes(params.get('view')) ? params.get('view') : 'panel'
document.documentElement.classList.add(`${view}-view`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {view === 'widget' ? (
      <WidgetApp moduleId={params.get('module')} />
    ) : view === 'toast' ? (
      <ToastApp />
    ) : (
      <PanelApp initialPage={params.get('page') ?? 'modules'} />
    )}
  </React.StrictMode>
)
