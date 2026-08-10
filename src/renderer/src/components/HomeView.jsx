import FlipClock from './FlipClock'
import FocusStatusCard from './FocusStatusCard'

export default function HomeView({ timer, settings, tasks, currentTaskId, contentRef, revealed, onReveal }) {
  const clockEnabled = settings.flipClock ?? true
  const task = currentTaskId ? tasks.find((t) => t.id === currentTaskId) : null

  if (!clockEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <FocusStatusCard timer={timer} taskTitle={task?.title} cycleLength={settings.longBreakInterval ?? 4} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div ref={contentRef} data-testid="home-content" className="flex flex-col items-center gap-5">
        <FlipClock format={settings.clockFormat} height={72} draggable={!revealed} />
        {!revealed && (
          <button
            data-testid="reveal-handle"
            onClick={onReveal}
            title="Reveal controls"
            className="-mt-4 flex h-6 items-center gap-1 rounded-full px-3 text-neutral-400 opacity-70 transition-opacity hover:opacity-100 dark:text-neutral-500"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
          </button>
        )}
        <FocusStatusCard timer={timer} taskTitle={task?.title} cycleLength={settings.longBreakInterval ?? 4} />
      </div>
    </div>
  )
}
