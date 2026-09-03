import { useEffect, useRef, useState } from 'react'

const DURATION = 300

// Lightweight rotating-word effect (no animation library) - each word slides/fades
// out upward, swaps, then slides/fades in from below.
export default function WordCarousel({ words, interval = 2200, style }) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('visible') // 'visible' | 'out' | 'in-start'
  const timeouts = useRef([])

  useEffect(() => {
    const loop = setInterval(() => {
      setPhase('out')
      timeouts.current.push(setTimeout(() => {
        setIndex(i => (i + 1) % words.length)
        setPhase('in-start')
        timeouts.current.push(setTimeout(() => setPhase('visible'), 20))
      }, DURATION))
    }, interval)
    return () => {
      clearInterval(loop)
      timeouts.current.forEach(clearTimeout)
      timeouts.current = []
    }
  }, [words, interval])

  const transform = phase === 'out' ? 'translateY(-0.4em)' : phase === 'in-start' ? 'translateY(0.4em)' : 'translateY(0)'
  const opacity = phase === 'visible' ? 1 : 0
  const transition = phase === 'in-start' ? 'none' : `transform ${DURATION}ms ease, opacity ${DURATION}ms ease`

  return (
    <span style={{ display: 'inline-block', transform, opacity, transition, ...style }}>
      {words[index]}
    </span>
  )
}
