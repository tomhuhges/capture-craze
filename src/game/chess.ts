// Core rules for Capture Craze (survival mode).
//
//  - You are a single white piece, randomly chosen at the start of a run.
//  - Move like that chess piece. Capture black pieces to score.
//  - Every time you capture, new black pieces spawn in random spots.
//  - After each of your moves, Black makes one move — hunting you, and
//    setting traps (forks, skewers, cutting off escape squares).
//  - If you get captured, or have no legal move, the run ends.

export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

export const SIZE = 8

export const PIECE_NAMES: Record<PieceType, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
  P: 'Pawn',
}

export const GLYPHS: Record<PieceType, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
}

export interface Hero {
  sq: number
  type: PieceType
}

export interface Enemy {
  id: number
  type: PieceType
  sq: number
}

export interface EnemyMove {
  id: number
  from: number
  to: number
  promoted: boolean
}

const DIRS: Record<Exclude<PieceType, 'P'>, [number, number][]> = {
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  Q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  K: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  N: [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
}
const SLIDES = { R: true, B: true, Q: true, K: false, N: false }

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE
const sqOf = (x: number, y: number) => y * SIZE + x
export const fileOf = (sq: number) => sq % SIZE
export const rankOf = (sq: number) => Math.floor(sq / SIZE)

/** Squares a non-pawn piece reaches; sliders stop on (and include) the first blocked square. */
function rays(type: Exclude<PieceType, 'P'>, from: number, blocked: (sq: number) => boolean): number[] {
  const out: number[] = []
  const fx = fileOf(from)
  const fy = rankOf(from)
  for (const [dx, dy] of DIRS[type]) {
    let x = fx + dx
    let y = fy + dy
    while (inside(x, y)) {
      const sq = sqOf(x, y)
      out.push(sq)
      if (blocked(sq) || !SLIDES[type]) break
      x += dx
      y += dy
    }
  }
  return out
}

/** Black pawns move "down" the board (towards the bottom row). */
function pawnAttacks(from: number): number[] {
  const x = fileOf(from)
  const y = rankOf(from) + 1
  return [x - 1, x + 1].filter((nx) => inside(nx, y)).map((nx) => sqOf(nx, y))
}

/** Legal destinations for the hero. Every piece on the board is an enemy, so any reached square is fine. */
export function heroMoves(hero: Hero, enemies: Enemy[]): number[] {
  const occ = new Set(enemies.map((e) => e.sq))
  if (hero.type === 'P') {
    // Not used (the hero is never a pawn), but keep it total.
    return []
  }
  return rays(hero.type, hero.sq, (sq) => occ.has(sq))
}

/** Squares enemy `e` attacks, treating `heroSq` and other enemies as blockers. */
function attacksOf(e: Enemy, occ: Set<number>): number[] {
  if (e.type === 'P') return pawnAttacks(e.sq)
  return rays(e.type, e.sq, (sq) => occ.has(sq))
}

/** Would a hero standing on `sq` be capturable by any of `enemies`? */
export function isAttacked(sq: number, enemies: Enemy[]): boolean {
  const occ = new Set(enemies.map((e) => e.sq))
  occ.add(sq)
  return enemies.some((e) => e.sq !== sq && attacksOf(e, occ).includes(sq))
}

/** Which enemies attack `sq` (used to show who got you). */
export function attackersOf(sq: number, enemies: Enemy[]): Enemy[] {
  const occ = new Set(enemies.map((e) => e.sq))
  occ.add(sq)
  return enemies.filter((e) => e.sq !== sq && attacksOf(e, occ).includes(sq))
}

/** All legal moves for black. */
export function enemyMoves(enemies: Enemy[], heroSq: number): EnemyMove[] {
  const occ = new Set(enemies.map((e) => e.sq))
  const all = new Set(occ)
  all.add(heroSq)
  const out: EnemyMove[] = []
  for (const e of enemies) {
    let targets: number[]
    if (e.type === 'P') {
      targets = pawnAttacks(e.sq).filter((sq) => sq === heroSq)
      const fwd = e.sq + SIZE
      if (rankOf(e.sq) < SIZE - 1 && !all.has(fwd)) targets.push(fwd)
    } else {
      targets = rays(e.type, e.sq, (sq) => all.has(sq)).filter((sq) => !occ.has(sq))
    }
    for (const to of targets) {
      out.push({ id: e.id, from: e.sq, to, promoted: e.type === 'P' && rankOf(to) === SIZE - 1 })
    }
  }
  return out
}

export function applyEnemyMove(enemies: Enemy[], m: EnemyMove): Enemy[] {
  return enemies.map((e) => (e.id === m.id ? { ...e, sq: m.to, type: m.promoted ? 'Q' : e.type } : e))
}

interface Outlook {
  /** hero moves that don't land on an attacked square */
  safe: number
  /** of those, how many capture a piece */
  safeCaptures: number
}

function heroOutlook(hero: Hero, enemies: Enemy[]): Outlook {
  let safe = 0
  let safeCaptures = 0
  for (const to of heroMoves(hero, enemies)) {
    const rest = enemies.filter((e) => e.sq !== to)
    if (!isAttacked(to, rest)) {
      safe++
      if (rest.length !== enemies.length) safeCaptures++
    }
  }
  return { safe, safeCaptures }
}

const dist = (a: number, b: number) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)))

