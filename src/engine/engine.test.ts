import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canBearOff,
  canLand,
  cloneState,
  destinationOptions,
  endTurn,
  entryPoint,
  legalMoves,
  moveSources,
  movesFrom,
  newGame,
  rollDice,
  turnIsOver,
  TOTAL_CHECKERS,
} from './index';
import type { GameState, Move, Player } from './types';

/** Test kurulumu: hanelere kule dizerek durum oluştur */
function setup(
  overrides: Partial<GameState> & { stacks?: Record<number, Player[]> } = {},
): GameState {
  const { stacks, ...rest } = overrides;
  const state = newGame();
  if (stacks) {
    for (const [pt, stack] of Object.entries(stacks)) {
      state.points[Number(pt)] = [...stack];
    }
    // Eldeki pul sayısını tahtadakilere göre düşür
    for (const p of [0, 1] as Player[]) {
      const onBoard = state.points.flat().filter((c) => c === p).length;
      state.hand[p] = TOTAL_CHECKERS - onBoard;
    }
  }
  return { ...state, ...rest };
}

function find(moves: Move[], pred: (m: Move) => boolean): Move | undefined {
  return moves.find(pred);
}

describe('yerleştirme fazı', () => {
  it('boş tahtada 5-2 ile iki yerleştirme ya da koy+ilerlet oynanabilir', () => {
    let state = setup({ turn: 0 });
    state = rollDice(state, 5, 2);
    const moves = legalMoves(state);

    // Beyaz için 5 → hane indeksi 4, 2 → hane indeksi 1
    expect(find(moves, (m) => m.type === 'place' && m.to === 4)).toBeTruthy();
    expect(find(moves, (m) => m.type === 'place' && m.to === 1)).toBeTruthy();

    // 5'e koyduktan sonra o pul 2 ilerleyebilmeli (4 → 6)
    const afterPlace = applyMove(state, { type: 'place', die: 5, to: 4 });
    const then = legalMoves(afterPlace);
    expect(
      find(then, (m) => m.type === 'move' && m.from === 4 && m.to === 6),
    ).toBeTruthy();
  });

  it('siyah kendi bölgesine (23-18) yerleştirir ve azalan yönde ilerler', () => {
    let state = setup({ turn: 1 });
    state = rollDice(state, 6, 3);
    const moves = legalMoves(state);
    expect(entryPoint(1, 6)).toBe(18);
    expect(find(moves, (m) => m.type === 'place' && m.to === 18)).toBeTruthy();
    expect(find(moves, (m) => m.type === 'place' && m.to === 21)).toBeTruthy();

    const after = applyMove(state, { type: 'place', die: 6, to: 18 });
    expect(
      find(legalMoves(after), (m) => m.type === 'move' && m.from === 18 && m.to === 15),
    ).toBeTruthy();
  });

  it('tahtada pulu varken yerleştirme zorunlu değildir, sadece ilerletebilir', () => {
    let state = setup({ turn: 0, stacks: { 10: [0] } });
    state = rollDice(state, 3, 1);
    const moves = legalMoves(state);
    expect(find(moves, (m) => m.type === 'move' && m.from === 10)).toBeTruthy();
    expect(find(moves, (m) => m.type === 'place')).toBeTruthy();
  });

  it('çift zar 4 hamle verir: 3 pul koyup dördüncüyü ilerletmek mümkün', () => {
    let state = setup({ turn: 0 });
    state = rollDice(state, 4, 4);
    expect(state.dice).toEqual([4, 4, 4, 4]);

    state = applyMove(state, { type: 'place', die: 4, to: 3 });
    state = applyMove(state, { type: 'place', die: 4, to: 3 });
    state = applyMove(state, { type: 'place', die: 4, to: 3 });
    expect(state.points[3]).toEqual([0, 0, 0]);

    const moves = legalMoves(state);
    expect(
      find(moves, (m) => m.type === 'move' && m.from === 3 && m.to === 7),
    ).toBeTruthy();
  });

  it('6-6 ile tek pulu koyup 3 kez ilerletip rakibin üstüne oturabilir', () => {
    // Rakip tek pul beyazın yolunda: 5 + 6 + 6 + 6 = indeks 23... kullanalım: giriş 5, sonra 11, 17, 23
    let state = setup({ turn: 0, stacks: { 23: [1] } });
    state = rollDice(state, 6, 6);
    state = applyMove(state, { type: 'place', die: 6, to: 5 });
    state = applyMove(state, { type: 'move', die: 6, from: 5, to: 11 });
    state = applyMove(state, { type: 'move', die: 6, from: 11, to: 17 });
    state = applyMove(state, { type: 'move', die: 6, from: 17, to: 23 });
    expect(state.points[23]).toEqual([1, 0]); // siyah altta kilitli, beyaz üstte
  });
});

