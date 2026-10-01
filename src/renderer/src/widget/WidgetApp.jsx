import { Suspense, lazy } from 'react'
import useConfig from '../hooks/useConfig'
import WidgetFrame from './WidgetFrame'
import { glassActive } from '../../../shared/config'

// Only the widget of this window's module is loaded.
const WIDGETS = {
  clock: lazy(() => import('../../../modules/clock/renderer/ClockWidget')),
  pomodoro: lazy(() => import('../../../modules/pomodoro/renderer/PomodoroWidget')),
  habits: lazy(() => import('../../../modules/habits/renderer/HabitsWidget'))
}

export default function WidgetApp({ moduleId }) {
  const config = useConfig()
  const Widget = WIDGETS[moduleId]
  if (!config || !Widget) return null
  const mod = config.modules[moduleId]
  return (
    <WidgetFrame glass={glassActive(config)}>
      <Suspense fallback={null}>
        <Widget size={mod.widget.size} settings={mod.settings} config={config} />
      </Suspense>
    </WidgetFrame>
  )
}
