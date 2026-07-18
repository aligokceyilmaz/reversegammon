import { describe, expect, it } from 'vitest';
import { chooseMove } from './ai';
import { applyMove, newGame, rollDice, TOTAL_CHECKERS } from './index';
import type { GameState, Player } from './types';

function withStacks(
  turn: Player,
  stacks: Record<number, Player[]>,
  hand?: [number, number],
): GameState {
  const state = newGame(turn);
  for (const [pt, stack] of Object.entries(stacks)) {
    state.points[Number(pt)] = [...stack];
  }
  for (const p of [0, 1] as Player[]) {
    const onBoard = state.points.flat().filter((c) => c === p).length;
    state.hand[p] = hand ? hand[p] : TOTAL_CHECKERS - onBoard;
  }
  return state;
}

describe('AI davranışı', () => {
  it('açılışta tek pulla koşturmaz: 5-2 ile iki ayrı pul sokar', () => {
    let state = rollDice(newGame(1), 5, 2);
    const m1 = chooseMove(state)!;
    expect(m1.type).toBe('place');
    state = applyMove(state, m1);
    const m2 = chooseMove(state)!;
    expect(m2.type).toBe('place'); // aynı pulu ilerletmek yerine ikinci pulu sokar
  });

  it('çift zarda üst üste koyup güvenli yığın kurar', () => {
    let state = rollDice(newGame(1), 4, 4);
    for (let k = 0; k < 3; k++) {
      const m = chooseMove(state)!;
      expect(m.type).toBe('place');
      state = applyMove(state, m);
    }
    expect(state.points[20].length).toBe(3); // hepsi aynı haneye (girişi 4) yığıldı
  });

  it('rakibin tek pulunu kilitleme fırsatını kullanır', () => {
    // Siyah: idx10'da 2'li güvenli yığın; beyaz tek pul idx7'de (10-3=7)
    let state = withStacks(1, { 10: [1, 1], 7: [0] }, [0, 13]);
    state.hand[1] = 0;
    state.borneOff[1] = TOTAL_CHECKERS - 2;
    state = rollDice(state, 3, 6);
    const m = chooseMove(state)!;
    expect(m.type).toBe('move');
    expect((m as { to: number }).to).toBe(7); // beyazın üstüne oturur
  });

  it('toplama varken toplamayı seçer', () => {
    let state = withStacks(1, { 2: [1], 4: [1] });
    state.hand[1] = 0;
    state.borneOff[1] = TOTAL_CHECKERS - 2;
    state = rollDice(state, 5, 3);
    const m = chooseMove(state)!;
    expect(m.type).toBe('bearoff');
  });
});
