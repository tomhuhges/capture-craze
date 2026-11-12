// Chess piece artwork: the "Cburnett" set by Colin M.L. Burnett
// (https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces),
// via lichess-org/lila. Licensed GPLv2+ / BSD / CC BY-SA 3.0 — see README.
import { PIECE_NAMES, type PieceType } from '../game/chess'

const urls = import.meta.glob<string>('../assets/pieces/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export type PieceColor = 'w' | 'b'

export function pieceUrl(color: PieceColor, type: PieceType) {
  return urls[`../assets/pieces/${color}${type}.svg`]
}

interface Props {
  type: PieceType
  color: PieceColor
  className?: string
  /** decorative icons (inside labelled text) skip the alt text */
  decorative?: boolean
}

export function PieceIcon({ type, color, className = '', decorative = false }: Props) {
  return (
    <img
      className={`piece-icon ${className}`}
      src={pieceUrl(color, type)}
      alt={decorative ? '' : `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[type].toLowerCase()}`}
      draggable={false}
    />
  )
}
