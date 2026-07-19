import { applyMove, distanceToOff, legalMoves, topRun } from './index';
import type { GameState, Move, Player } from './types';

/**
 * AI: her legal hamle için hamle sonrası pozisyonu değerlendirir, en iyisini
 * oynar. Değerlendirme; pul sokmayı, ikili (güvenli) yığın kurmayı ve rakibi
 * kilitlemeyi ödüllendirir, açıkta tek pul bırakmayı cezalandırır. Bu sayede
 * "tek pulla koşturma" davranışı oluşmaz: pulu içeri sokmak ve eşlemek,
 * yalnız pulu sürmekten her zaman daha değerlidir.
 */
export function chooseMove(state: GameState): Move | null {
  return planTurn(state)[0] ?? null;
}

/**
 * Turun tamamını planlar: zar dizilerinin en iyi bitiş pozisyonunu arar
 * (ışın araması: her adımda en umut verici 6 hamle dallanır). Böylece AI
 * "önce şunu sokayım, sonra onunla kilitleyeyim" gibi insansı kombinasyonlar
 * kurabilir; hamleler tek tek açgözlü seçilmez.
 */
export function planTurn(state: GameState): Move[] {
  const p = state.turn;
  let bestSeq: Move[] = [];
  let bestScore = -Infinity;

  function dfs(s: GameState, seq: Move[]) {
    const moves = legalMoves(s);
    if (moves.length === 0) {
      const score = evaluate(s, p);
      if (score > bestScore) {
        bestScore = score;
        bestSeq = seq;
      }
      return;
    }
    const scored = moves
      .map((m) => {
        const next = applyMove(s, m);
        return { m, next, score: evaluate(next, p) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    for (const { m, next } of scored) {
      dfs(next, [...seq, m]);
    }
  }

  dfs(state, []);
  return bestSeq;
}

/** Pozisyonun p oyuncusu için değeri (büyük = iyi) */
export function evaluate(state: GameState, p: Player): number {
  let score = 0;

  score += state.borneOff[p] * 40; // toplanan pul en değerlisi
  score += (15 - state.hand[p] - state.borneOff[p]) * 10; // tahtaya girmiş pul

  for (let i = 0; i < 24; i++) {
    const stack = state.points[i];
    if (stack.length === 0) continue;
    const run = topRun(stack)!;

    // Kulede altta kalan rakip pulları: kilitli rakip = büyük avantaj
    if (run.player === p) {
      let locked = 0;
      for (let k = 0; k < stack.length - run.count; k++) {
        if (stack[k] !== p) locked++;
      }
      score += locked * 14;
      // En üstte 2+ pulumuz: hane bize güvenli
      if (run.count >= 2) score += 9;
      // En üstte tek pulumuz: kilitlenebilir, riskli
      if (run.count === 1) score -= 7;
    } else {
      // Bizim pullarımız rakibin altında kilitliyse kötü
      let ourLocked = 0;
      for (let k = 0; k < stack.length - run.count; k++) {
        if (stack[k] === p) ourLocked++;
      }
      score -= ourLocked * 12;
    }

    // İlerleme: her pulumuz kat ettiği yol kadar puan
    for (const c of stack) {
      if (c === p) score += (24 - distanceToOff(p, i)) * 0.35;
    }
  }

  return score;
}
