import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import {
  GLYPHS,
  PIECE_NAMES,
  generatePuzzle,
  legalCaptures,
  piecesForLevel,
  solve,
  type Hero,
  type PieceType,
  type Puzzle,
} from './game/chess'
import { setMuted, sfx } from './game/sound'

type Mode = 'rush' | 'zen'
type Screen = 'menu' | 'play' | 'over'

const RUSH_SECONDS = 90
const SOLVE_TIME_BONUS = 6
const MAX_HEARTS = 3
const BEST_KEY = 'capture-craze:best'

interface Snapshot {
  hero: Hero
  pieces: Record<number, PieceType>
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {
    // storage unavailable
  }
}

const CHEERS = ['Nice!', 'Great!', 'Awesome!', 'Brilliant!', 'On fire!', 'Unstoppable!']

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [mode, setMode] = useState<Mode>('rush')
  const [muted, setMutedState] = useState(false)

  // run state
  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(1)
  const [hearts, setHearts] = useState(MAX_HEARTS)
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS)
  const [solved, setSolved] = useState(0)
  const [best, setBest] = useState(loadBest)
  const [newBest, setNewBest] = useState(false)

  // puzzle state
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [hero, setHero] = useState<Hero>({ sq: 0, type: 'N' })
  const [pieces, setPieces] = useState<Record<number, PieceType>>({})
  const [history, setHistory] = useState<Snapshot[]>([])
  const [hint, setHint] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const [banner, setBanner] = useState<{ text: string; kind: 'good' | 'bad'; key: number } | null>(null)
  const [poof, setPoof] = useState<{ sq: number; type: PieceType; key: number } | null>(null)
  const [floaters, setFloaters] = useState<{ id: number; text: string }[]>([])
  const idRef = useRef(0)

  const size = puzzle?.size ?? 6
  const targets = useMemo(() => legalCaptures(hero, pieces, size), [hero, pieces, size])
  const remaining = Object.keys(pieces).length

  const loadPuzzle = useCallback((p: Puzzle) => {
    setPuzzle(p)
    setHero(p.hero)
    setPieces(p.pieces)
    setHistory([])
    setHint(null)
    setBusy(false)
  }, [])

  const nextPuzzle = useCallback(
    (lvl: number) => loadPuzzle(generatePuzzle(piecesForLevel(lvl))),
    [loadPuzzle],
  )

  const resetPuzzle = useCallback(() => {
    if (puzzle) loadPuzzle(puzzle)
  }, [puzzle, loadPuzzle])

  function start(m: Mode) {
    setMode(m)
    setLevel(0)
    setScore(0)
    setCombo(1)
    setHearts(MAX_HEARTS)
    setTimeLeft(RUSH_SECONDS)
    setSolved(0)
    setNewBest(false)
    setBanner(null)
    nextPuzzle(0)
    setScreen('play')
  }

  const scoreRef = useRef(0)
  useEffect(() => {
    scoreRef.current = score
  }, [score])

  const endRun = useCallback(() => {
    sfx.over()
    setScreen('over')
    const s = scoreRef.current
    if (s > best) {
      setBest(s)
      saveBest(s)
      setNewBest(true)
    }
  }, [best])

  // Rush timer
  useEffect(() => {
    if (screen !== 'play' || mode !== 'rush') return
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [screen, mode])

  useEffect(() => {
    if (screen !== 'play' || mode !== 'rush') return
    if (timeLeft === 0) endRun()
    else if (timeLeft <= 5) sfx.tick()
  }, [timeLeft, screen, mode, endRun])

  function flash(text: string, kind: 'good' | 'bad') {
    setBanner({ text, kind, key: ++idRef.current })
  }

  function float(text: string) {
    const id = ++idRef.current
    setFloaters((f) => [...f, { id, text }])
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900)
  }

  function capture(sq: number) {
    if (busy) return
    const type = pieces[sq]
    const next = { ...pieces }
    delete next[sq]
    const nextHero = { sq, type }

    setHistory((h) => [...h, { hero, pieces }])
    setPoof({ sq, type, key: ++idRef.current })
    setHero(nextHero)
    setPieces(next)
    setHint(null)
    sfx.capture(combo)

    const left = Object.keys(next).length
    if (left === 0) {
      onSolved()
    } else if (legalCaptures(nextHero, next, size).length === 0) {
      onStuck()
    }
  }

  function onSolved() {
    setBusy(true)
    sfx.solve()
    // Points are only banked on a solve, so undo/restart can't be farmed.
    const points = (Object.keys(puzzle?.pieces ?? {}).length * 10 + 50) * combo
    setScore((s) => s + points)
    float(`+${points}`)
    setSolved((n) => n + 1)
    flash(CHEERS[Math.min(combo - 1, CHEERS.length - 1)], 'good')
    if (mode === 'rush') {
      setTimeLeft((t) => t + SOLVE_TIME_BONUS)
      float(`+${SOLVE_TIME_BONUS}s`)
    }
    setCombo((c) => Math.min(c + 1, 5))
    const nextLevel = level + 1
    setLevel(nextLevel)
    setTimeout(() => nextPuzzle(nextLevel), 900)
  }

  function onStuck() {
    setBusy(true)
    sfx.stuck()
    setShake(true)
    setCombo(1)
    flash('Stuck! No captures left', 'bad')
    setTimeout(() => setShake(false), 500)

    if (mode === 'rush') {
      const h = hearts - 1
      setHearts(h)
      if (h <= 0) {
        setTimeout(endRun, 800)
        return
      }
    }
    setTimeout(resetPuzzle, 900)
  }

  function undo() {
    if (busy || !history.length) return
    const prev = history[history.length - 1]
    setHistory(history.slice(0, -1))
    setHero(prev.hero)
    setPieces(prev.pieces)
    setHint(null)
  }

  function showHint() {
    if (busy) return
    const path = solve(hero, pieces, size)
    if (path && path.length) {
      setHint(path[0])
    } else {
      // Current position is a dead end; point to the start of the known solution.
      flash('Dead end — try undoing', 'bad')
    }
  }

  function skip() {
    if (busy) return
    if (mode === 'rush') {
      setCombo(1)
      setTimeLeft((t) => Math.max(0, t - 5))
      float('-5s')
    }
    nextPuzzle(level)
  }

  function toggleMute() {
    setMuted(!muted)
    setMutedState(!muted)
  }

  // Keyboard: U = undo, R = restart, H = hint (zen)
  useEffect(() => {
    if (screen !== 'play') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'u') undo()
      if (e.key === 'r' && !busy) resetPuzzle()
      if (e.key === 'h' && mode === 'zen') showHint()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (screen === 'menu') {
    return (
      <main className="app menu">
        <div className="logo">
          <span className="logo-piece">♞</span>
          <h1>
            Capture <em>Craze</em>
          </h1>
        </div>
        <p className="tagline">Every move is a capture. You become what you eat.</p>

        <ol className="rules">
          <li>
            <b>Always capture.</b> Your white piece can only move by taking a black piece.
          </li>
          <li>
            <b>Shapeshift.</b> After a capture, you turn into the piece you took.
          </li>
          <li>
            <b>Clear the board.</b> Plan ahead — if nothing is in reach, you're stuck!
          </li>
        </ol>

        <div className="menu-buttons">
          <button className="btn primary big" onClick={() => start('rush')}>
            ⚡ Rush mode
            <small>{RUSH_SECONDS}s · 3 hearts · combos</small>
          </button>
          <button className="btn secondary big" onClick={() => start('zen')}>
            🧘 Zen mode
            <small>No timer · hints · undo</small>
          </button>
        </div>
        {best > 0 && <p className="best">Best rush score: {best}</p>}
      </main>
    )
  }

  if (screen === 'over') {
    return (
      <main className="app menu">
        <div className="over-emoji">{newBest ? '🏆' : timeLeft === 0 ? '⏰' : '💔'}</div>
        <h1>{newBest ? 'New best!' : timeLeft === 0 ? "Time's up!" : 'Out of hearts!'}</h1>
        <div className="stats">
          <div>
            <span>{score}</span>
            <label>Score</label>
          </div>
          <div>
            <span>{solved}</span>
            <label>Solved</label>
          </div>
          <div>
            <span>{best}</span>
            <label>Best</label>
          </div>
        </div>
        <div className="menu-buttons">
          <button className="btn primary big" onClick={() => start('rush')}>
            Play again
          </button>
          <button className="btn ghost" onClick={() => setScreen('menu')}>
            Menu
          </button>
        </div>
      </main>
    )
  }

  const timePct = Math.min(100, (timeLeft / RUSH_SECONDS) * 100)

  return (
    <main className="app play">
      <header className="hud">
        <button className="icon-btn" onClick={() => (mode === 'rush' ? endRun() : setScreen('menu'))} aria-label="Quit">
          ✕
        </button>
        {mode === 'rush' ? (
          <div className={`timebar ${timeLeft <= 10 ? 'low' : ''}`}>
            <div className="fill" style={{ width: `${timePct}%` }} />
            <span>{timeLeft}s</span>
          </div>
        ) : (
          <div className="zen-label">Zen · Puzzle {level + 1}</div>
        )}
        {mode === 'rush' && (
          <div className="hearts" aria-label={`${hearts} hearts`}>
            {Array.from({ length: MAX_HEARTS }, (_, i) => (
              <span key={i} className={i < hearts ? 'on' : 'off'}>
                ♥
              </span>
            ))}
          </div>
        )}
        <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <section className="scoreline">
        <div className="score">
          {score}
          <div className="floaters">
            {floaters.map((f) => (
              <span key={f.id}>{f.text}</span>
            ))}
          </div>
        </div>
        <div className={`combo c${combo}`}>×{combo} combo</div>
      </section>

      <section className="status">
        <div className="you">
          You are a <b>{PIECE_NAMES[hero.type]}</b> <span className="mini">{GLYPHS[hero.type]}</span>
        </div>
        <div className="left">{remaining} left</div>
      </section>

      <div className="board-wrap">
        <Board
          size={size}
          hero={hero}
          pieces={pieces}
          targets={busy ? [] : targets}
          hint={hint}
          shake={shake}
          poof={poof}
          onCapture={capture}
          disabled={busy}
        />
        {banner && (
          <div key={banner.key} className={`banner ${banner.kind}`}>
            {banner.text}
          </div>
        )}
      </div>

      <footer className="controls">
        <button className="btn ghost" onClick={undo} disabled={busy || !history.length}>
          ↶ Undo
        </button>
        <button className="btn ghost" onClick={resetPuzzle} disabled={busy}>
          ⟲ Restart
        </button>
        {mode === 'zen' ? (
          <button className="btn ghost" onClick={showHint} disabled={busy}>
            💡 Hint
          </button>
        ) : null}
        <button className="btn ghost" onClick={skip} disabled={busy}>
          ⏭ Skip{mode === 'rush' ? ' (-5s)' : ''}
        </button>
      </footer>
    </main>
  )
}
