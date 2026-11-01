import type { CSSProperties } from 'react'
import { GLYPHS, SIZE, type Enemy, type Hero, type PieceType } from '../game/chess'

export interface MoveMark {
  sq: number
  danger: boolean
  capture: boolean
}

interface Props {
  hero: Hero
  heroDead: boolean
  enemies: Enemy[]
  moves: MoveMark[]
  showDanger: boolean
  lastMove: { from: number; to: number } | null
  spawned: Set<number>
  poof: { sq: number; type: PieceType; key: number } | null
  onMove: (sq: number) => void
  disabled: boolean
}

function at(sq: number): CSSProperties {
  return {
    width: `${100 / SIZE}%`,
    height: `${100 / SIZE}%`,
    transform: `translate(${(sq % SIZE) * 100}%, ${Math.floor(sq / SIZE) * 100}%)`,
  }
}

export function Board({ hero, heroDead, enemies, moves, showDanger, lastMove, spawned, poof, onMove, disabled }: Props) {
  const markBySq = new Map(moves.map((m) => [m.sq, m]))

  return (
    <div className="board" style={{ '--n': SIZE } as CSSProperties} role="grid" aria-label="Chess board">
      {Array.from({ length: SIZE * SIZE }, (_, sq) => {
        const dark = ((sq % SIZE) + Math.floor(sq / SIZE)) % 2 === 1
        const mark = markBySq.get(sq)
        const cls = [
          'sq',
          dark ? 'dark' : 'light',
          lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : '',
          mark ? (mark.capture ? 'move capture' : 'move') : '',
          mark && showDanger ? (mark.danger ? 'danger' : 'safe') : '',
        ].join(' ')
        return (
          <button
            key={sq}
            className={cls}
            onClick={() => mark && !disabled && onMove(sq)}
            disabled={disabled || !mark}
            aria-label={mark ? `Move to square ${sq}` : undefined}
          />
        )
      })}

      <div className="layer">
        {enemies.map((e) => (
          <div key={e.id} className={`piece black ${spawned.has(e.id) ? 'spawn' : ''}`} style={at(e.sq)}>
            <span key={e.type}>{GLYPHS[e.type]}</span>
          </div>
        ))}

        {poof && (
          <div key={poof.key} className="piece black poof" style={at(poof.sq)}>
            <span>{GLYPHS[poof.type]}</span>
          </div>
        )}

        <div className={`piece hero ${heroDead ? 'dead' : ''}`} style={at(hero.sq)}>
          <span>{GLYPHS[hero.type]}</span>
        </div>
      </div>
    </div>
  )
}