describe('kilitleme ve kule kuralları', () => {
  it('tek rakip pulunun üstüne oturulur, 2+ rakip kapalıdır', () => {
    const state = setup({ turn: 0, stacks: { 10: [1], 11: [1, 1] } });
    expect(canLand(state, 0, 10)).toBe(true);
    expect(canLand(state, 0, 11)).toBe(false);
  });

  it('kilitli pul oynayamaz, sadece en üstteki oynar', () => {
    let state = setup({ turn: 0, stacks: { 10: [0, 1] } }); // beyaz altta kilitli
    state = rollDice(state, 3, 2);
    const moves = legalMoves(state);
    expect(find(moves, (m) => m.type === 'move' && m.from === 10)).toBeFalsy();
  });

  it('üstündeki pul gidince alttaki serbest kalır', () => {
    let state = setup({ turn: 1, stacks: { 10: [0, 1] } });
    state = rollDice(state, 3, 2);
    state = applyMove(state, { type: 'move', die: 3, from: 10, to: 7 });
    expect(state.points[10]).toEqual([0]);

    let white = endTurn(state);
    white = rollDice(white, 4, 1);
    expect(
      find(legalMoves(white), (m) => m.type === 'move' && m.from === 10),
    ).toBeTruthy();
  });

  it('zincirleme kilit: B,S kulesindeki tek siyahın üstüne beyaz oturabilir', () => {
    let state = setup({ turn: 0, stacks: { 10: [0, 1], 7: [0] } });
    state = rollDice(state, 3, 5);
    const move = find(
      legalMoves(state),
      (m) => m.type === 'move' && m.from === 7 && m.to === 10,
    );
    expect(move).toBeTruthy();
    state = applyMove(state, move!);
    expect(state.points[10]).toEqual([0, 1, 0]);
  });

  it('zincir devam eder: B,S,B kulesinin üstüne siyah da oturabilir', () => {
    const state = setup({ turn: 1, stacks: { 10: [0, 1, 0] } });
    expect(canLand(state, 1, 10)).toBe(true);
  });

  it('kilit takviyesi: en üstte aynı renkten 2 pul olunca hane rakibe kapanır', () => {
    // B,S,S: beyaz alttaki pulunu kurtaramaz, haneye de giremez
    const state = setup({ turn: 0, stacks: { 10: [0, 1, 1], 7: [0] } });
    expect(canLand(state, 0, 10)).toBe(false);
  });

  it('kendi pullarının üstüne sınırsız eklenebilir', () => {
    const state = setup({ turn: 0, stacks: { 10: [0, 0, 0, 0, 0] } });
    expect(canLand(state, 0, 10)).toBe(true);
  });

  it('yerleştirme sırasında da kilitleme yapılır, kapalı haneye yerleştirilemez', () => {
    let state = setup({ turn: 0, stacks: { 2: [1], 4: [1, 1] } });
    state = rollDice(state, 3, 5);
    const moves = legalMoves(state);
    expect(find(moves, (m) => m.type === 'place' && m.to === 2)).toBeTruthy(); // 3 zarı: kilitler
    expect(find(moves, (m) => m.type === 'place' && m.to === 4)).toBeFalsy(); // 5 zarı: kapalı
  });
});

describe('pas ve zar zorunlulukları', () => {
  it('hiç hamle yoksa pas (legalMoves boş, turnIsOver true)', () => {
    // Beyazın tek serbest pulu yok: tümü kilitli, el boş, gidilecek yerler kapalı
    let state = setup({
      turn: 0,
      stacks: {
        0: [0, 1, 1],
        1: [1, 1],
        2: [1, 1],
      },
    });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 1, 2);
    expect(legalMoves(state)).toEqual([]);
    expect(turnIsOver(state)).toBe(true);
  });

  it('iki zarı da oynamak mümkünse tek zarla yetinilemez', () => {
    // Beyaz: elde pul yok, 10'da tek pul. 6-1 atıldı.
    // 10→16 (6) sonrası 16→17 (1) açık; 10→11 (1) sonrası 11→17 (6) kapalı olsun.
    let state = setup({
      turn: 0,
      stacks: { 10: [0], 16: [], 17: [1, 1] },
    });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 6, 1);
    const moves = legalMoves(state);
    // 1 zarıyla 10→11 oynanırsa 6 (11→17 kapalı) oynanamaz → bu hamle yasak
    expect(find(moves, (m) => m.type === 'move' && m.to === 11)).toBeFalsy();
    expect(find(moves, (m) => m.type === 'move' && m.to === 16)).toBeTruthy();
  });

  it('yalnızca bir zar oynanabiliyorsa büyük zar tercih edilir', () => {
    // Beyaz elde pul yok, 10'da tek pul; 11 ve 16 kapalı değil ama
    // ikisi birden oynanamasın: 6 sonrası 1 kapalı, 1 sonrası 6 kapalı yapalım.
    let state = setup({
      turn: 0,
      stacks: { 10: [0], 11: [1, 1], 17: [1, 1], 16: [] },
    });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    // 6: 10→16 açık; ardından 1: 16→17 kapalı → tek zar oynanabiliyor
    // 1: 10→11 kapalı zaten → sadece 6 oynanabilir
    state = rollDice(state, 6, 1);
    const moves = legalMoves(state);
    expect(moves.every((m) => m.die === 6)).toBe(true);
  });
});

