import { useEffect, useRef, useState } from 'react'

const CARD_BG = '#1a1a1e'
const CARD_TEXT = '#f5f5f4'
const FLIP_MS = 280
const SEAM_MS = 150

function DigitFace({ text, height, fontSize, transform }) {
  return (
    <div
      style={{
        height,
        transform,
        background: CARD_BG
      }}
    >
      <div
        style={{
          fontSize,
          lineHeight: `${height}px`,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
          color: CARD_TEXT
        }}
      >
        {text}
      </div>
    </div>
  )
}

function Half({ text, height, half, align, flip, animation, onEnd }) {
  const isTop = align === 'top'
  const style = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: half,
    overflow: 'hidden',
    ...(isTop ? { top: 0, borderRadius: '9px 9px 0 0' } : { bottom: 0, borderRadius: '0 0 9px 9px' }),
    ...(flip
      ? {
          zIndex: 3,
          transformOrigin: isTop ? '50% 100%' : '50% 0%',
          backfaceVisibility: 'hidden',
          animation
        }
      : {})
  }
  return (
    <div style={style} onAnimationEnd={onEnd}>
      <DigitFace
        text={text}
        height={height}
        fontSize={Math.round(height * 0.58)}
        transform={isTop ? undefined : 'translateY(-50%)'}
      />
    </div>
  )
}

export default function FlipDigit({ value, width = 44, height = 64 }) {
  const [display, setDisplay] = useState(value)
  const [prev, setPrev] = useState(value)
  const [flipping, setFlipping] = useState(false)

  const displayRef = useRef(value)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (value === displayRef.current) return
    setPrev(displayRef.current)
    setDisplay(value)
    displayRef.current = value
    setFlipping(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setFlipping(false), FLIP_MS + SEAM_MS + 120)
    return () => clearTimeout(timeoutRef.current)
  }, [value])

  const half = height / 2

  return (
    <div
      className="relative select-none"
      style={{ width, height, perspective: height * 2.2 }}
    >
      <Half text={display} height={height} half={half} align="top" />
      <Half text={flipping ? prev : display} height={height} half={half} align="bottom" />

      {flipping && (
        <>
          <Half
            text={prev}
            height={height}
            half={half}
            align="top"
            flip
            animation={`flipTop ${FLIP_MS}ms ease-in forwards`}
          />
          <Half
            text={display}
            height={height}
            half={half}
            align="bottom"
            flip
            animation={`flipBottom ${FLIP_MS}ms ease-in ${SEAM_MS}ms both`}
            onEnd={() => setFlipping(false)}
          />
        </>
      )}

      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ top: half - 1, height: 2, background: 'rgba(0,0,0,0.55)', zIndex: 5 }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: 9,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 20px rgba(0,0,0,0.4)',
          zIndex: 6
        }}
      />
    </div>
  )
}
