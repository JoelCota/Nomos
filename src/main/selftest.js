// Automated self-test. Run with POMODORO_TEST=1 (see main/index.js): it uses an
// isolated userData folder seeded with v1 data, so real settings are untouched.
// Results go to <temp>/pomodoro-widget-selftest/debug.log ("[test] PASS|FAIL").
import { getData, hasStoreKey } from './store.js'
import { WIDGET_PAD, widgetWindowSize } from '../shared/config.js'

export async function runSelfTest({ getConfig, updateModule, updateGeneral, toggleAllWidgets, widgets, toasts, services, showPanel, getPanel, log }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const results = []
  const check = (name, cond, detail = '') => {
    results.push(!!cond)
    log(`[test] ${cond ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
  }
  const js = (win, code) => (win ? win.webContents.executeJavaScript(code) : Promise.resolve(null))

  await sleep(3000)

  // --- migration from v1 ---
  const cfg = getConfig()
  check('migración: duración del foco', cfg.modules.pomodoro.settings.durations.work === 30)
  check('migración: tema', cfg.general.theme === 'dark')
  check('migración: tareas', getData('pomodoro', 'tasks', []).some((t) => t.id === 'seed-task'))
  check('migración: respaldo v1 y claves viejas borradas', hasStoreKey('_v1Backup') && !hasStoreKey('settings'))

  // --- widgets ---
  const clock = widgets.get('clock')
  const pomo = widgets.get('pomodoro')
  check('widgets visibles', clock?.isVisible() && pomo?.isVisible())
  const hwin = widgets.get('habits')
  // Compare the visible cards (windows have a transparent margin of WIDGET_PAD).
  const card = (w) => {
    const r = w.getBounds()
    return { x: r.x + WIDGET_PAD, y: r.y + WIDGET_PAD, w: r.width - 2 * WIDGET_PAD, h: r.height - 2 * WIDGET_PAD }
  }
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  check('el widget nuevo no tapa a los migrados', hwin && !overlap(card(hwin), card(pomo)) && !overlap(card(hwin), card(clock)))
  check('widget reloj renderiza', await js(clock, `!!document.querySelector('[data-testid="clock-widget"]')`))
  check('widget pomodoro renderiza', await js(pomo, `!!document.querySelector('[data-testid="pomodoro-widget"]')`))
  // Electron can't change window opacity on Linux (getOpacity() is always 1).
  const opacity = process.platform === 'linux' ? cfg.modules.pomodoro.widget.opacity : pomo.getOpacity()
  check('opacidad migrada', Math.abs(opacity - 0.9) < 0.02, opacity)

  for (const size of ['small', 'large', 'medium']) {
    updateModule('pomodoro', { widget: { size } })
    await sleep(500)
    const [w, h] = widgetWindowSize(size)
    const b = pomo.getBounds()
    check(`tamaño ${size}`, Math.abs(b.width - w) < 2 && Math.abs(b.height - h) < 2, `${b.width}x${b.height}`)
  }

  updateModule('clock', { widget: { layer: 'top' } })
  await sleep(200)
  check('capa: siempre encima', clock.isAlwaysOnTop())
  updateModule('clock', { widget: { layer: 'bottom' } })
  await sleep(200)
  check('capa: al fondo (normal por ahora)', !clock.isAlwaysOnTop())

  toggleAllWidgets()
  await sleep(500)
  check('ocultar todos', !clock.isVisible() && !pomo.isVisible())
  toggleAllWidgets()
  await sleep(800)
  check('mostrar todos', clock.isVisible() && pomo.isVisible())

  updateModule('clock', { enabled: false })
  await sleep(500)
  check('desactivar módulo cierra su widget', widgets.get('clock') === null && clock.isDestroyed())
  updateModule('clock', { enabled: true })
  await sleep(2500)
  check('reactivar módulo', !!widgets.get('clock')?.isVisible())

  // --- Pomodoro timer (main process) ---
  const svc = services.get('pomodoro')
  const snap = () => svc.debug.snapshot()
  svc.debug.selectTask('seed-task')
  updateModule('pomodoro', {
    settings: {
      durations: { work: 1, short: 1, long: 1 },
      longBreakInterval: 2,
      autoStartNext: true,
      notificationsEnabled: false,
      soundEnabled: false
    }
  })
  await sleep(200)
  check('duración nueva en reposo', snap().secondsLeft === 60, snap().secondsLeft)

  svc.debug.start()
  await sleep(1300)
  check('cuenta regresiva', snap().secondsLeft === 59 && snap().running, snap().secondsLeft)
  svc.debug.pause()
  const paused = snap().secondsLeft
  await sleep(1200)
  check('pausa', snap().secondsLeft === paused && !snap().running)

  // Hidden widget: the timer keeps running.
  updateModule('pomodoro', { widget: { visible: false } })
  svc.debug.start()
  svc.debug.setRemaining(1)
  await sleep(1700)
  const s1 = snap()
  check('con widget oculto el foco termina y arranca el descanso', s1.phase === 'short' && s1.cycleCount === 1 && s1.running, `${s1.phase} ${s1.cycleCount} ${s1.running}`)
  check('tarea +1 pomodoro', getData('pomodoro', 'tasks', []).find((t) => t.id === 'seed-task')?.pomodoros === 3)
  check('historial registrado', getData('pomodoro', 'history', []).length === 1)
  const phaseText = await js(widgets.get('pomodoro'), `document.querySelector('[data-testid="pomodoro-phase"]')?.textContent ?? ''`)
  check('el widget oculto recibe el estado', /descanso/i.test(phaseText), phaseText)
  updateModule('pomodoro', { widget: { visible: true } })

  svc.debug.setRemaining(1)
  await sleep(1700)
  check('descanso -> foco en espera', snap().phase === 'work' && !snap().running)
  svc.debug.start()
  svc.debug.setRemaining(1)
  await sleep(1700)
  check('2º foco -> descanso largo', snap().phase === 'long' && snap().cycleCount === 2)

  updateModule('pomodoro', { enabled: false })
  await sleep(300)
  check('desactivar Pomodoro detiene el temporizador', !snap().running && snap().phase === 'work')
  updateModule('pomodoro', { enabled: true })
  await sleep(2500)

  // --- Habits ---
  const habitsWin = widgets.get('habits')
  check('módulo Hábitos activo por defecto con su widget', getConfig().modules.habits.enabled && !!habitsWin?.isVisible())
  const hb = services.get('habits').debug
  hb.create({ name: 'Leer', icon: '📖', type: 'check', frequency: { kind: 'daily' } })
  hb.create({ name: 'Agua', icon: '💧', type: 'count', target: 3, frequency: { kind: 'daily' } })
  hb.create({ name: 'Estudiar', icon: '✍️', type: 'duration', target: 30, frequency: { kind: 'weekly', times: 3 } })
  const [leer, agua, estudiar] = hb.payload().habits
  const day = hb.today()
  hb.setValue(leer.id, day, 1)
  hb.increment(agua.id, 1)
  hb.increment(agua.id, 2)
  const vals = hb.payload().log[day]
  check('hábitos: marcar y sumar', vals[leer.id] === 1 && vals[agua.id] === 3, JSON.stringify(vals))
  let blocked = false
  try {
    hb.setValue(leer.id, '2020-01-01', 1)
  } catch {
    blocked = true
  }
  check('hábitos: solo hoy y ayer se pueden cambiar', blocked)
  let invalid = false
  try {
    hb.create({ name: '   ' })
  } catch {
    invalid = true
  }
  check('hábitos: nombre obligatorio', invalid)
  await sleep(600)
  const rows = await js(habitsWin, `document.querySelectorAll('[data-testid="habit-row"]').length`)
  check('widget de hábitos muestra las filas', rows === 3, rows)
  await js(habitsWin, `[...document.querySelectorAll('[data-testid="habit-row"] button')].at(-1)?.click(); true`)
  await sleep(500)
  const rowsText = await js(habitsWin, `document.querySelector('[data-testid="habits-widget"]').textContent`)
  check('clic en el widget suma al hábito', /\d+\/30 min|0\/1 sem/.test(rowsText) || (hb.payload().log[day]?.[estudiar.id] ?? 0) > 0, rowsText.slice(0, 80))

  // Pomodoro -> duration habit: a finished focus adds its minutes.
  const before = hb.payload().log[day]?.[estudiar.id] ?? 0
  svc.debug.selectTask(`habit:${estudiar.id}`)
  check('pomodoro muestra el hábito como objetivo', snap().taskTitle?.includes('Estudiar'), snap().taskTitle)
  svc.debug.reset()
  svc.debug.start()
  svc.debug.setRemaining(1)
  await sleep(1700)
  const after = hb.payload().log[day]?.[estudiar.id] ?? 0
  check('foco terminado suma minutos al hábito', after === before + 1, `${before} -> ${after}`)
  svc.debug.pause()

  updateModule('habits', { enabled: false })
  await sleep(400)
  check('sin módulo Hábitos el pomodoro ignora el hábito', snap().taskTitle === null && widgets.get('habits') === null)
  updateModule('habits', { enabled: true })
  svc.debug.selectTask(null)
  await sleep(2500)

  // --- Reminders (notification cards) ---
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const now0 = new Date()
  updateModule('habits', { settings: { summaryEnabled: false } })
  toasts.closeAll()
  await sleep(400)
  hb.create({ name: 'Estirar', icon: '🤸', type: 'check', frequency: { kind: 'daily' }, reminders: { times: [hhmm(now0)] } })
  const estirar = hb.payload().habits.find((h) => h.name === 'Estirar')
  hb.tickReminders(now0)
  await sleep(1500)
  check('aviso a su hora', toasts.count() === 1, toasts.count())
  const toastWin = toasts.windows()[0]
  const cardText = await js(toastWin, `document.querySelector('[data-testid="toast"]')?.textContent ?? ''`)
  check('la tarjeta muestra el hábito y sus botones', cardText.includes('Estirar') && cardText.includes('Hecho') && cardText.includes('Posponer'), cardText)
  hb.tickReminders(now0)
  await sleep(300)
  check('el aviso no se repite', toasts.count() === 1)
  await js(toastWin, `document.querySelector('[data-testid="toast-action-snooze"]').click(); true`)
  await sleep(700)
  check('posponer cierra la tarjeta', toasts.count() === 0 && hb.snoozes()[estirar.id] > Date.now())
  hb.tickReminders(new Date(Date.now() + 16 * 60 * 1000))
  await sleep(1500)
  check('vuelve después de posponer', toasts.count() === 1)
  await js(toasts.windows()[0], `document.querySelector('[data-testid="toast-action-primary"]').click(); true`)
  await sleep(700)
  check('«Hecho» en la tarjeta marca el hábito', hb.payload().log[hb.today()]?.[estirar.id] === 1 && toasts.count() === 0)

  hb.create({ name: 'Postura', icon: '🪑', type: 'check', frequency: { kind: 'daily' }, reminders: { times: [hhmm(now0)] } })
  svc.debug.switchPhase('work')
  svc.debug.start()
  svc.debug.setRemaining(600)
  hb.tickReminders(now0)
  await sleep(800)
  check('durante un foco el aviso espera', toasts.count() === 0 && hb.held() === 1, `${toasts.count()} ${hb.held()}`)
  svc.debug.switchPhase('short')
  hb.tickReminders(now0)
  await sleep(1500)
  check('en un descanso los avisos no esperan', toasts.count() === 1 && hb.held() === 0)
  toasts.closeAll()
  await sleep(400)
  hb.create({ name: 'Respirar', icon: '🌬️', type: 'check', frequency: { kind: 'daily' }, reminders: { times: [hhmm(now0)] } })
  svc.debug.switchPhase('work')
  svc.debug.start()
  svc.debug.setRemaining(600)
  hb.tickReminders(now0)
  await sleep(500)
  svc.debug.pause()
  hb.tickReminders(now0)
  await sleep(1500)
  check('al parar el foco aparece', toasts.count() === 1 && hb.held() === 0)
  await sleep(Number(process.env.POMODORO_TOAST_MS || 10000) + 1000)
  check('la tarjeta se cierra sola', toasts.count() === 0)
  svc.debug.reset()

  updateModule('habits', { settings: { summaryEnabled: true, summaryTime: hhmm(now0) } })
  hb.tickReminders(now0)
  await sleep(1500)
  const summaryText = await js(toasts.windows()[0], `document.querySelector('[data-testid="toast"]')?.textContent ?? ''`)
  check('resumen del día con lo pendiente', toasts.count() === 1 && summaryText.includes('Resumen del día') && summaryText.includes('Postura'), summaryText)
  toasts.closeAll()
  await sleep(400)

  for (let i = 1; i <= 5; i++) toasts.show({ appName: 'Prueba', icon: '🔔', title: `Aviso ${i}` })
  await sleep(1500)
  const ys = toasts.windows().map((w) => w.getBounds().y)
  check('apilado: 4 visibles y 1 en cola', toasts.count() === 4 && toasts.queued() === 1 && ys.every((y, i) => i === 0 || y > ys[i - 1]), ys.join(','))
  toasts.closeAll()
  await sleep(500)

  // --- Control Panel ---
  showPanel('modules')
  await sleep(3000)
  const panel = getPanel()
  check('panel abre', !!(await js(panel, `!!document.querySelector('[data-testid="panel"]')`)))
  await js(panel, `document.querySelector('[data-testid="module-toggle-clock"]')?.click(); true`)
  await sleep(700)
  check('interruptor del panel desactiva el reloj', getConfig().modules.clock.enabled === false)
  await js(panel, `document.querySelector('[data-testid="module-toggle-clock"]')?.click(); true`)
  await sleep(2500)
  check('interruptor del panel reactiva el reloj', getConfig().modules.clock.enabled === true && !!widgets.get('clock'))

  updateGeneral({ theme: 'light' })
  await sleep(500)
  const dark = await js(widgets.get('clock'), `document.documentElement.classList.contains('dark')`)
  check('tema claro llega a los widgets', dark === false)

  const pass = results.every(Boolean)
  log(`[test] ${pass ? 'PASS' : 'FAIL'} ${results.filter(Boolean).length}/${results.length}`)
}
