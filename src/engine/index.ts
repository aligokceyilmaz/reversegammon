import type { GameState, Move, Player, Stack } from './types';

export * from './types';

export const TOTAL_CHECKERS = 15;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

export function opponent(p: Player): Player {
  return (1 - p) as Player;
}

/** Oyuncunun ilerleme yönü (indeks üzerinde) */
export function direction(p: Player): 1 | -1 {
  return p === 0 ? 1 : -1;
}

/** Zar değeri d ile elden girilen hane */
export function entryPoint(p: Player, die: number): number {
  return p === 0 ? die - 1 : 24 - die;
}

/** Hanenin toplama kenarına uzaklığı (1-24) */
export function distanceToOff(p: Player, point: number): number {
  return p === 0 ? 24 - point : point + 1;
}

/** Toplama (bear-off) bölgesi mi? */
export function inHomeZone(p: Player, point: number): boolean {
  return p === 0 ? point >= 18 : point <= 5;
}

/** Kulenin en üstündeki ardışık aynı renk pul grubu */
export function topRun(stack: Stack): { player: Player; count: number } | null {
  if (stack.length === 0) return null;
  const player = stack[stack.length - 1];
  let count = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === player; i--) count++;
  return { player, count };
}

/**
 * Oyuncu bu haneye pul koyabilir/gidebilir mi?
 * - Boş hane: evet
 * - En üstte kendi pulu: evet (kendi pullarını sınırsız üst üste koyabilir)
 * - En üstte TEK rakip pulu: evet → kilitler (üstüne oturur)
 * - En üstte 2+ rakip pulu: hayır, hane kapalı
 */
export function canLand(state: GameState, p: Player, point: number): boolean {
  const run = topRun(state.points[point]);
  if (!run) return true;
  if (run.player === p) return true;
  return run.count === 1;
}

/** Hanedeki en üst pul bu oyuncunun mu? (yalnızca en üstteki pul oynayabilir) */
function topIsPlayers(state: GameState, p: Player, point: number): boolean {
  const st = state.points[point];
  return st.length > 0 && st[st.length - 1] === p;
}

/** Toplama başlayabilir mi? Elde pul yok + tüm pullar (kilitliler dahil) son bölgede */
export function canBearOff(state: GameState, p: Player): boolean {
  if (state.hand[p] > 0) return false;
  for (let i = 0; i < 24; i++) {
    if (inHomeZone(p, i)) continue;
    if (state.points[i].includes(p)) return false;
  }
  return true;
}

/**
 * Oyuncunun toplama kenarına en uzak SERBEST (en üstte, oynayabilir) pulunun
 * mesafesi. Kilitli pullar sayılmaz: zar en uzak serbest puldan büyükse o pul
 * toplanabilir (klasik tavla mantığı; kilitli pul toplamayı kilitlemesin).
 */
