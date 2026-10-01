import { useEffect, useState } from 'react'
import useConfig from '../hooks/useConfig'
import { on } from '../lib/ipc'
import { MANIFESTS, getManifest } from '../../../modules/manifests'
import ModulesPage from './ModulesPage'
import ModulePage from './ModulePage'
import AppearancePage from './AppearancePage'
import StartupPage from './StartupPage'

function NavItem({ active, onClick, icon, children, status }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
        active ? 'bg-accent text-white' : 'text-fg hover:bg-[var(--track)]'
      }`}
    >
      <span className="w-5 text-center text-[15px]" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {status}
    </button>
  )
}

// Dot next to a module: filled = widget on screen, ring = hidden, none = disabled.
function ModuleStatus({ mod, active }) {
  if (!mod.enabled) return <span className={`text-[11px] ${active ? 'text-white/80' : 'text-fg-3'}`}>Apagado</span>
  return (
    <span
      title={mod.widget.visible ? 'Widget visible' : 'Widget oculto'}
      className={`h-2 w-2 rounded-full ${
        mod.widget.visible ? (active ? 'bg-white' : 'bg-break') : `border ${active ? 'border-white' : 'border-fg-3'}`
      }`}
    />
  )
}

export default function PanelApp({ initialPage }) {
  const config = useConfig()
  const [page, setPage] = useState(initialPage)

  useEffect(() => on('panel:navigate', (p) => setPage(p)), [])

  if (!config) return null

  const moduleId = page.startsWith('module:') ? page.slice(7) : null
  let content
  if (moduleId && getManifest(moduleId)) content = <ModulePage id={moduleId} config={config} />
  else if (page === 'appearance') content = <AppearancePage config={config} />
  else if (page === 'startup') content = <StartupPage config={config} />
  else content = <ModulesPage config={config} onOpen={(id) => setPage(`module:${id}`)} />

  return (
    <div data-testid="panel" className="flex h-screen text-fg">
      <nav aria-label="Secciones" className="flex w-[220px] shrink-0 flex-col gap-5 overflow-y-auto bg-sidebar px-3 py-5">
        <p className="px-2.5 text-[17px] font-semibold tracking-tight">Nomos</p>
        <div>
          <p className="mb-1 px-2.5 text-[12px] font-semibold text-fg-3">Módulos</p>
          <NavItem active={page === 'modules'} onClick={() => setPage('modules')} icon="▦">
            Todos los módulos
          </NavItem>
          {MANIFESTS.map((m) => (
            <NavItem
              key={m.id}
              active={moduleId === m.id}
              onClick={() => setPage(`module:${m.id}`)}
              icon={m.icon}
              status={<ModuleStatus mod={config.modules[m.id]} active={moduleId === m.id} />}
            >
              {m.name}
            </NavItem>
          ))}
        </div>
        <div>
          <p className="mb-1 px-2.5 text-[12px] font-semibold text-fg-3">General</p>
          <NavItem active={page === 'appearance'} onClick={() => setPage('appearance')} icon="◐">
            Apariencia
          </NavItem>
          <NavItem active={page === 'startup'} onClick={() => setPage('startup')} icon="⌘">
            Inicio y atajos
          </NavItem>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-8 py-7">{content}</div>
      </main>
    </div>
  )
}
