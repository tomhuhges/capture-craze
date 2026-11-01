import type { CSSProperties } from 'react'
import { GLYPHS, type Hero, type PieceType } from '../game/chess'

interface Props {
  size: number
  hero: Hero
  pieces: Record<number, PieceType>
  targets: number[]
  hint: number | null
  shake: boolean
  poof: { sq: number; type: PieceType; key: number } | null
  onCapture: (sq: number) => void
  disabled: boolean
}

function at(sq: number, size: number): CSSProperties {
  const x = sq % size
  const y = Math.floor(sq / size)
  return {
    width: `${100 / size}%`,
    height: `${100 / size}%`,
    transform: `translate(${x * 100}%, ${y * 100}%)`,
  }
}

export function Board({ size, hero, pieces, targets, hint, shake, poof, onCapture, disabled }: Props) {
  const squares = Array.from({ length: size * size }, (_, i) => i)
  const targetSet = new Set(targets)

  return (
    <div
      className={`board ${shake ? 'shake' : ''}`}
      style={{ '--n': size } as CSSProperties}
      role="grid"
      aria-label="Chess board"
    >
      {squares.map((sq) => {
        const x = sq % size
        const y = Math.floor(sq / size)
        const dark = (x + y) % 2 === 1
        const isTarget = targetSet.has(sq)
        return (
          <button
            key={sq}
            className={`sq ${dark ? 'dark' : 'light'} ${isTarget ? 'target' : ''} ${hint === sq ? 'hint' : ''}`}
            onClick={() => isTarget && !disabled && onCapture(sq)}
            disabled={disabled || !isTarget}
            aria-label={isTarget ? `Capture ${pieces[sq]} ` : undefined}
          />
        )
      })}

      <div className="layer">
        {Object.entries(pieces).map(([sqStr, type]) => {
          const sq = Number(sqStr)
          return (
            <div key={sq} className={`piece black ${targetSet.has(sq) ? 'attackable' : ''}`} style={at(sq, size)}>
              <span>{GLYPHS[type]}</span>
            </div>
          )
        })}

        {poof && (
          <div key={poof.key} className="piece black poof" style={at(poof.sq, size)}>
            <span>{GLYPHS[poof.type]}</span>
          </div>
        )}

        <div className="piece hero" style={at(hero.sq, size)}>
          <span key={hero.type} className="morph">
            {GLYPHS[hero.type]}
          </span>
        </div>
      </div>
    </div>
  )
}
