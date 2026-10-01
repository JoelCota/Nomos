import { useState } from 'react'
import { pair } from '../store'
import { Button, Logo, deviceName, isIOS, isStandalone } from '../ui'

const formatCode = (v) => {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s
}

export const codeFromHash = () => {
  const m = location.hash.match(/pair=([A-Za-z0-9-]+)/)
  return m ? formatCode(m[1]) : ''
}

// Safari on iPhone: the app must be on the home screen for notifications, and
// its storage is separate from Safari's — so install first, link after.
export function Install({ onSkip }) {
  const code = codeFromHash()
  return (
    <main className="pt-safe mx-auto flex min-h-screen max-w-[480px] flex-col px-6 pb-10">
      <div className="mt-10 flex flex-col items-center text-center">
        <img src="/icons/apple-touch-icon.png" alt="" className="h-[84px] w-[84px] rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.18)]" />
        <h1 className="mt-5 text-[28px] font-bold tracking-tight">Instala Nomos</h1>
        <p className="mt-1 text-[16px] text-fg-3">Así tendrás tus hábitos a un toque y te llegarán los recordatorios.</p>
      </div>
      <ol className="mt-8 space-y-4 rounded-[14px] bg-card p-5 text-[16px]">
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-white">1</span>
          <span>
            Toca <strong>Compartir</strong>{' '}
            <svg className="inline -translate-y-0.5 text-accent" width="18" height="18" viewBox="0 0 24 24" aria-label="(el cuadro con la flecha)">
              <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>{' '}
            en la barra de Safari.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-white">2</span>
          <span>
            Elige <strong>«Agregar a pantalla de inicio»</strong> y luego <strong>Agregar</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[14px] font-bold text-white">3</span>
          <span>
            Abre <strong>Nomos</strong> desde tu pantalla de inicio
            {code ? (
              <>
                {' '}
                y escribe este código:
                <span data-testid="install-code" className="tnum mt-2 block font-mono text-[28px] font-semibold tracking-wider">
                  {code}
                </span>
              </>
            ) : (
              ' y escribe el código que te muestra Nomos en tu PC.'
            )}
          </span>
        </li>
      </ol>
      <button type="button" onClick={onSkip} className="press mt-auto pt-8 text-center text-[15px] text-accent">
        Usar en el navegador (sin recordatorios)
      </button>
    </main>
  )
}

export function Pair({ revoked }) {
  const [code, setCode] = useState(codeFromHash())
  const [name, setName] = useState(deviceName())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = code.replace('-', '').length === 8

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await pair(code, name)
      history.replaceState(null, '', '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="pt-safe mx-auto flex min-h-screen max-w-[480px] flex-col px-6 pb-10">
      <div className="mt-12 flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-4 text-[28px] font-bold tracking-tight">Vincula tu {deviceName() === 'Navegador' ? 'dispositivo' : deviceName()}</h1>
        <p className="mt-1 text-[16px] text-fg-3">
          En Nomos en tu PC: <span className="text-fg-2">Panel → Sincronización → Vincular un celular</span>. Escribe aquí el código que aparece.
        </p>
      </div>
      {revoked && (
        <p role="status" className="mt-6 rounded-[12px] bg-fill px-4 py-3 text-[15px] text-fg-2">
          Este celular se desvinculó. Pide un código nuevo en tu PC para volver a conectarlo.
        </p>
      )}
      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] uppercase tracking-wide text-fg-3">Código</span>
          <input
            data-testid="pair-code"
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            className="tnum w-full rounded-[12px] bg-card px-4 py-3.5 text-center font-mono text-[28px] font-semibold tracking-[0.15em] outline-none placeholder:text-fg-3/50 focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-[13px] uppercase tracking-wide text-fg-3">Nombre de este dispositivo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            className="w-full rounded-[12px] bg-card px-4 py-3 text-[17px] outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {error && (
          <p role="alert" data-testid="pair-error" className="px-1 text-[15px] text-bad">
            {error}
          </p>
        )}
        <Button type="submit" data-testid="pair-submit" disabled={!ready || busy} className="mt-2 w-full">
          {busy ? 'Vinculando…' : 'Vincular'}
        </Button>
      </form>
      {isIOS() && !isStandalone() && (
        <p className="mt-6 text-center text-[13px] text-fg-3">Para recibir recordatorios, primero agrega Nomos a tu pantalla de inicio.</p>
      )}
    </main>
  )
}
