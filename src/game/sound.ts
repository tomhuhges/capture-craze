// Tiny WebAudio blips — no audio files needed.
let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean) {
  muted = m
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
  if (muted) return
  try {
    ctx ??= new AudioContext()
    const t = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  } catch {
    // audio not available — ignore
  }
}

export const sfx = {
  capture(combo: number) {
    tone(440 + combo * 60, 0, 0.12, 'triangle')
  },
  step() {
    tone(330, 0, 0.06, 'sine', 0.08)
  },
  enemy() {
    tone(196, 0, 0.08, 'triangle', 0.1)
  },
  check() {
    tone(660, 0, 0.08, 'square', 0.05)
    tone(660, 0.12, 0.08, 'square', 0.05)
  },
  over() {
    ;[392, 330, 262].forEach((f, i) => tone(f, i * 0.15, 0.3, 'triangle'))
  },
}