describe('toplama ve kazanma', () => {
  it('elde pul ya da bölge dışında pul (kilitli dahil) varken toplanamaz', () => {
    const inHand = setup({ turn: 0, stacks: { 20: [0] } });
    expect(canBearOff(inHand, 0)).toBe(false); // elde 14 pul var

    const outside = setup({ turn: 0, stacks: { 10: [0, 1], 20: [0] } });
    outside.hand[0] = 0;
    outside.borneOff[0] = TOTAL_CHECKERS - 2;
    expect(canBearOff(outside, 0)).toBe(false); // 10'daki kilitli pul bölge dışında
  });

  it('zar değerine göre toplanır, kilitli pul toplanamaz', () => {
    let state = setup({ turn: 0, stacks: { 20: [0, 1], 21: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 2;
    state = rollDice(state, 4, 3);
    const moves = legalMoves(state);
    // 21 → mesafe 3 → 3 zarıyla toplanır
    expect(find(moves, (m) => m.type === 'bearoff' && m.from === 21)).toBeTruthy();
    // 20 kilitli (üstünde siyah var) → 4 ile toplanamaz
    expect(find(moves, (m) => m.type === 'bearoff' && m.from === 20)).toBeFalsy();
  });

  it('zar en uzak puldan büyükse en uzaktaki serbest pul toplanır', () => {
    let state = setup({ turn: 0, stacks: { 21: [0], 22: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 2;
    state = rollDice(state, 6, 5);
    const moves = legalMoves(state);
    // En uzak: 21 (mesafe 3). 6 ve 5 > 3 → 21 toplanabilir
    expect(
      find(moves, (m) => m.type === 'bearoff' && m.from === 21 && m.die === 6),
    ).toBeTruthy();
    // 22 (mesafe 2) en uzak değil → büyük zarla toplanamaz
    expect(
      find(moves, (m) => m.type === 'bearoff' && m.from === 22),
    ).toBeFalsy();
  });

  it('son pul toplanınca oyun biter', () => {
    let state = setup({ turn: 0, stacks: { 23: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 1, 2);
    state = applyMove(state, { type: 'bearoff', die: 1, from: 23 });
    expect(state.winner).toBe(0);
    expect(turnIsOver(state)).toBe(true);
  });

  it('siyah kendi bölgesinden (0-5) toplar', () => {
    let state = setup({ turn: 1, stacks: { 2: [1] } });
    state.hand[1] = 0;
    state.borneOff[1] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 3, 6);
    const moves = legalMoves(state);
    // Son pul: tek zar oynanabildiğinden büyük zar (6) dayatılır, 3 < mesafe... 6 > 3 → en uzak serbest pul toplanır
    expect(
      find(moves, (m) => m.type === 'bearoff' && m.from === 2),
    ).toBeTruthy();
  });
});

describe('kombine zar hedefleri (destinationOptions)', () => {
  it('6-4 atınca aynı pul için +4, +6 ve +10 hedefleri sunulur', () => {
    let state = setup({ turn: 0, stacks: { 8: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 6, 4);
    const dests = destinationOptions(state, { kind: 'point', point: 8 }).map(
      (o) => o.dest,
    );
    expect(dests).toContain(12); // +4
    expect(dests).toContain(14); // +6
    expect(dests).toContain(18); // +10
  });

  it('kombine hedefin ara durağı kapalıysa diğer sıra denenir', () => {
    // 8+6=14 kapalı, 8+4=12 açık → +10 hedefi 4-sonra-6 yoluyla bulunmalı
    let state = setup({ turn: 0, stacks: { 8: [0], 14: [1, 1] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 6, 4);
    const opts = destinationOptions(state, { kind: 'point', point: 8 });
    const to18 = opts.find((o) => o.dest === 18);
    expect(to18).toBeTruthy();
    expect(to18!.moves.map((m) => m.die)).toEqual([4, 6]);
    expect(opts.some((o) => o.dest === 14)).toBe(false); // kapalı hane hedef değil
  });

  it('1-1 çiftinde aynı pul 4 adıma kadar ilerleyebilir', () => {
    let state = setup({ turn: 0, stacks: { 8: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 1, 1);
    const dests = destinationOptions(state, { kind: 'point', point: 8 }).map(
      (o) => o.dest,
    );
    expect(dests).toEqual(expect.arrayContaining([9, 10, 11, 12]));
  });

  it('elden yerleştir + ilerlet kombinasyonu da hedeflenir', () => {
    let state = setup({ turn: 0 });
    state = rollDice(state, 5, 2);
    const opts = destinationOptions(state, { kind: 'hand' });
    const dests = opts.map((o) => o.dest);
    expect(dests).toContain(4); // 5'e koy
    expect(dests).toContain(1); // 2'ye koy
    expect(dests).toContain(6); // 5'e koy + 2 ilerlet (veya 2'ye koy + 5)
    const to6 = opts.find((o) => o.dest === 6)!;
    expect(to6.moves[0].type).toBe('place');
    expect(to6.moves.length).toBe(2);
  });

  it('hedef dizisi uygulanınca pul kombine hedefe ulaşır', () => {
    let state = setup({ turn: 0, stacks: { 8: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 1;
    state = rollDice(state, 6, 4);
    const to18 = destinationOptions(state, { kind: 'point', point: 8 }).find(
      (o) => o.dest === 18,
    )!;
    for (const m of to18.moves) state = applyMove(state, m);
    expect(state.points[18]).toEqual([0]);
    expect(state.dice).toEqual([]);
  });
});

describe('toplama: kilitli pul engel olmaz (klasik mantık)', () => {
  it('zar, serbest en uzak puldan büyükse kilitli daha uzak pul olsa da toplanır', () => {
    // Beyaz: idx19'da kilitli (dist 5, üstünde siyah), idx20 serbest (dist 4)
    let state = setup({ turn: 0, stacks: { 19: [0, 1], 20: [0] } });
    state.hand[0] = 0;
    state.borneOff[0] = TOTAL_CHECKERS - 2;
    state = rollDice(state, 5, 5);
    const moves = legalMoves(state);
    expect(
      moves.find((m) => m.type === 'bearoff' && m.from === 20),
    ).toBeTruthy();
  });

  it('1-4 hanelerinde pul varken 5-5 ile en uzaktakiler sırayla toplanır', () => {
    // Siyah: idx 0,1,2,3 (dist 1..4), 5-5 → 4 kez en uzaktan toplanmalı
    let state = setup({ turn: 1, stacks: { 0: [1], 1: [1], 2: [1], 3: [1] } });
    state.hand[1] = 0;
    state.borneOff[1] = TOTAL_CHECKERS - 4;
    state = rollDice(state, 5, 5);
    for (let k = 0; k < 4; k++) {
      const moves = legalMoves(state);
      const bo = moves.find((m) => m.type === 'bearoff');
      expect(bo).toBeTruthy();
      state = applyMove(state, bo!);
    }
    expect(state.winner).toBe(1);
  });
});

describe('UI yardımcıları', () => {
  it('moveSources el ve haneleri doğru listeler', () => {
    let state = setup({ turn: 0, stacks: { 10: [0] } });
    state = rollDice(state, 3, 2);
    const sources = moveSources(state);
    expect(sources.some((s) => s.kind === 'hand')).toBe(true);
    expect(sources.some((s) => s.kind === 'point' && s.point === 10)).toBe(true);

    const fromHand = movesFrom(state, { kind: 'hand' });
    expect(fromHand.every((m) => m.type === 'place')).toBe(true);
    const fromPoint = movesFrom(state, { kind: 'point', point: 10 });
    expect(fromPoint.every((m) => m.type === 'move' && m.from === 10)).toBe(true);
  });

  it('cloneState bağımsız kopya üretir', () => {
    const state = setup({ stacks: { 5: [0, 1] } });
    const copy = cloneState(state);
    copy.points[5].push(0);
    copy.hand[0] = 0;
    expect(state.points[5]).toEqual([0, 1]);
    expect(state.hand[0]).toBe(TOTAL_CHECKERS - 1);
  });
});
