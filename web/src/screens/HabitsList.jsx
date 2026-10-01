import { useMemo } from 'react'
import { frequencyText, goalText, remindersText } from '../../../src/modules/habits/logic.js'
import { selectHabits, useStore, write } from '../store'
import { BackHeader, Group, haptic } from '../ui'

// All habits (also the ones not due today): edit, reorder, add.
export default function HabitsList({ onBack, onEdit, onNew }) {
  const st = useStore()
  const habits = useMemo(() => selectHabits(st.docs), [st.docs])

  // Swap two habits and renumber, so every device ends up with the same order.
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= habits.length) return
    haptic()
    const list = [...habits]
    ;[list[i], list[j]] = [list[j], list[i]]
    list.forEach((h, order) => {
      const doc = st.docs[`habits\u0000${h.id}`]
      if (doc && doc.data.order !== order) write('habits', h.id, { ...doc.data, order })
    })
  }

  return (
    <>
      <BackHeader
        back="Hoy"
        onBack={onBack}
        title="Mis hábitos"
        subtitle={`${habits.length} ${habits.length === 1 ? 'hábito' : 'hábitos'}`}
        action={
          <button type="button" onClick={onNew} aria-label="Nuevo hábito" className="press text-[28px] font-light leading-none text-accent">
            +
          </button>
        }
      />
      {habits.length === 0 ? (
        <p className="mx-6 mt-8 text-center text-[16px] text-fg-3">Todavía no tienes hábitos. Toca + para crear el primero.</p>
      ) : (
        <Group footer="Toca un hábito para editarlo. Las flechas cambian el orden en todos tus dispositivos.">
          {habits.map((h, i) => (
            <div key={h.id} data-testid="habit-list-row" className="flex min-h-[60px] items-center gap-2 py-2 pl-4 pr-2">
              <button type="button" onClick={() => onEdit(h.id)} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-8 shrink-0 text-center text-[24px]" aria-hidden>
                  {h.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[17px]">{h.name}</span>
                  <span className="block truncate text-[13px] text-fg-3">{[frequencyText(h), goalText(h), remindersText(h)].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col">
                <button type="button" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => move(i, -1)} className="press px-2 py-0.5 text-accent disabled:opacity-20">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" aria-label={`Bajar ${h.name}`} disabled={i === habits.length - 1} onClick={() => move(i, 1)} className="press px-2 py-0.5 text-accent disabled:opacity-20">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </Group>
      )}
    </>
  )
}
