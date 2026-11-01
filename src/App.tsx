import { useEffect, useMemo, useRef, useState } from 'react'
import { Board, type MoveMark } from './components/Board'
import {
  GLYPHS,
  PIECE_NAMES,
  applyEnemyMove,
  attackersOf,
  chooseEnemyMove,
  heroMoves,
  isAttacked,
  newRun,
  skillFor,
  spawnEnemies,
  targetEnemyCount,
  type Enemy,
  type Hero,
  type PieceType,
} from './game/chess'
import { setMuted, sfx } from './game/sound'

type Screen = 'menu' | 'play' | 'over'

const BEST_KEY = 'capture-craze:best'
const DANGER_KEY = 'capture-craze:show-danger'
const BLACK_DELAY = 450

function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable
  }
}

const CHEERS = ['Nice!', 'Great!', 'Awesome!', 'Brilliant!', 'On fire!', 'Unstoppable!']

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [muted, setMutedState] = useState(false)
  const [showDanger, setShowDanger] = useState(() => load(DANGER_KEY, '1') === '1')
  const [best, setBest] = useState(() => Number(load(BEST_KEY, '0')) || 0)
  const [newBest, setNewBest] = useState(false)

  const [hero, setHero] = useState<Hero>({ sq: 0, type: 'N' })
  const [enemies, setEnemies] = useState<Enemy[]>([])
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [turns, setTurns] = useState(0)
  const [blackToMove, setBlackToMove] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)
  const [spawned, setSpawned] = useState<Set<number>>(new Set())
  const [poof, setPoof] = useState<{ sq: number; type: PieceType; key: number } | null>(null)
  const [banner, setBanner] = useState<{ text: string; kind: 'good' | 'bad'; key: number } | null>(null)
  const [death, setDeath] = useState<{ reason: 'captured' | 'trapped'; by?: PieceType } | null>(null)
  const keyRef = useRef(0)
  const timers = useRef<number[]>([])

  const moves: MoveMark[] = useMemo(() => {
    if (screen !== 'play' || blackToMove || death) return []
    return heroMoves(hero, enemies).map((sq) => ({
      sq,
      capture: enemies.some((e) => e.sq === sq),
      danger: isAttacked(
        sq,
        enemies.filter((e) => e.sq !== sq),
      ),
    }))
  }, [hero, enemies, screen, blackToMove, death])

  // Clear pending timeouts when leaving a run.
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  function flash(text: string, kind: 'good' | 'bad') {
    setBanner({ text, kind, key: ++keyRef.current })
  }

  function start() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const run = newRun()
    setHero(run.hero)
    setEnemies(run.enemies)
    setSpawned(new Set(run.enemies.map((e) => e.id)))
    setScore(0)
    setStreak(0)
    setTurns(0)
    setBlackToMove(false)
    setLastMove(null)
    setPoof(null)
    setBanner(null)
    setDeath(null)
    setNewBest(false)
    setScreen('play')
    flash(`You're a ${PIECE_NAMES[run.hero.type]}!`, 'good')
  }

  function gameOver(reason: 'captured' | 'trapped', finalScore: number, by?: PieceType) {
    setDeath({ reason, by })
    sfx.over()
    flash(reason === 'captured' ? 'Captured!' : 'Trapped!', 'bad')
    if (finalScore > best) {
      setBest(finalScore)
      save(BEST_KEY, String(finalScore))
      setNewBest(true)
    }
    later(() => setScreen('over'), 1400)
  }

  function onMove(to: number) {
    if (blackToMove || death) return
    const from = hero.sq
    const victim = enemies.find((e) => e.sq === to)
    const movedHero: Hero = { ...hero, sq: to }
    let board = enemies
    let newScore = score
    let newStreak = 0

    if (victim) {
      board = enemies.filter((e) => e.id !== victim.id)
      newScore = score + 1
      newStreak = streak + 1
      setPoof({ sq: to, type: victim.type, key: ++keyRef.current })
      sfx.capture(newStreak)
      if (newStreak >= 2) flash(CHEERS[Math.min(newStreak - 2, CHEERS.length - 1)], 'good')

      // Respawn: at least one new piece, more as the score climbs.
      const want = Math.max(1, targetEnemyCount(newScore) - board.length)
      const before = new Set(board.map((e) => e.id))
      board = spawnEnemies(movedHero, board, want, newScore)
      setSpawned(new Set(board.filter((e) => !before.has(e.id)).map((e) => e.id)))
    } else {
      sfx.step()
      setSpawned(new Set())
    }

    setHero(movedHero)
    setEnemies(board)
    setScore(newScore)
    setStreak(newStreak)
    setTurns((t) => t + 1)
    setLastMove({ from, to })
    setBlackToMove(true)

    // Black replies.
    later(() => {
      const m = chooseEnemyMove(movedHero, board, skillFor(newScore))
      if (!m) {
        setBlackToMove(false)
        return
      }
      const after = applyEnemyMove(board, m)
      setEnemies(after)
      setLastMove({ from: m.from, to: m.to })
      setSpawned(new Set())

      if (m.to === movedHero.sq) {
        const killer = after.find((e) => e.id === m.id)!
        gameOver('captured', newScore, killer.type)
        return
      }
      sfx.enemy()
      if (heroMoves(movedHero, after).length === 0) {
        gameOver('trapped', newScore)
        return
      }
      if (isAttacked(movedHero.sq, after)) sfx.check()
      setBlackToMove(false)
    }, BLACK_DELAY)
  }

  function toggleMute() {
    setMuted(!muted)
    setMutedState(!muted)
  }

  function toggleDanger() {
    save(DANGER_KEY, showDanger ? '0' : '1')
    setShowDanger(!showDanger)
  }

  const inCheck = screen === 'play' && !blackToMove && !death && isAttacked(hero.sq, enemies)
  const threats = inCheck ? attackersOf(hero.sq, enemies) : []

  if (screen === 'menu') {
    return (
      <main className="app menu">
        <div className="logo">
          <span className="logo-piece">♞</span>
          <h1>
            Capture <em>Craze</em>
          </h1>
        </div>
        <p className="tagline">Eat everything. Don't get eaten.</p>

        <ol className="rules">
          <li>
            <b>You're a random piece.</b> Move it like in chess.
          </li>
          <li>
            <b>Capture to score.</b> Every capture spawns new black pieces somewhere on the board.
          </li>
          <li>
            <b>Black hits back.</b> After your move, Black moves too — hunting you and setting up forks and
            skewers. Get captured and it's over.
          </li>
        </ol>

        <div className="menu-buttons">
          <button className="btn primary big" onClick={start}>
            ▶ Play
            <small>How many can you capture?</small>
          </button>
        </div>
        {best > 0 && <p className="best">Best: {best} captures</p>}
      </main>
    )
  }

  if (screen === 'over') {
    return (
      <main className="app menu">
        <div className="over-emoji">{newBest ? '🏆' : death?.reason === 'trapped' ? '🪤' : '💥'}</div>
        <h1>{newBest ? 'New best!' : 'Game over'}</h1>
        <p className="tagline">
          {death?.reason === 'trapped'
            ? 'Boxed in with nowhere to go.'
            : `Your ${PIECE_NAMES[hero.type]} was taken by a ${PIECE_NAMES[death?.by ?? 'P']}.`}
        </p>
        <div className="stats">
          <div>
            <span>{score}</span>
            <label>Captures</label>
          </div>
          <div>
            <span>{turns}</span>
            <label>Moves</label>
          </div>
          <div>
            <span>{best}</span>
            <label>Best</label>
          </div>
        </div>
        <div className="menu-buttons">
          <button className="btn primary big" onClick={start}>
            Play again
          </button>
          <button className="btn ghost" onClick={() => setScreen('menu')}>
            Menu
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="app play">
      <header className="hud">
        <button
          className="icon-btn"
          onClick={() => {
            timers.current.forEach(clearTimeout)
            setScreen('menu')
          }}
          aria-label="Quit"
        >
          ✕
        </button>
        <div className="you">
          <span className="mini">{GLYPHS[hero.type]}</span> {PIECE_NAMES[hero.type]}
        </div>
        <button className={`icon-btn ${showDanger ? 'active' : ''}`} onClick={toggleDanger} title="Show danger squares">
          {showDanger ? '👁' : '🙈'}
        </button>
        <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <section className="scoreline">
        <div className="score">
          {score}
          <small> captured</small>
        </div>
        <div className={`combo c${Math.min(streak, 5)}`}>{streak >= 2 ? `🔥 ${streak} in a row` : `Best ${best}`}</div>
      </section>

      <section className="status">
        <div className={`turn ${blackToMove ? 'black' : ''}`}>{blackToMove ? 'Black is thinking…' : 'Your move'}</div>
        {inCheck && (
          <div className="check">
            ⚠ Under attack by {threats.map((t) => GLYPHS[t.type]).join(' ')}
          </div>
        )}
      </section>

      <div className="board-wrap">
        <Board
          hero={hero}
          heroDead={!!death}
          enemies={enemies}
          moves={moves}
          showDanger={showDanger}
          lastMove={lastMove}
          spawned={spawned}
          poof={poof}
          onMove={onMove}
          disabled={blackToMove || !!death}
        />
        {banner && (
          <div key={banner.key} className={`banner ${banner.kind}`}>
            {banner.text}
          </div>
        )}
      </div>

      <p className="legend">
        {showDanger ? (
          <>
            <span className="dot safe" /> safe <span className="dot danger" /> Black can take you there
          </>
        ) : (
          'Danger hints off — good luck!'
        )}
      </p>
    </main>
  )
}
