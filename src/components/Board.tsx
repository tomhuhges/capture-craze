import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { GLYPHS, SIZE, type Enemy, type Hero, type PieceType } from '../game/chess'

export interface MoveMark {
  sq: number
  danger: boolean
  capture: boolean
}

interface Props {
  hero: Hero
  heroDead: boolean
  /** bumps on respawn so the hero pops in fresh instead of sliding across */
  heroKey: number
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

export function Board({ hero, heroDead, heroKey, enemies, moves, showDanger, lastMove, spawned, poof, onMove, disabled }: Props) {
  const markBySq = new Map(moves.map((m) => [m.sq, m]))
  const boardRef = useRef<HTMLDivElement>(null)
  // Pointer position (px, relative to the board) while the hero is being dragged.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)

  function pointerPos(e: PointerEvent) {
    const r = boardRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }
  }

  function squareAt(x: number, y: number, w: number): number | null {
    const cell = w / SIZE
    const fx = Math.floor(x / cell)
    const fy = Math.floor(y / cell)
    if (fx < 0 || fy < 0 || fx >= SIZE || fy >= SIZE) return null
    return fy * SIZE + fx
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || heroDead) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = pointerPos(e)
    setDrag({ x, y })
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const { x, y } = pointerPos(e)
    setDrag({ x, y })
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const { x, y, w } = pointerPos(e)
    setDrag(null)
    const sq = squareAt(x, y, w)
    if (sq !== null && markBySq.has(sq) && !disabled) onMove(sq)
  }

  const boardW = boardRef.current?.getBoundingClientRect().width ?? 0
  const hoverSq = drag ? squareAt(drag.x, drag.y, boardW) : null
  const heroStyle: CSSProperties = drag
    ? {
        ...at(hero.sq),
        transform: `translate(${drag.x - boardW / SIZE / 2}px, ${drag.y - boardW / SIZE / 2}px)`,
      }
    : at(hero.sq)

  return (
    <div
      ref={boardRef}
      className={`board ${drag ? 'dragging' : ''}`}
      style={{ '--n': SIZE } as CSSProperties}
      role="grid"
      aria-label="Chess board"
    >
      {Array.from({ length: SIZE * SIZE }, (_, sq) => {
        const dark = ((sq % SIZE) + Math.floor(sq / SIZE)) % 2 === 1
        const mark = markBySq.get(sq)
        const cls = [
          'sq',
          dark ? 'dark' : 'light',
          lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : '',
          mark ? (mark.capture ? 'move capture' : 'move') : '',
          mark && showDanger ? (mark.danger ? 'danger' : 'safe') : '',
          hoverSq === sq && mark ? 'hover' : '',
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
            <span key={e.type} className={`t-${e.type}`}>
              {GLYPHS[e.type]}
            </span>
          </div>
        ))}

        {poof && (
          <div key={poof.key} className="piece black poof" style={at(poof.sq)}>
            <span className={`t-${poof.type}`}>{GLYPHS[poof.type]}</span>
          </div>
        )}

        <div
          key={`hero-${heroKey}`}
          className={`piece hero ${heroKey > 0 ? 'spawn' : ''} ${heroDead ? 'dead' : ''} ${drag ? 'lifted' : ''} ${disabled ? '' : 'grabbable'}`}
          style={heroStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <span>{GLYPHS[hero.type]}</span>
        </div>
      </div>
    </div>
  )
}