function maxMovableDistance(state: GameState, p: Player): number {
  let max = 0;
  for (let i = 0; i < 24; i++) {
    const st = state.points[i];
    if (st.length > 0 && st[st.length - 1] === p) {
      max = Math.max(max, distanceToOff(p, i));
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Oyun kurulumu ve tur akışı
// ---------------------------------------------------------------------------

export function newGame(starter: Player = 0): GameState {
  return {
    points: Array.from({ length: 24 }, () => []),
    hand: [TOTAL_CHECKERS, TOTAL_CHECKERS],
    borneOff: [0, 0],
    turn: starter,
    dice: [],
    rolled: null,
    winner: null,
  };
}

export function rollDice(state: GameState, d1: number, d2: number): GameState {
  const next = cloneState(state);
  next.rolled = [d1, d2];
  next.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  return next;
}

export function endTurn(state: GameState): GameState {
  const next = cloneState(state);
  next.turn = opponent(next.turn);
  next.dice = [];
  next.rolled = null;
  return next;
}

export function cloneState(state: GameState): GameState {
  return {
    points: state.points.map((s) => [...s]),
    hand: [...state.hand],
    borneOff: [...state.borneOff],
    turn: state.turn,
    dice: [...state.dice],
    rolled: state.rolled ? [...state.rolled] : null,
    winner: state.winner,
  };
}

// ---------------------------------------------------------------------------
// Hamle üretimi
// ---------------------------------------------------------------------------

/** Kalan zarlarla oynanabilecek ham hamleler (zorunluluk kuralları uygulanmadan) */
function rawMoves(state: GameState): Move[] {
  if (state.winner !== null) return [];
  const p = state.turn;
  const moves: Move[] = [];
  const seenDies = new Set<number>();

  for (const die of state.dice) {
    if (seenDies.has(die)) continue;
    seenDies.add(die);

    // 1) Yerleştirme: eldeki pulu kendi başlangıç bölgesine koy
    if (state.hand[p] > 0) {
      const to = entryPoint(p, die);
      if (canLand(state, p, to)) {
        moves.push({ type: 'place', die, to });
      }
    }

    // 2) İlerletme: en üstteki (serbest) pulu zar kadar götür
    for (let i = 0; i < 24; i++) {
      if (!topIsPlayers(state, p, i)) continue;
      const to = i + direction(p) * die;
      if (to >= 0 && to < 24 && canLand(state, p, to)) {
        moves.push({ type: 'move', die, from: i, to });
      }
    }

    // 3) Toplama
    if (canBearOff(state, p)) {
      const maxDist = maxMovableDistance(state, p);
      for (let i = 0; i < 24; i++) {
        if (!inHomeZone(p, i) || !topIsPlayers(state, p, i)) continue;
        const dist = distanceToOff(p, i);
        // Tam zar; ya da zar en uzak serbest puldan büyükse en uzaktaki serbest pul
        if (dist === die || (die > maxDist && dist === maxDist)) {
          moves.push({ type: 'bearoff', die, from: i });
        }
      }
    }
  }
  return moves;
}

/** Hamleyi uygular; zarı düşer, kazananı kontrol eder. Hamle sonrası yeni durum döner. */
export function applyMove(state: GameState, move: Move): GameState {
  const next = cloneState(state);
  const p = next.turn;

  const dieIdx = next.dice.indexOf(move.die);
  if (dieIdx === -1) throw new Error(`Zar ${move.die} elde yok`);
  next.dice.splice(dieIdx, 1);

  if (move.type === 'place') {
    if (next.hand[p] <= 0) throw new Error('Elde pul yok');
    next.hand[p]--;
    next.points[move.to].push(p);
  } else if (move.type === 'move') {
    const st = next.points[move.from];
    if (st[st.length - 1] !== p) throw new Error('En üstteki pul senin değil');
    st.pop();
    next.points[move.to].push(p);
  } else {
    const st = next.points[move.from];
    if (st[st.length - 1] !== p) throw new Error('En üstteki pul senin değil');
    st.pop();
    next.borneOff[p]++;
    if (next.borneOff[p] === TOTAL_CHECKERS) {
      next.winner = p;
      next.dice = [];
    }
  }
  return next;
}

function stateKey(state: GameState): string {
  return (
    state.points.map((s) => s.join('')).join(',') +
    '|' +
    state.dice.slice().sort().join('') +
    '|' +
    state.hand.join('-')
  );
}

/** Bu durumdan itibaren en fazla kaç zar oynanabilir? (erken çıkışlı arama) */
function maxUsable(state: GameState, memo: Map<string, number>): number {
  if (state.dice.length === 0 || state.winner !== null) return 0;
  const key = stateKey(state);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let best = 0;
  for (const m of rawMoves(state)) {
    const used = 1 + maxUsable(applyMove(state, m), memo);
    if (used > best) best = used;
    if (best === state.dice.length) break;
  }
  memo.set(key, best);
  return best;
}

/**
 * Oynanabilir hamleler. Klasik tavla zorunlulukları uygulanır:
 * - Mümkün olan en çok zar oynanmalıdır (bir hamle, kalan zarların
 *   oynanmasını gereksiz yere engelliyorsa oynanamaz).
 * - Zarlardan yalnızca biri oynanabiliyorsa büyük olan tercih edilmelidir.
 * Boş dizi = pas.
 */
export function legalMoves(state: GameState): Move[] {
  const memo = new Map<string, number>();
  const target = maxUsable(state, memo);
  if (target === 0) return [];

  let moves = rawMoves(state).filter(
    (m) => 1 + maxUsable(applyMove(state, m), memo) === target,
  );

  if (target === 1 && state.dice.length >= 2) {
    const dies = new Set(moves.map((m) => m.die));
    if (dies.size > 1) {
      const highest = Math.max(...dies);
      moves = moves.filter((m) => m.die === highest);
    }
  }
  return moves;
}

/** Tur bitti mi? (zar kalmadı ya da kalanlarla hamle yok) */
export function turnIsOver(state: GameState): boolean {
  if (state.winner !== null) return true;
  if (state.rolled === null) return false;
  return state.dice.length === 0 || legalMoves(state).length === 0;
}

// ---------------------------------------------------------------------------
// UI yardımcıları
// ---------------------------------------------------------------------------

export interface MoveSource {
  kind: 'hand' | 'point';
  point?: number;
}

/** Seçilebilir hamle kaynakları (eldeki pul ya da tahtadaki hane) */
export function moveSources(state: GameState): MoveSource[] {
  const sources: MoveSource[] = [];
  const points = new Set<number>();
  let hand = false;
  for (const m of legalMoves(state)) {
    if (m.type === 'place') hand = true;
    else points.add(m.from);
  }
  if (hand) sources.push({ kind: 'hand' });
  for (const pt of points) sources.push({ kind: 'point', point: pt });
  return sources;
}

/** Seçilen kaynaktan oynanabilecek hamleler */
export function movesFrom(state: GameState, source: MoveSource): Move[] {
  return legalMoves(state).filter((m) =>
    source.kind === 'hand'
      ? m.type === 'place'
      : m.type !== 'place' && m.from === source.point,
  );
}

/**
 * Bir kaynaktan AYNI pulla ulaşılabilen tüm hedefler; ardışık zar
 * kombinasyonları dahil (6-4 → +6, +4 ve +10; çiftte 4 adıma kadar).
 * Her hedef için oynanacak hamle dizisi verilir; en kısa dizi tercih edilir.
 */
export interface DestOption {
  dest: number | 'off';
  moves: Move[];
}

export function destinationOptions(
  state: GameState,
  source: MoveSource,
): DestOption[] {
  const best = new Map<number | 'off', Move[]>();

  function add(dest: number | 'off', seq: Move[]) {
    const cur = best.get(dest);
    if (!cur || seq.length < cur.length) best.set(dest, seq);
  }

  function walk(s: GameState, src: MoveSource, seq: Move[]) {
    for (const m of movesFrom(s, src)) {
      const nseq = [...seq, m];
      if (m.type === 'bearoff') {
        add('off', nseq);
        continue;
      }
      add(m.to, nseq);
      // Aynı pul kalan zarlarla devam edebilir
      walk(applyMove(s, m), { kind: 'point', point: m.to }, nseq);
    }
  }

  walk(state, source, []);
  return [...best.entries()].map(([dest, moves]) => ({ dest, moves }));
}

export function randomDie(): number {
  // Test kancası: globalThis.__DICE__ dizisi doluysa zarlar oradan çekilir
  const forced = (globalThis as { __DICE__?: number[] }).__DICE__;
  if (forced && forced.length > 0) return forced.shift()!;
  return 1 + Math.floor(Math.random() * 6);
}
