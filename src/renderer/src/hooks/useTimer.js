import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../lib/format'

const computeNext = (phase, cycleCount, settings) => {
  const dur = settings.durations
  const N = settings.longBreakInterval ?? 4
  if (phase === 'work') {
    const next = (cycleCount + 1) % N === 0 ? 'long' : 'short'
    return { phase: next, durationSec: dur[next] * 60 }
  }
  return { phase: 'work', durationSec: dur.work * 60 }
}

export default function useTimer({ settings, currentTaskId, onWorkComplete, onBreakComplete }) {
  const [phase, setPhase] = useState('work')
  const [secondsLeft, setSecondsLeft] = useState(settings.durations.work * 60)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [cycleCount, setCycleCount] = useState(0)
  const [stagedNext, setStagedNext] = useState(null)

  const stateRef = useRef({})
  stateRef.current = { phase, secondsLeft, running, started, cycleCount, currentTaskId, settings, onWorkComplete, onBreakComplete }

  const stagedRef = useRef(null)
  stagedRef.current = stagedNext

  const intervalRef = useRef(null)

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function start() {
    if (intervalRef.current) return
    setRunning(true)
    setStarted(true)
    intervalRef.current = setInterval(tick, 1000)
  }

  function tick() {
    const s = stateRef.current
    if (s.secondsLeft > 1) {
      setSecondsLeft(s.secondsLeft - 1)
      return
    }
    clear()
    setSecondsLeft(0)
    setRunning(false)
    const settings = s.settings
    const dur = settings.durations
    const autoStartBreaks = settings.autoStartNext
    if (s.phase === 'work') {
      const newCycle = s.cycleCount + 1
      setCycleCount(newCycle)
      const staged = stagedRef.current
      const next =
        staged?.phase ?? (newCycle % (settings.longBreakInterval ?? 4) === 0 ? 'long' : 'short')
      s.onWorkComplete({ taskId: s.currentTaskId, durationSec: dur.work * 60 })
      setPhase(next)
      setSecondsLeft(dur[next] * 60)
      setStagedNext(computeNext(next, newCycle, settings))
      if (autoStartBreaks) start()
    } else {
      s.onBreakComplete({ phase: s.phase })
      setPhase('work')
      setSecondsLeft(dur.work * 60)
      if (s.phase === 'long') setCycleCount(0)
      setStagedNext(computeNext('work', s.phase === 'long' ? 0 : s.cycleCount, settings))
    }
  }

  const pause = () => {
    clear()
    setRunning(false)
  }

  const toggle = () => {
    if (intervalRef.current) pause()
    else start()
  }

  const reset = () => {
    clear()
    setRunning(false)
    setStarted(false)
    setSecondsLeft(stateRef.current.settings.durations[stateRef.current.phase] * 60)
  }

  const switchPhase = (p) => {
    clear()
    setRunning(false)
    setStarted(false)
    setPhase(p)
    setSecondsLeft(stateRef.current.settings.durations[p] * 60)
    setStagedNext(computeNext(p, stateRef.current.cycleCount, stateRef.current.settings))
  }

  useEffect(() => {
    if (!running) {
      setSecondsLeft(stateRef.current.settings.durations[stateRef.current.phase] * 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.durations.work, settings.durations.short, settings.durations.long])

  useEffect(() => {
    window.api?.syncTimer({
      phase,
      label: formatTime(secondsLeft),
      running
    })
  }, [phase, secondsLeft, running])

  const total = settings.durations[phase] * 60
  const progress = total > 0 ? secondsLeft / total : 0

  return {
    phase,
    secondsLeft,
    running,
    started,
    cycleCount,
    progress,
    total,
    toggle,
    pause,
    start,
    reset,
    switchPhase,
    debugSetSecondsLeft: setSecondsLeft
  }
}
