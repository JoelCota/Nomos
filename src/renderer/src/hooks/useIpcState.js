import { useEffect, useState } from 'react'
import { invoke, on } from '../lib/ipc'

// State owned by the main process: fetched once, then updated by broadcasts.
export default function useIpcState(getChannel, eventChannel, initial = null) {
  const [state, setState] = useState(initial)
  useEffect(() => {
    let alive = true
    invoke(getChannel).then((v) => alive && setState(v))
    const off = on(eventChannel, setState)
    return () => {
      alive = false
      off()
    }
  }, [getChannel, eventChannel])
  return state
}