/**
 * Black's brain. Captures you if it can; otherwise picks the move that leaves
 * you the fewest safe squares and the fewest free captures — which naturally
 * produces forks, skewer-style lines and baited pieces you can't safely take.
 * `skill` (0..1) is the chance Black plays its best move rather than a
 * lazy one; it ramps up with your score so the early game is forgiving.
 */
export function chooseEnemyMove(hero: Hero, enemies: Enemy[], skill: number): EnemyMove | null {
  const moves = enemyMoves(enemies, hero.sq)
  if (!moves.length) return null
  const kill = moves.find((m) => m.to === hero.sq)
  if (kill) return kill

  if (Math.random() > skill) {
    // Lazy move: some piece shuffles roughly towards you.
    const closer = moves.filter((m) => dist(m.to, hero.sq) < dist(m.from, hero.sq))
    const pool = closer.length ? closer : moves
    return pool[Math.floor(Math.random() * pool.length)]
  }
  const noise = 1.5

  let best: EnemyMove | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    const next = applyEnemyMove(enemies, m)
    const { safe, safeCaptures } = heroOutlook(hero, next)
    let score = -safe - 4 * safeCaptures
    if (safe === 0) score += 100 // you're trapped: every move loses
    score -= 0.15 * dist(m.to, hero.sq) // drift towards the hero
    if (m.promoted) score += 2
    score += Math.random() * noise
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}

function weightedType(captures: number): PieceType {
  const table: [PieceType, number][] = [
    ['P', 5],
    ['N', 3],
    ['B', 3],
    ['R', captures >= 2 ? 2 : 1],
    ['Q', captures >= 6 ? 1.5 : captures >= 3 ? 0.6 : 0],
    ['K', 0.8],
  ]
  const total = table.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [t, w] of table) {
    r -= w
    if (r <= 0) return t
  }
  return 'P'
}

/** How sharp Black plays for a given score. */
export function skillFor(captures: number) {
  return Math.min(0.9, 0.3 + captures * 0.04)
}

/** How many black pieces should be on the board for a given score. */
export function targetEnemyCount(captures: number) {
  return Math.min(2 + Math.floor(captures / 2), 9)
}

let nextId = 1

/**
 * Drops `count` new pieces on random empty squares. A spawn never attacks you
 * directly (no instant deaths) and we try to leave you at least one safe move.
 */
export function spawnEnemies(hero: Hero, enemies: Enemy[], count: number, captures: number): Enemy[] {
  let out = enemies
  for (let n = 0; n < count; n++) {
    const type = weightedType(captures)
    let fallback: Enemy | null = null
    let placed = false
    for (let attempt = 0; attempt < 60; attempt++) {
      const sq = Math.floor(Math.random() * SIZE * SIZE)
      if (sq === hero.sq || out.some((e) => e.sq === sq)) continue
      if (type === 'P' && rankOf(sq) >= SIZE - 1) continue
      if (dist(sq, hero.sq) < 2) continue
      const cand: Enemy = { id: nextId++, type, sq }
      const trial = [...out, cand]
      if (isAttacked(hero.sq, trial)) continue
      fallback ??= cand
      if (heroOutlook(hero, trial).safe > 0) {
        out = trial
        placed = true
        break
      }
    }
    if (!placed && fallback) out = [...out, fallback]
  }
  return out
}

export function newRun(): { hero: Hero; enemies: Enemy[] } {
  const types: PieceType[] = ['N', 'B', 'R', 'Q', 'K']
  const type = types[Math.floor(Math.random() * types.length)]
  const sq = sqOf(Math.floor(Math.random() * SIZE), SIZE - 1 - Math.floor(Math.random() * 2))
  const hero = { sq, type }
  return { hero, enemies: spawnEnemies(hero, [], targetEnemyCount(0), 0) }
}
