import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board, type MoveMark } from './components/Board'
import { PieceIcon } from './components/PieceIcon'
import {
  PIECE_VALUES,
  CAPTURE_PENALTY,
  applyEnemyMove,
  attackersOf,
  chooseEnemyMove,
  heroMoves,
  isAttacked,
  newRun,
  respawnHero,
  skillFor,
  spawnEnemies,
  targetEnemyCount,
  type Enemy,
  type Hero,
  type PieceType,
} from './game/chess'
import { setMuted, sfx } from './game/sound'

type Screen = 'menu' | 'play' | 'over'

const BEST_KEY = 'capture-craze:best-2min'
const GAME_SECONDS = 120
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

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const CHEERS = ['Nice!', 'Great!', 'Awesome!', 'Brilliant!', 'On fire!', 'Unstoppable!']

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [muted, setMutedState] = useState(false)
  const [showDanger, setShowDanger] = useState(() => load(DANGER_KEY, '1') === '1')
  const [best, setBest] = useState(() => Number(load(BEST_KEY, '0')) || 0)
  const [newBest, setNewBest] = useState(false)

  const [hero, setHero] = useState<Hero>({ sq: 0, type: 'N' })
  const [enemies, setEnemies] = useState<Enemy[]>([])
  const [score, setScore] = useState(0) // points: sum of captured piece values
  const [captures, setCaptures] = useState(0) // piece count; drives difficulty
  const [floaters, setFloaters] = useState<{ id: number; text: string }[]>([])
  const [streak, setStreak] = useState(0)
  const [blackToMove, setBlackToMove] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)
  const [spawned, setSpawned] = useState<Set<number>>(new Set())
  const [poof, setPoof] = useState<{ sq: number; type: PieceType; key: number } | null>(null)
  const [banner, setBanner] = useState<{ text: string; kind: 'good' | 'bad'; key: number } | null>(null)
  type EndReason = 'time'
  const [death, setDeath] = useState<{ reason: EndReason } | null>(null)
  const [heroDown, setHeroDown] = useState(false) // captured, waiting to respawn
  const [heroKey, setHeroKey] = useState(0)
  const [timesTaken, setTimesTaken] = useState(0)
  const [pointsLost, setPointsLost] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const endsAt = useRef(0)
  const scoreRef = useRef(0)
  scoreRef.current = score
  const keyRef = useRef(0)
  const timers = useRef<number[]>([])

  const moves: MoveMark[] = useMemo(() => {
    if (screen !== 'play' || blackToMove || death || heroDown) return []
    return heroMoves(hero, enemies).map((sq) => ({
      sq,
      capture: enemies.some((e) => e.sq === sq),
      danger: isAttacked(
        sq,
        enemies.filter((e) => e.sq !== sq),
      ),
    }))
  }, [hero, enemies, screen, blackToMove, death, heroDown])

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
    setCaptures(0)
    setFloaters([])
    setStreak(0)
    setBlackToMove(false)
    setLastMove(null)
    setPoof(null)
    setBanner(null)
    setDeath(null)
    setHeroDown(false)
    setHeroKey(0)
    setTimesTaken(0)
    setPointsLost(0)
    setNewBest(false)
    setTimeLeft(GAME_SECONDS)
    endsAt.current = Date.now() + GAME_SECONDS * 1000
    setScreen('play')
    flash('2 minutes — go!', 'good')
  }

  function floatText(text: string) {
    const fid = ++keyRef.current
    setFloaters((f) => [...f, { id: fid, text }])
    later(() => setFloaters((f) => f.filter((x) => x.id !== fid)), 900)
  }

  /** Black took you: lose points, then pop back in somewhere random. */
  function heroTaken(board: Enemy[], scoreBefore: number, reason: 'captured' | 'trapped') {
    const lost = Math.min(CAPTURE_PENALTY, scoreBefore)
    setScore(scoreBefore - lost)
    setStreak(0)
    setTimesTaken((n) => n + 1)
    setPointsLost((n) => n + lost)
    setHeroDown(true)
    if (lost > 0) floatText(`-${lost}`)
    flash(`${reason === 'captured' ? 'Captured!' : 'Trapped!'} −${CAPTURE_PENALTY}`, 'bad')
    sfx.over()
    later(() => {
      setHero(respawnHero('Q', board))
      setHeroKey((k) => k + 1)
      setHeroDown(false)
      setBlackToMove(false)
    }, 900)
  }

  function gameOver(reason: EndReason, finalScore: number) {
    // Cancel anything pending (e.g. Black's reply when the clock hits zero).
    timers.current.forEach(clearTimeout)
    timers.current = []
    setDeath({ reason })
    setBlackToMove(false)
    setHeroDown(false)
    sfx.over()
    flash("Time's up!", 'good')
    if (finalScore > best) {
      setBest(finalScore)
      save(BEST_KEY, String(finalScore))
      setNewBest(true)
    }
    later(() => setScreen('over'), 1400)
  }

  // 2-minute game clock. Runs in real time, including while Black thinks.
  useEffect(() => {
    if (screen !== 'play' || death) return
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) gameOver('time', scoreRef.current)
      else if (left <= 5) sfx.tick()
    }, 250)
    return () => clearInterval(id)
  })

  function onMove(to: number) {
    if (blackToMove || death || heroDown) return
    const from = hero.sq
    const victim = enemies.find((e) => e.sq === to)
    const movedHero: Hero = { ...hero, sq: to }
    let board = enemies
    let newScore = score
    let newCaptures = captures
    let newStreak = 0

    if (victim) {
      board = enemies.filter((e) => e.id !== victim.id)
      const points = PIECE_VALUES[victim.type]
      newScore = score + points
      newCaptures = captures + 1
      newStreak = streak + 1
      floatText(`+${points}`)
      const poofKey = ++keyRef.current
      setPoof({ sq: to, type: victim.type, key: poofKey })
      // Drop the ghost once its animation is done (only if no newer poof replaced it).
      later(() => setPoof((p) => (p?.key === poofKey ? null : p)), 450)
      sfx.capture(newStreak)
      if (newStreak >= 2) flash(CHEERS[Math.min(newStreak - 2, CHEERS.length - 1)], 'good')

      // Respawn: at least one new piece, more as you capture more.
      const want = Math.max(1, targetEnemyCount(newCaptures) - board.length)
      const before = new Set(board.map((e) => e.id))
      board = spawnEnemies(movedHero, board, want, newCaptures)
      setSpawned(new Set(board.filter((e) => !before.has(e.id)).map((e) => e.id)))
    } else {
      sfx.step()
      setSpawned(new Set())
    }

    setHero(movedHero)
    setEnemies(board)
    setScore(newScore)
    setCaptures(newCaptures)
    setStreak(newStreak)
    setLastMove({ from, to })
    setBlackToMove(true)

    // Black replies.
    later(() => {
      const m = chooseEnemyMove(movedHero, board, skillFor(newCaptures))
      if (!m) {
        setBlackToMove(false)
        return
      }
      const after = applyEnemyMove(board, m)
      setEnemies(after)
      setLastMove({ from: m.from, to: m.to })
      setSpawned(new Set())

      if (m.to === movedHero.sq) {
        heroTaken(after, newScore, 'captured')
        return
      }
      sfx.enemy()
      if (heroMoves(movedHero, after).length === 0) {
        heroTaken(after, newScore, 'trapped')
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

  const inCheck = screen === 'play' && !blackToMove && !death && !heroDown && isAttacked(hero.sq, enemies)
  const threats = inCheck ? attackersOf(hero.sq, enemies) : []

  if (screen === 'menu') {
    return (
      <Shell
        className="menu"
        header={
          <div className="logo">
            <span className="logo-piece">
              <PieceIcon type="N" color="w" decorative />
            </span>
            <h1>
              Capture <em>Craze</em>
            </h1>
          </div>
        }
        footer={
          <div className="menu-buttons">
            <button className="btn primary big" onClick={start}>
              ▶ Play
              <small>2-minute run</small>
            </button>
          </div>
        }
      >
        <ul className="rules">
          <li>
            <PieceIcon type="Q" color="w" className="inline" decorative /> <b>You're a queen.</b> 2 minutes.
          </li>
          <li>
            <b>Capture for points:</b>{' '}
            <span className="values">
              {(['P', 'N', 'B', 'R', 'Q'] as const).map((t) => (
                <span key={t} title={`${PIECE_VALUES[t]} point${PIECE_VALUES[t] === 1 ? '' : 's'}`}>
                  <PieceIcon type={t} color="b" className="inline" />
                  {PIECE_VALUES[t]}
                </span>
              ))}
            </span>
          </li>
          <li>
            <b>Get captured:</b> −9 and respawn.
          </li>
        </ul>
        {best > 0 && <p className="best">Best: {best} points</p>}
      </Shell>
    )
  }

  if (screen === 'over') {
    return (
      <Shell
        className="menu"
        header={<h1>{newBest ? 'New best!' : "Time's up!"}</h1>}
        footer={
          <div className="menu-buttons row">
            <button className="btn ghost" onClick={() => setScreen('menu')}>
              Menu
            </button>
            <button className="btn primary big" onClick={start}>
              Play again
            </button>
          </div>
        }
      >
        <div className="over-emoji">{newBest ? '🏆' : '⏰'}</div>
        <p className="tagline">
          {timesTaken === 0
            ? 'Flawless — never got captured!'
            : `Captured ${timesTaken} time${timesTaken === 1 ? '' : 's'}.`}
        </p>
        <div className="final-score">
          <label>Score</label>
          <span>{score}</span>
          <small>Best {best}</small>
        </div>
        <div className="stats">
          <div>
            <span className={score + pointsLost ? 'pos' : ''}>{score + pointsLost ? `+${score + pointsLost}` : 0}</span>
            <label>Points captured</label>
          </div>
          <div>
            <span>{captures}</span>
            <label>Pieces captured</label>
          </div>
          <div>
            <span className={pointsLost ? 'neg' : ''}>{pointsLost ? `−${pointsLost}` : 0}</span>
            <label>Points lost</label>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      className="play"
      header={
        <div className="hud">
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
          <div className={`timebar ${timeLeft <= 10 ? 'low' : ''}`}>
            <div className="fill" style={{ width: `${(timeLeft / GAME_SECONDS) * 100}%` }} />
            <span>
              <PieceIcon type={hero.type} color="w" className="mini" decorative /> {fmt(timeLeft)}
            </span>
          </div>
          <button className={`icon-btn ${showDanger ? 'active' : ''}`} onClick={toggleDanger} title="Show danger squares">
            {showDanger ? '👁' : '🙈'}
          </button>
          <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      }
      footer={
        <p className="legend">
          {showDanger ? (
            <>
              <span className="dot safe" /> safe <span className="dot danger" /> danger · drag or tap to move
            </>
          ) : (
            'Drag your piece or tap a square · hints off'
          )}
        </p>
      }
    >
      <section className="scoreline">
        <div className="score">
          {score}
          <small> pts</small>
          <div className="floaters">
            {floaters.map((f) => (
              <span key={f.id} className={f.text.startsWith('-') ? 'neg' : ''}>
                {f.text}
              </span>
            ))}
          </div>
        </div>
        <div className={`combo c${Math.min(streak, 5)}`}>{streak >= 2 ? `🔥 ${streak} in a row` : `Best ${best}`}</div>
      </section>

      <section className="status">
        <div className={`turn ${blackToMove ? 'black' : ''}`}>
          {heroDown ? 'Respawning…' : blackToMove ? 'Black is thinking…' : 'Your move'}
        </div>
        {inCheck && (
          <div className="check">
            ⚠ Under attack by{' '}
            {threats.map((t) => (
              <PieceIcon key={t.id} type={t.type} color="b" className="inline" />
            ))}
          </div>
        )}
      </section>

      <div className="board-wrap">
        <Board
          hero={hero}
          heroDead={heroDown}
          heroKey={heroKey}
          enemies={enemies}
          moves={moves}
          showDanger={showDanger}
          lastMove={lastMove}
          spawned={spawned}
          poof={poof}
          onMove={onMove}
          disabled={blackToMove || !!death || heroDown}
        />
        {banner && (
          <div key={banner.key} className={`banner ${banner.kind}`}>
            {banner.text}
          </div>
        )}
      </div>
    </Shell>
  )
}

/** Header pinned to the top, footer pinned to the bottom, middle scrolls. */
function Shell({
  className,
  header,
  footer,
  children,
}: {
  className: string
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <main className={`app ${className}`}>
      <header className="app-header">{header}</header>
      <div className="app-body">
        <div className="app-body-inner">{children}</div>
      </div>
      <footer className="app-footer">{footer}</footer>
    </main>
  )
}
