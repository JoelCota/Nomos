import { useCallback, useEffect, useRef, useState } from 'react'
import useTimer from './hooks/useTimer'
import { playChime } from './lib/sound'
import { DEFAULT_SETTINGS } from './lib/defaults'
import TopBar from './components/TopBar'
import HomeView from './components/HomeView'
import TimerPanel from './components/Timer'
import TasksView from './components/Tasks'
import StatsView from './components/Stats'
import SettingsView from './components/Settings'

const COLLAPSE_AFTER_MS = 320
const COLLAPSE_PAD = 40

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [tasks, setTasks] = useState([])
  const [history, setHistory] = useState([])
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const [tab, setTab] = useState('home')
  const [revealed, setRevealed] = useState(false)
  const [alertMsg, setAlertMsg] = useState(null)
  const alertTimer = useRef(null)

  const showAlert = useCallback((msg) => {
    clearTimeout(alertTimer.current)
    setAlertMsg(msg)
    alertTimer.current = setTimeout(() => setAlertMsg(null), 4500)
  }, [])

  const homeRef = useRef(null)
  const roRef = useRef(null)
  const didInitCollapse = useRef(false)
  const tabRef = useRef(tab)
  tabRef.current = tab
  const revealedRef = useRef(revealed)
  revealedRef.current = revealed

  const doCollapse = () => {
    const h = (homeRef.current?.offsetHeight ?? 72) + COLLAPSE_PAD
    window.api.win.collapse(h)
  }

  const lastHideRef = useRef(0)

  const revealChrome = () => {
    if (tabRef.current !== 'home' || revealedRef.current) return
    setRevealed(true)
    window.api.win.restoreSize()
  }

  const revealFromFocus = () => {
    if (Date.now() - lastHideRef.current < 2500) return
    revealChrome()
  }

  const collapse = () => {
    if (tabRef.current !== 'home' || !revealedRef.current) return
    lastHideRef.current = Date.now()
    setRevealed(false)
    setTimeout(() => {
      if (!revealedRef.current) doCollapse()
    }, COLLAPSE_AFTER_MS)
    window.api.win.blur()
  }

  const hideChrome = () => {
    if (!revealedRef.current) return
    lastHideRef.current = Date.now()
    setRevealed(false)
    setTimeout(() => {
      if (!revealedRef.current) doCollapse()
    }, COLLAPSE_AFTER_MS)
  }

  const handleRootClick = (e) => {
    if (e.isTrusted) {
      window.__debugTrustedClick = (window.__debugTrustedClick || 0) + 1
    }
    if (e.target.closest('button, select, input, a, option')) return
    if (e.target.closest('[data-testid="clock-area"]')) {
      if (revealedRef.current) hideChrome()
    }
  }

  const changeTab = (id) => {
    if (id !== 'home' && !revealedRef.current) {
      setRevealed(true)
      window.api.win.restoreSize()
    }
    setTab(id)
  }

  useEffect(() => {
    const onBlur = () => {
      if (tabRef.current === 'home' && revealedRef.current) hideChrome()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const homeNodeRef = useCallback((node) => {
    homeRef.current = node
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    if (node) {
      if (!didInitCollapse.current) {
        didInitCollapse.current = true
        if (!revealedRef.current && tabRef.current === 'home') doCollapse()
      }
      roRef.current = new ResizeObserver(() => {
        if (!revealedRef.current && tabRef.current === 'home') doCollapse()
      })
      roRef.current.observe(node)
    }
  }, [])

  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const load = async () => {
      setSettings(await window.api.settings.get())
      setTasks(await window.api.tasks.list())
      setHistory(await window.api.history.list())
    }
    load()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
    document.documentElement.style.setProperty('--accent', settings.accent ?? '#f97316')
  }, [settings.theme, settings.accent])

  const updateSettings = useCallback(async (patch) => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
  }, [])

  const notify = (title, body) => {
    if (settingsRef.current.notificationsEnabled) {
      window.api.notify(title, body)
    }
    if (settingsRef.current.soundEnabled) playChime()
  }

  const onWorkComplete = useCallback(async ({ taskId, durationSec }) => {
    const task = tasksRef.current.find((t) => t.id === taskId)
    const completedAt = new Date().toISOString()
    if (task) {
      await window.api.tasks.update(task.id, { pomodoros: task.pomodoros + 1 })
    }
    await window.api.history.add({
      id: crypto.randomUUID(),
      taskId: taskId ?? null,
      taskTitle: task?.title ?? 'Unassigned',
      durationSec,
      mode: 'work',
      completedAt
    })
    setHistory(await window.api.history.list())
    setTasks(await window.api.tasks.list())
    notify('Focus session complete', task ? `Nice work on "${task.title}" — take a break.` : 'Nice work — take a break.')
    showAlert('Focus complete — break time!')
  }, [])

  const onBreakComplete = useCallback(async ({ phase }) => {
    notify(phase === 'long' ? 'Long break over' : 'Break over', 'Start the next cycle.')
    showAlert('Break over — start the next cycle.')
  }, [])

  const timer = useTimer({
    settings,
    currentTaskId,
    onWorkComplete,
    onBreakComplete
  })

  useEffect(() => {
    window.__timerDebug = timer
    window.__debugTab = tab
    window.__debugRevealed = revealed
    window.__debugSettingsSet = updateSettings
  })

  useEffect(() => {
    const offToggle = window.api.onTimerToggle(() => timer.toggle())
    const offReset = window.api.onTimerReset(() => timer.reset())
    const offHome = window.api.onNavigateHome(() => setTab('home'))
    const offReveal = window.api.onChromeReveal(revealFromFocus)
    return () => {
      offToggle()
      offReset()
      offHome()
      offReveal()
    }
  }, [timer])

  const addTask = async (title) => {
    const task = {
      id: crypto.randomUUID(),
      title,
      done: false,
      pomodoros: 0,
      createdAt: new Date().toISOString()
    }
    const next = await window.api.tasks.add(task)
    setTasks(next)
  }

  const updateTask = async (id, patch) => {
    setTasks(await window.api.tasks.update(id, patch))
  }

  const deleteTask = async (id) => {
    if (currentTaskId === id) setCurrentTaskId(null)
    setTasks(await window.api.tasks.remove(id))
  }

  const noDrag = { WebkitAppRegion: 'no-drag' }

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/95 text-neutral-900 shadow-2xl dark:border-neutral-700/40 dark:bg-neutral-950/95 dark:text-neutral-100"
      style={{ WebkitAppRegion: 'drag' }}
      onClick={handleRootClick}
    >
      {settings.clickThrough && (
        <div
          className="absolute inset-x-2 top-9 z-30 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-center text-[10px] leading-tight text-amber-400"
          style={noDrag}
        >
          Click-through enabled — use the tray icon or Alt+Shift+T to regain control
        </div>
      )}

      {alertMsg && (
        <div
          data-testid="phase-alert"
          className="absolute inset-x-3 top-10 z-40 rounded-xl border border-[var(--accent)]/50 bg-[#1d1d22] px-3 py-2 text-center text-xs font-semibold text-white shadow-lg"
          style={{ WebkitAppRegion: 'no-drag', animation: 'fadeIn 200ms ease-out' }}
        >
          {alertMsg}
        </div>
      )}

      <TopBar tab={tab} onTabChange={changeTab} visible={revealed} onCollapse={collapse} />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
        {tab === 'home' ? (
          <div className="min-h-0 flex-1">
            <HomeView
              timer={timer}
              settings={settings}
              tasks={tasks}
              currentTaskId={currentTaskId}
              contentRef={homeNodeRef}
              revealed={revealed}
              onReveal={revealChrome}
            />
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50/90 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/80"
            style={noDrag}
          >
            {tab === 'timer' && (
              <TimerPanel
                timer={timer}
                settings={settings}
                tasks={tasks}
                currentTaskId={currentTaskId}
                onSelectTask={setCurrentTaskId}
                onSettings={updateSettings}
              />
            )}
            {tab === 'tasks' && (
              <TasksView
                tasks={tasks}
                currentTaskId={currentTaskId}
                onSelectTask={setCurrentTaskId}
                onAdd={addTask}
                onUpdate={updateTask}
                onDelete={deleteTask}
              />
            )}
            {tab === 'stats' && (
              <StatsView history={history} onClear={async () => setHistory(await window.api.history.clear())} />
            )}
            {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}
          </div>
        )}
      </div>
    </div>
  )
}
