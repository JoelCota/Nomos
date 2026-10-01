import { useState } from 'react'
import { api } from '../store'
import { Button, Group } from '../ui'

function Copy({ value, label, testId }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const t = document.createElement('textarea')
      t.value = value
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg-3">{label}</p>
        <p data-testid={testId} className="break-all font-mono text-[14px]">
          {value}
        </p>
      </div>
      <button type="button" onClick={copy} className="press shrink-0 text-[15px] font-medium text-accent">
        {done ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

const RECIPES = [
  {
    name: 'Nueva tarea',
    say: '«Oye Siri, nueva tarea»',
    path: '/api/quick/task',
    method: 'POST',
    ask: '¿Qué tarea?',
    field: 'title'
  },
  {
    name: 'Marcar hábito',
    say: '«Oye Siri, marcar hábito»',
    path: '/api/quick/habit',
    method: 'POST',
    ask: '¿Qué hábito?',
    field: 'habit',
    extra: 'Para contadores suma 1 y para minutos suma 5. Si quieres otra cantidad, añade otro campo «amount» de tipo Número.'
  },
  {
    name: 'Cómo voy',
    say: '«Oye Siri, cómo voy»',
    path: '/api/quick/today',
    method: 'GET'
  }
]

function Recipe({ r, origin }) {
  return (
    <Group title={r.name} footer={`Dile a Siri ${r.say}. Siri dice el nombre del atajo, así que puedes ponerle el que quieras.`}>
      <ol className="list-decimal space-y-2.5 py-3 pl-9 pr-4 text-[15px] leading-snug">
        <li>
          En la app <strong>Atajos</strong>, toca <strong>+</strong> y ponle de nombre <strong>{r.name}</strong>.
        </li>
        {r.ask && (
          <li>
            Agrega la acción <strong>Solicitar entrada</strong> (tipo Texto) con la pregunta «{r.ask}».
          </li>
        )}
        <li>
          Agrega <strong>Obtener contenido de URL</strong> con la URL <span className="break-all font-mono text-[13px]">{origin + r.path}</span>.
          {r.method === 'POST' ? (
            <>
              {' '}
              Toca la flecha para ver más: <strong>Método</strong> POST; en <strong>Encabezados</strong>, agrega <span className="font-mono text-[13px]">Authorization</span> con el valor{' '}
              <span className="font-mono text-[13px]">Bearer</span> + espacio + tu llave; en <strong>Cuerpo de la solicitud</strong> elige JSON y agrega un campo de texto{' '}
              <span className="font-mono text-[13px]">{r.field}</span> con el valor <strong>Entrada proporcionada</strong>.
            </>
          ) : (
            <>
              {' '}
              Toca la flecha para ver más: en <strong>Encabezados</strong>, agrega <span className="font-mono text-[13px]">Authorization</span> con el valor{' '}
              <span className="font-mono text-[13px]">Bearer</span> + espacio + tu llave.
            </>
          )}
        </li>
        <li>
          Agrega <strong>Obtener valor del diccionario</strong> con la clave <span className="font-mono text-[13px]">message</span>.
        </li>
        <li>
          Agrega <strong>Mostrar resultado</strong>. Siri te lo dirá en voz alta.
        </li>
      </ol>
      {r.extra && <p className="px-4 pb-3 text-[13px] text-fg-3">{r.extra}</p>}
    </Group>
  )
}

export default function Siri({ onBack }) {
  const [key, setKey] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const origin = location.origin

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setKey((await api('POST', '/api/device/shortcut-key')).token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="pt-safe px-5 pb-2">
        <div className="flex min-h-[28px] items-center">
          <button type="button" onClick={onBack} className="press -ml-1 flex items-center text-[17px] text-accent">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ajustes
          </button>
        </div>
        <h1 className="text-[34px] font-bold leading-tight tracking-tight">Siri y Atajos</h1>
        <p className="text-[15px] text-fg-3">Agrega tareas, marca hábitos o pregunta cómo vas, con la voz.</p>
      </header>

      <Group
        title="1. Tu llave para Atajos"
        footer="Es una llave aparte, solo para tus atajos. Aparece en Nomos en tu PC (Panel → Sincronización) y puedes desvincularla ahí. Guárdala: solo se muestra una vez."
      >
        {key ? (
          <>
            <Copy label="Llave" value={key} testId="siri-key" />
            <Copy label="Encabezado completo (para pegar como valor)" value={`Bearer ${key}`} />
          </>
        ) : (
          <div className="p-4">
            <Button data-testid="siri-create" onClick={create} disabled={busy} className="w-full">
              {busy ? 'Creando…' : 'Crear llave'}
            </Button>
            {error && <p className="mt-2 text-[14px] text-bad">{error}</p>}
          </div>
        )}
      </Group>

      <p className="mx-8 -mt-3 mb-5 text-[15px] font-semibold text-fg-2">2. Crea tus atajos</p>
      {RECIPES.map((r) => (
        <Recipe key={r.name} r={r} origin={origin} />
      ))}
    </>
  )
}
