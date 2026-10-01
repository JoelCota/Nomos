import { useEffect, useState } from 'react'
import { startSync, useStore } from './store'
import { TabBar, isIOS, isStandalone } from './ui'
import { Install, Pair, codeFromHash } from './screens/Pair'
import Today from './screens/Today'
import Tasks from './screens/Tasks'
import Settings from './screens/Settings'

const TABS = [
  { id: 'today', label: 'Hoy' },
  { id: 'tasks', label: 'Tareas' },
  { id: 'settings', label: 'Ajustes' }
]

export default function App() {
  const st = useStore()
  const [tab, setTab] = useState('today')
  // On an iPhone in Safari (not installed yet), show how to install first.
  const [skipInstall, setSkipInstall] = useState(false)

  useEffect(() => {
    if (st.token) startSync()
  }, [st.token])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  if (!st.token) {
    if (isIOS() && !isStandalone() && !skipInstall) return <Install onSkip={() => setSkipInstall(true)} />
    return <Pair revoked={st.revoked} key={codeFromHash()} />
  }

  return (
    <div className="mx-auto max-w-[560px] pb-[96px]">
      {tab === 'today' && <Today />}
      {tab === 'tasks' && <Tasks />}
      {tab === 'settings' && <Settings />}
      <TabBar tabs={TABS} value={tab} onChange={setTab} />
    </div>
  )
}
