# Capture Craze ♞

A chess survival game built with React + TypeScript + Vite.

**Play:** https://tomhuhges.github.io/capture-craze/

## Rules
1. **You're a queen** with **2 minutes** to score as many points as you can.
2. **Capture black pieces to score.** Each is worth its chess value: pawn 1, knight 3, bishop 3, rook 5, queen 9. Every capture spawns new black pieces (pawns, knights, bishops, rooks or queens — never kings, and never more than one queen at a time) in random spots. They never spawn attacking you directly.
3. **Black hits back.** After each of your moves, Black makes one move. It hunts you and sets traps by cutting off escape squares, setting up forks and leaving bait you can't safely take. Black gets sharper as your score climbs.
4. Get captured (or boxed in with no legal move) and you lose 9 points and respawn on a random safe square. The run only ends when the clock hits 0:00.

Green/red dots show whether a square is safe (toggle with 👁).

## Dev
```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

Game rules, spawning and Black's AI live in `src/game/chess.ts`. Pushes to this branch or `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
