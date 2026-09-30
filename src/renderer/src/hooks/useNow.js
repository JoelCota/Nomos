import { useEffect, useState } from 'react'

// Current time, refreshed right after each change of second.
export default function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id
    const schedule = () => {
      id = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 1000 - (Date.now() % 1000) + 5)
    }
    schedule()
    return () => clearTimeout(id)
  }, [])
  return now
}
