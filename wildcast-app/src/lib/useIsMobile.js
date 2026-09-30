import { useEffect, useState } from 'react'

// Phone-width layout switch (Anang's ask, 2026-09-30: mobile was "acak-acakan"
// on every page). The app is styled inline, so a CSS media query can't reach
// those styles - components read this instead and swap only the few values
// that break on a narrow screen (row -> column, fixed side-panel widths).
// Desktop layout is untouched: every mobile branch is `isMobile ? … : <old value>`.
export const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}
