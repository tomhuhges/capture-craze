// Core rules + puzzle generator for Capture Craze.
//
// Rules:
//  - You control a single white "hero" piece.
//  - Every move MUST capture a black piece.
//  - When you capture, your hero turns into the piece it captured.
//  - Clear the board to solve the puzzle. If no capture is available, you're stuck.

export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N'

export const PIECE_NAMES: Record<PieceType, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
}

export const GLYPHS: Record<PieceType, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
}

export interface Hero {
  sq: number
  type: PieceType
}

export interface Puzzle {
  size: number
  hero: Hero
  /** square index -> piece type */
  pieces: Record<number, PieceType>
  /** one known solution, as a list of squares to capture in order */
  solution: number[]
}

const DIRS: Record<PieceType, [number, number][]> = {
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  Q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  K: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  N: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
}

const SLIDES: Record<PieceType, boolean> = { R: true, B: true, Q: true, K: false, N: false }

/**
 * Squares the piece on `from` can capture, given occupied squares.
 * Sliding pieces stop at the first occupied square.
 */
export function captureTargets(
  type: PieceType,
  from: number,
  occupied: (sq: number) => boolean,
  size: number,
): number[] {
  const out: number[] = []
  const fx = from % size
  const fy = Math.floor(from / size)
  for (const [dx, dy] of DIRS[type]) {
    let x = fx + dx
    let y = fy + dy
    while (x >= 0 && y >= 0 && x < size && y < size) {
      const sq = y * size + x
      if (occupied(sq)) {
        out.push(sq)
        break
      }
      if (!SLIDES[type]) break
      x += dx
      y += dy
    }
  }
  return out
}

export function legalCaptures(hero: Hero, pieces: Record<number, PieceType>, size: number) {
  return captureTargets(hero.type, hero.sq, (sq) => sq in pieces, size)
}

/** Can `type` on `from` reach `to` with nothing in `blockers` on the path between? */
function canReach(type: PieceType, from: number, to: number, blockers: Set<number>, size: number) {
  return captureTargets(type, from, (sq) => sq === to || blockers.has(sq), size).includes(to)
}

/** Depth-first search for a full solution. Returns the capture order or null. */
export function solve(hero: Hero, pieces: Record<number, PieceType>, size: number): number[] | null {
  const remaining = Object.keys(pieces).length
  if (remaining === 0) return []
  for (const target of legalCaptures(hero, pieces, size)) {
    const next = { ...pieces }
    const type = next[target]
    delete next[target]
    const rest = solve({ sq: target, type }, next, size)
    if (rest) return [target, ...rest]
  }
  return null
}

/** Counts positions where the player has 2+ options — a rough "how tricky" score. */
function decisionPoints(hero: Hero, pieces: Record<number, PieceType>, size: number, path: number[]) {
  let h = hero
  let p = { ...pieces }
  let forks = 0
  for (const target of path) {
    if (legalCaptures(h, p, size).length > 1) forks++
    const type = p[target]
    delete p[target]
    p = { ...p }
    h = { sq: target, type }
  }
  return forks
}

const TYPE_POOL: PieceType[] = ['N', 'N', 'B', 'B', 'R', 'R', 'Q', 'K', 'K']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Builds a guaranteed-solvable puzzle by working backwards from the final square.
 * Hero positions p0..pn; black pieces sit on p1..pn; the hero's type while
 * moving from p(i) is the type of the piece it captured last (t0 = start type).
 */
export function generatePuzzle(count: number, size = count <= 5 ? 6 : 8): Puzzle {
  const minForks = count <= 2 ? 0 : count <= 4 ? 1 : 2

  for (let attempt = 0; attempt < 500; attempt++) {
    const types: PieceType[] = Array.from({ length: count + 1 }, () => pick(TYPE_POOL))
    const pos: number[] = new Array(count + 1)
    pos[count] = Math.floor(Math.random() * size * size)
    const used = new Set([pos[count]])
    let ok = true

    for (let i = count - 1; i >= 0; i--) {
      const blockers = new Set(pos.slice(i + 2))
      const candidates: number[] = []
      for (let s = 0; s < size * size; s++) {
        if (used.has(s)) continue
        // Moves are symmetric for K/Q/R/B/N, so reaching p(i+1) from s works.
        if (canReach(types[i], s, pos[i + 1], blockers, size)) candidates.push(s)
      }
      if (!candidates.length) {
        ok = false
        break
      }
      pos[i] = pick(candidates)
      used.add(pos[i])
    }
    if (!ok) continue

    const pieces: Record<number, PieceType> = {}
    for (let i = 1; i <= count; i++) pieces[pos[i]] = types[i]
    const hero: Hero = { sq: pos[0], type: types[0] }
    const solution = pos.slice(1)

    if (attempt < 400 && decisionPoints(hero, pieces, size, solution) < minForks) continue
    return { size, hero, pieces, solution }
  }
  throw new Error('Could not generate puzzle')
}

/** Difficulty curve: number of black pieces for the Nth puzzle in a run. */
export function piecesForLevel(level: number) {
  return Math.min(2 + Math.floor(level / 2), 10)
}
