import { applyMove, legalMoves, topRun } from './index';
import type { GameState, Move, Player } from './types';

/**
 * Basit sezgisel AI: her hamleyi puanlar, en yükseğini oynar.
 * Öncelikler: toplama > rakibi kilitleme > güvenli yığın > ilerleme;
 * açıkta tek pul bırakmak ceza alır.
 */
export function chooseMove(state: GameState): Move | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const p = state.turn;

  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    let s = 0;
    if (m.type === 'bearoff') {
      s += 100;
    } else {
      const run = topRun(state.points[m.to]);
      if (run && run.player !== p && run.count === 1) s += 45; // rakibi kilitle
      if (run && run.player === p) s += 12; // kendi pulunun üstü: güvenli
      if (m.type === 'place') s += 6; // erken pul sokmak iyidir
      else s += m.die * 0.8; // ilerleme
    }
    // Hamle sonrası açıkta (en üstte tek başına) kalan pullarımız risklidir
    s -= 6 * exposedTops(applyMove(state, m), p);
    s += Math.random(); // eşitlik bozucu
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

/** En üstte tek başına duran (kilitlenebilir) pul sayısı */
function exposedTops(state: GameState, p: Player): number {
  let count = 0;
  for (let i = 0; i < 24; i++) {
    const run = topRun(state.points[i]);
    if (run && run.player === p && run.count === 1) count++;
  }
  return count;
}
