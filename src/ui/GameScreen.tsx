import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyMove,
  destinationOptions,
  endTurn,
  legalMoves,
  moveSources,
  movesFrom,
  newGame,
  randomDie,
  rollDice,
  topRun,
  TOTAL_CHECKERS,
} from '../engine';
import type { DestOption, GameState, Move, MoveSource, Player } from '../engine';
import { chooseMove } from '../engine/ai';
import { play } from '../sound';
import { loadProfile, recordAiResult, recordOnlineResult } from '../profile';
import {
  abandonGame,
  pushState,
  subscribeGame,
} from '../online/match';
import type { Seat } from '../online/match';
import { BoardSvg, boardGeometry } from './BoardSvg';
import { Die } from './Dice';
import { getTheme } from './themes';
import { colors, PLAYER_NAMES } from './theme';

type Phase = 'opening' | 'playing' | 'over';

export interface OnlineCtx {
  gameId: string;
  seat: Player;
  uid: string;
  opponent: Seat;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragInfo {
  source: MoveSource | null;
  /** Basılan hane seçili kaynağın hedefiyse: bırakınca uygulanacak hamle dizisi */
  pending: DestOption | null;
  moved: boolean;
  wasSelected: boolean;
}

export type GameMode = 'pvp' | 'ai' | 'online';

interface Props {
  mode: GameMode;
  /** Seri uzunluğu: 1, 3 veya 5 oyun (online'da 1) */
  matchLen: number;
  /** Online oyun bağlamı (sadece mode === 'online') */
  online?: OnlineCtx;
  onExit: () => void;
}

/** AI her zaman Siyah (oyuncu 1) olarak oynar */
const AI_PLAYER: Player = 1;
const EMPTY_POINTS: ReadonlySet<number> = new Set();

/** Bir hamle dizisi için uygun ses efektini seçer (kilitleme > toplama > koyma > ilerletme) */
function moveSound(prev: GameState, moves: Move[]): 'lock' | 'place' | 'move' {
  let s = prev;
  let lock = false;
  let place = false;
  for (const m of moves) {
    if (m.type !== 'bearoff') {
      const run = topRun(s.points[m.to]);
      if (run && run.player !== s.turn && run.count === 1) lock = true;
      if (m.type === 'place') place = true;
    }
    s = applyMove(s, m);
  }
  return lock ? 'lock' : place ? 'place' : 'move';
}
/** Tur süresi (sn); test kancası ile değiştirilebilir */
const TURN_SECONDS =
  (globalThis as { __TURN_SECONDS__?: number }).__TURN_SECONDS__ ?? 30;

export function GameScreen({ mode, matchLen, online, onExit }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isOnline = mode === 'online' && !!online;
  const mySeat: Player = online?.seat ?? 0;
  const [phase, setPhase] = useState<Phase>(isOnline ? 'playing' : 'opening');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [oppInfo, setOppInfo] = useState<Seat>(
    online?.opponent ?? { uid: '', name: 'Rakip', avatar: '🙂' },
  );
  const [opening, setOpening] = useState<{ w: number; b: number } | null>(null);
  const [game, setGame] = useState<GameState>(() => newGame());
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<MoveSource | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  /** Zar atılınca ortada beliren popup */
  const [rollPopup, setRollPopup] = useState<{
    dice: [number, number];
    player: Player;
    key: number;
  } | null>(null);
  /** AI'nın oynamak üzere olduğu hamlenin vurgusu */
  const [aiPreview, setAiPreview] = useState<{
    src: MoveSource;
    dest: number | 'off';
  } | null>(null);
  /** Hamle yapılamadığında gösterilen uyarı */
  const [noMovePopup, setNoMovePopup] = useState<string | null>(null);
  const recordedRef = useRef(false);
  /** Seri skoru [Beyaz, Siyah] ve oyun sırası */
  const [series, setSeries] = useState<[number, number]>([0, 0]);
  const [gameNo, setGameNo] = useState(1);
  const seriesRecordedRef = useRef(false);
  /** Seriyi kazanmak için gereken galibiyet */
  const target = Math.floor(matchLen / 2) + 1;
  /** Kullanıcı adı ve avatarı (Beyaz'ın etiketi için) */
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [themeId, setThemeId] = useState('classic');
  /** Tur süresi geri sayımı */
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  /** Oyun duraklatıldı mı? (süre ve AI durur) */
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setProfileName(p.name);
      setProfileAvatar(p.avatar);
      // Pro değilse seçili tema kilitliyse klasiğe düş
      const t = getTheme(p.theme);
      setThemeId(t.pro && !p.isPro ? 'classic' : t.id);
    });
  }, []);

  function nameFor(p: Player): string {
    if (isOnline && online) {
      const meName = profileName || 'Sen';
      const opName = oppInfo.name || 'Rakip';
      if (p === mySeat) return `${profileAvatar || ''} ${meName} (Sen)`.trim();
      return `${oppInfo.avatar || ''} ${opName}`.trim();
    }
    if (p === 0) {
      const av = profileAvatar ? `${profileAvatar} ` : '';
      return profileName ? `${av}Beyaz (${profileName})` : `${av}Beyaz`;
    }
    return mode === 'ai' ? 'Siyah (Bilgisayar)' : 'Siyah';
  }

  /** Skorboard için koltuk bilgisi (kısa) */
  function seatInfo(p: Player): { avatar: string; name: string } {
    if (isOnline && online) {
      if (p === mySeat)
        return { avatar: profileAvatar || '⚪', name: `${profileName || 'Sen'} (Sen)` };
      return {
        avatar: oppInfo.avatar || '⚫',
        name: oppInfo.name || 'Rakip',
      };
    }
    if (p === 0)
      return { avatar: profileAvatar || '⚪', name: profileName || 'Beyaz' };
    return {
      avatar: mode === 'ai' ? '🤖' : '⚫',
      name: mode === 'ai' ? 'Bilgisayar' : 'Siyah',
    };
  }

  // --- Boyutlar (çentik/safe-area dahil, küçük ekranlara sığacak şekilde) ---
  const portrait = height > width;
  const pad = 6;
  const gap = 6;
  const padL = pad + insets.left;
  const padR = pad + insets.right;
  const padT = pad + insets.top;
  const padB = pad + insets.bottom;
  const bannerH = portrait ? 56 : 42; // skorboard başlık
  // Dikeyde paneller üstte/altta yatay şerit, yatayda solda/sağda dikey sütun
  const panelW = Math.max(92, Math.min(width * 0.15, 140));
  const panelH = Math.max(64, Math.min(height * 0.11, 92));
  const boardW = portrait
    ? width - padL - padR
    : width - padL - padR - panelW * 2 - gap * 2;
  const boardH = portrait
    ? height - padT - padB - bannerH - panelH * 2 - gap * 2
    : height - padT - padB - bannerH - gap;
  const themeLayout = getTheme(themeId).layout;
  const geo = boardGeometry(boardW, boardH, themeLayout);

  const legal = useMemo(
    () => (phase === 'playing' && game.rolled ? legalMoves(game) : []),
    [game, phase],
  );
  const sources = useMemo(
    () => (phase === 'playing' && game.rolled ? moveSources(game) : []),
    [game, phase],
  );
  const sourcePointSet = useMemo(
    () =>
      new Set(
        sources.filter((s) => s.kind === 'point').map((s) => s.point as number),
      ),
    [sources],
  );
  const handIsSource = sources.some((s) => s.kind === 'hand');

  // Seçili kaynaktan ulaşılabilen tüm hedefler (zar kombinasyonları dahil)
  const selectedOptions = useMemo(
    () => (selected ? destinationOptions(game, selected) : []),
    [game, selected],
  );
  const destPointSet = useMemo(
    () =>
      new Set(
        selectedOptions
          .filter((o) => o.dest !== 'off')
          .map((o) => o.dest as number),
      ),
    [selectedOptions],
  );
  const offOption = selectedOptions.find((o) => o.dest === 'off');

  const aiTurn =
    mode === 'ai' &&
    phase === 'playing' &&
    game.turn === AI_PLAYER &&
    game.winner === null;

  // Online'da rakibin turu: tahta salt-okunur, hamleler snapshot ile gelir
  const opponentTurn =
    isOnline && phase === 'playing' && game.turn !== mySeat && game.winner === null;
  // Girişin kilitli olduğu her durum (AI ya da online rakip sırası)
  const inputLocked = aiTurn || opponentTurn;

  // PanResponder'lar bir kez kurulur; güncel duruma ref üzerinden erişirler
  const ui = useRef({
    phase,
    game,
    selected,
    selectedOptions,
    offOption,
    sourcePointSet,
    destPointSet,
    handIsSource,
    geo,
    aiTurn,
    inputLocked,
    paused,
  });
  ui.current = {
    phase,
    game,
    selected,
    selectedOptions,
    offOption,
    sourcePointSet,
    destPointSet,
    handIsSource,
    geo,
    aiTurn,
    inputLocked,
    paused,
  };

  // Tahtanın pencere içi konumu kendi yerleşimimizden bilinir
  // (measureInWindow web'de çalışmadığı için hesapla)
  const boardOrigin = portrait
    ? { x: padL, y: padT + bannerH + panelH + gap }
    : { x: padL + panelW + gap, y: padT + bannerH };
  const boardOriginRef = useRef(boardOrigin);
  boardOriginRef.current = boardOrigin;
  const offRects = useRef<[Rect | null, Rect | null]>([null, null]);
  const dragRef = useRef<DragInfo | null>(null);

  /** Durumu uygula; online ise Firestore'a da yaz */
  function commit(next: GameState) {
    setGame(next);
    if (isOnline && online) {
      pushState(online.gameId, online.uid, next).catch(() => {});
    }
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;

  /** Bir hedef seçeneğini (tek hamle ya da kombine dizi) tek geri-alma adımı olarak uygula */
  function doApplyOption(option: DestOption) {
    setUndoStack((s) => (isOnline ? s : [...s, ui.current.game]));
    play(moveSound(ui.current.game, option.moves));
    let next = ui.current.game;
    for (const m of option.moves) next = applyMove(next, m);
    commit(next);
    // Elden art arda yerleştirme akıcı olsun: el hâlâ kaynaksa seçili kalsın
    if (
      option.moves[0].type === 'place' &&
      movesFrom(next, { kind: 'hand' }).length > 0
    ) {
      setSelected({ kind: 'hand' });
    } else {
      setSelected(null);
    }
  }
  const doApplyRef = useRef(doApplyOption);
  doApplyRef.current = doApplyOption;

  /** Sürükleme bırakıldığında hedefi bul ve hamleyi uygula (yakın haneye oturtma dahil) */
  function handleDrop(pageX: number, pageY: number, source: MoveSource) {
    const u = ui.current;
    const opts = destinationOptions(u.game, source);
    const g = u.geo;
    const bw = g.innerW + 2 * g.fp;
    const bh = g.innerH + 2 * g.fp;
    const local = {
      x: Math.min(Math.max(pageX - boardOriginRef.current.x, 0), bw),
      y: Math.min(Math.max(pageY - boardOriginRef.current.y, 0), bh),
    };
    const pt = g.pointAt(local.x, local.y);
    const direct = pt !== null ? opts.find((o) => o.dest === pt) : undefined;
    if (direct) {
      doApplyRef.current(direct);
      return;
    }
    // Kaynağın üstüne geri bırakma = vazgeçme
    if (source.kind === 'point' && pt === source.point) return;
    // Tam üstüne denk gelmediyse: en yakın geçerli hedefe "mıknatıs" gibi oturt
    let best: DestOption | null = null;
    let bestDist = Infinity;
    for (const o of opts) {
      if (o.dest === 'off') continue;
      const pg = g.pointGeom(o.dest as number);
      // Bırakılan nokta hedefin yarısında mı? (alt sıra hedefi için alt yarı vb.)
      const sideOk = pg.dy < 0 ? local.y > bh * 0.4 : local.y < bh * 0.6;
      if (!sideOk) continue;
      const dist = Math.abs(local.x - pg.bx);
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    if (best && bestDist < g.pw * 1.2) {
      doApplyRef.current(best);
      return;
    }
    // Tahta dışına bırakma: toplama mümkünse topla ("Toplanan" kutusu ölçülebildiyse
    // sadece kutu üstünde, ölçülemediyse (web) tahta dışı yeterli)
    const off = opts.find((o) => o.dest === 'off');
    if (!off) return;
    const rect = offRects.current[u.game.turn];
    if (
      !rect ||
      (pageX >= rect.x &&
        pageX <= rect.x + rect.w &&
        pageY >= rect.y &&
        pageY <= rect.y + rect.h)
    ) {
      doApplyRef.current(off);
    }
  }

  /** Tahta üzerinde dokunma + sürükleme */
  const boardPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        const u = ui.current;
        return (
          u.phase === 'playing' &&
          u.game.rolled !== null &&
          !u.inputLocked &&
          !u.paused
        );
      },
      onPanResponderGrant: (evt) => {
        const u = ui.current;
        const { locationX, locationY, pageX, pageY } = evt.nativeEvent;
        const pt = u.geo.pointAt(locationX, locationY);
        dragRef.current = null;
        if (pt === null) {
          // Bar üzerindeki el destesine mi basıldı?
          const zone = u.geo.barZoneAt(locationX, locationY);
          if (zone !== null && zone === u.game.turn && u.handIsSource) {
            dragRef.current = {
              source: { kind: 'hand' },
              pending: null,
              moved: false,
              wasSelected: u.selected?.kind === 'hand',
            };
            setSelected({ kind: 'hand' });
            setDragPos({ x: pageX, y: pageY });
            return;
          }
          setSelected(null);
          return;
        }
        const isSelectedPoint =
          u.selected?.kind === 'point' && u.selected.point === pt;
        // Seçili kaynağın hedefi mi? (bırakınca uygulanır)
        const pending =
          u.selected && u.destPointSet.has(pt) && !isSelectedPoint
            ? (u.selectedOptions.find((o) => o.dest === pt) ?? null)
            : null;
        const isSource = u.sourcePointSet.has(pt);
        if (!pending && !isSource) {
          setSelected(null);
          return;
        }
        dragRef.current = {
          source: isSource ? { kind: 'point', point: pt } : null,
          pending,
          moved: false,
          wasSelected: isSelectedPoint,
        };
        // Hedef değilse basar basmaz seç ve pulu "kaldır" (parmağa yapışsın)
        if (isSource && !pending) {
          setSelected({ kind: 'point', point: pt });
          setDragPos({ x: pageX, y: pageY });
        }
      },
      onPanResponderMove: (_evt, gs) => {
        const d = dragRef.current;
        if (!d || !d.source) return;
        if (!d.moved && Math.abs(gs.dx) + Math.abs(gs.dy) > 5) {
          d.moved = true;
          if (d.source.kind === 'point') setSelected(d.source);
        }
        setDragPos({ x: gs.moveX, y: gs.moveY });
      },
      onPanResponderRelease: (_evt, gs) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragPos(null);
        if (!d) return;
        if (d.moved && d.source) {
          handleDrop(gs.moveX, gs.moveY, d.source);
          return;
        }
        // Dokunma: hedefse hamleyi uygula
        if (d.pending) {
          doApplyRef.current(d.pending);
          return;
        }
        // Seçili pula ikinci dokunuş: toplanabiliyorsa topla, değilse seçimi bırak
        if (d.wasSelected) {
          const off = ui.current.offOption;
          if (off) doApplyRef.current(off);
          else setSelected(null);
        }
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPos(null);
      },
    }),
  ).current;

  // Tur sonu: tüm zarlar oynandıysa kısa bekleme sonrası sıra geçer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (game.winner !== null) {
      setPhase('over');
      return;
    }
    // Online'da yalnızca kendi turumu sonlandırırım; rakibinki snapshot ile gelir
    if (opponentTurn) return;
    if (game.rolled && game.dice.length === 0 && !paused) {
      const t = setTimeout(() => {
        commit(endTurn(ui.current.game));
        setUndoStack([]);
        setSelected(null);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [game, phase, paused, opponentTurn]);

  // Tek kaynak varsa otomatik seç (örn. ilk turlarda sadece "el" oynanabilir)
  useEffect(() => {
    if (
      phase === 'playing' &&
      game.rolled &&
      !selected &&
      sources.length === 1 &&
      !inputLocked
    ) {
      setSelected(sources[0]);
    }
  }, [game, phase, selected, sources, inputLocked]);

  // Online: Firestore snapshot'larını dinle; rakip hamlesi/ayrılması geldiğinde uygula
  useEffect(() => {
    if (!isOnline || !online) return;
    let lastRolled: string | null = null;
    const unsub = subscribeGame(online.gameId, (remote, docData) => {
      // Rakip bilgisini canlı güncelle
      const opp = docData.seats[String(1 - mySeat)];
      if (opp && opp.name) setOppInfo(opp);
      if (docData.status === 'abandoned' && docData.updatedBy !== online.uid) {
        setOpponentLeft(true);
        return;
      }
      // Yalnızca rakibin yazdığı güncellemeleri uygula (kendi yazdığımı değil)
      if (docData.updatedBy === online.uid) return;
      setGame(remote);
      setUndoStack([]);
      setSelected(null);
      // Rakip zar attıysa popup göster
      const rk = remote.rolled ? remote.rolled.join(',') : null;
      if (rk && rk !== lastRolled && remote.dice.length > 0) {
        setRollPopup({
          dice: remote.rolled!,
          player: remote.turn,
          key: Date.now(),
        });
      }
      lastRolled = rk;
    });
    return unsub;
  }, [isOnline, online]);

  // AI (Bilgisayar) turu: zar at → hamleyi önce vurgula, sonra oyna
  // (hamle yoksa aşağıdaki otomatik pas akışı devreye girer)
  useEffect(() => {
    if (!aiTurn || paused) return;
    let t: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout> | undefined;
    if (game.rolled === null) {
      t = setTimeout(() => {
        const d1 = randomDie();
        const d2 = randomDie();
        play('dice');
        setGame(rollDice(game, d1, d2));
        setRollPopup({ dice: [d1, d2], player: AI_PLAYER, key: Date.now() });
        setUndoStack([]);
        setSelected(null);
      }, 1200);
    } else if (legal.length > 0) {
      t = setTimeout(() => {
        const m = chooseMove(game);
        if (!m) return;
        // Önce hangi pulu oynayacağını göster, sonra hamleyi uygula
        setAiPreview({
          src:
            m.type === 'place'
              ? { kind: 'hand' }
              : { kind: 'point', point: m.from },
          dest: m.type === 'bearoff' ? 'off' : m.to,
        });
        t2 = setTimeout(() => {
          setAiPreview(null);
          play(moveSound(game, [m]));
          setGame(applyMove(game, m));
        }, 1300);
      }, 900);
    }
    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
      setAiPreview(null);
    };
  }, [aiTurn, game, legal, paused]);

  // Hamle yapılamıyorsa: uyarı popup'ı göster, sonra sırayı otomatik geçir
  useEffect(() => {
    if (
      phase !== 'playing' ||
      paused ||
      opponentTurn ||
      game.winner !== null ||
      game.rolled === null ||
      game.dice.length === 0 ||
      legal.length > 0
    )
      return;
    const partial =
      game.dice.length < (game.rolled[0] === game.rolled[1] ? 4 : 2);
    setNoMovePopup(partial ? 'Kalan zar oynanamıyor' : 'Hamle yapılamıyor');
    const t = setTimeout(() => {
      setNoMovePopup(null);
      commit(endTurn(ui.current.game));
      setUndoStack([]);
      setSelected(null);
    }, 1700);
    return () => {
      clearTimeout(t);
      setNoMovePopup(null);
    };
  }, [phase, game, legal, paused, opponentTurn]);

  // Zar popup'ı kısa süre sonra kaybolsun
  useEffect(() => {
    if (!rollPopup) return;
    const t = setTimeout(() => setRollPopup(null), 1300);
    return () => clearTimeout(t);
  }, [rollPopup]);

  // Biten oyunu istatistiklere işle (bir kez): AI ya da online
  useEffect(() => {
    if (phase === 'over' && game.winner !== null && !recordedRef.current) {
      recordedRef.current = true;
      play('win');
      if (mode === 'ai') recordAiResult(game.winner === 0);
      else if (isOnline) recordOnlineResult(game.winner === mySeat);
    }
  }, [phase, mode, game.winner, isOnline, mySeat]);

  // Biten oyunu seri skoruna işle (bir kez)
  useEffect(() => {
    if (phase === 'over' && game.winner !== null && !seriesRecordedRef.current) {
      seriesRecordedRef.current = true;
      const w = game.winner;
      setSeries((s) => (w === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]));
    }
  }, [phase, game.winner]);

  // İnsan turu süre sayacı: süre biterse sıra rakibe geçer
  const forfeitRef = useRef(() => {});
  forfeitRef.current = () => {
    const g = ui.current.game;
    // Otomatik pas zaten yoldaysa (hamle yok popup'ı) çifte geçiş yapma
    if (g.rolled && g.dice.length > 0 && legalMoves(g).length === 0) return;
    dragRef.current = null;
    setDragPos(null);
    commitRef.current(endTurn(g));
    setUndoStack([]);
    setSelected(null);
  };
  useEffect(() => {
    if (phase !== 'playing' || inputLocked || paused || game.winner !== null)
      return;
    setTimeLeft(TURN_SECONDS);
    const started = Date.now();
    const iv = setInterval(() => {
      const rem = TURN_SECONDS - Math.floor((Date.now() - started) / 1000);
      setTimeLeft(Math.max(rem, 0));
      if (rem <= 0) {
        clearInterval(iv);
        forfeitRef.current();
      }
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, aiTurn, game.turn, paused]);

  function doRoll() {
    const d1 = randomDie();
    const d2 = randomDie();
    play('dice');
    commit(rollDice(game, d1, d2));
    setRollPopup({ dice: [d1, d2], player: game.turn, key: Date.now() });
    setUndoStack([]);
    setSelected(null);
  }

  function doUndo() {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((s) => s.slice(0, -1));
    setGame(prev);
    setSelected(null);
  }

  function onPressOff(p: Player) {
    if (phase !== 'playing' || p !== game.turn || !offOption) return;
    doApplyOption(offOption);
  }

  /** Tahtayı sıfırla (seri skoru korunur) */
  function resetBoard() {
    setPhase('opening');
    setOpening(null);
    setGame(newGame());
    setUndoStack([]);
    setSelected(null);
    setAiPreview(null);
    setRollPopup(null);
    recordedRef.current = false;
    seriesRecordedRef.current = false;
  }

  /** Serideki bir sonraki oyuna geç */
  function nextGame() {
    setGameNo((n) => n + 1);
    resetBoard();
  }

  /** Yeni seri başlat */
  function newSeries() {
    setSeries([0, 0]);
    setGameNo(1);
    resetBoard();
  }

  const matchOver = series[0] >= target || series[1] >= target;
  // Sürüklenen pul parmağın altında kalmasın diye biraz daha büyük
  const dragR = Math.max(geo.r * 1.15, 20);

  /** Menüye dönerken online oyunu terk et */
  function exitGame() {
    if (isOnline && online) abandonGame(online.gameId, online.uid).catch(() => {});
    onExit();
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingLeft: padL,
          paddingRight: padR,
          paddingTop: padT,
          paddingBottom: padB,
        },
      ]}
    >
      <View style={[styles.banner, { height: bannerH }]}>
        <Pressable onPress={exitGame} hitSlop={8} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>☰</Text>
        </Pressable>

        {/* Skorboard: sol koltuk 0, ortada skor, sağ koltuk 1 */}
        <View style={styles.scoreboard}>
          <View
            style={[
              styles.sbSide,
              phase === 'playing' && game.turn === 0 && styles.sbSideActive,
            ]}
          >
            <Text style={styles.sbAvatar}>{seatInfo(0).avatar}</Text>
            <Text style={styles.sbName} numberOfLines={1}>
              {seatInfo(0).name}
            </Text>
            {phase === 'playing' && game.turn === 0 && !aiTurn && (
              <Text
                style={[styles.sbTimer, timeLeft <= 5 && { color: colors.danger }]}
              >
                ⏱{timeLeft}
              </Text>
            )}
          </View>
          <View style={styles.sbScore}>
            <Text style={styles.sbScoreText}>
              {series[0]} – {series[1]}
            </Text>
            {matchLen > 1 && (
              <Text style={styles.sbScoreSub}>
                Oyun {gameNo}/{matchLen}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.sbSide,
              phase === 'playing' && game.turn === 1 && styles.sbSideActive,
            ]}
          >
            <Text style={styles.sbAvatar}>{seatInfo(1).avatar}</Text>
            <Text style={styles.sbName} numberOfLines={1}>
              {seatInfo(1).name}
            </Text>
            {phase === 'playing' && game.turn === 1 && !aiTurn && (
              <Text
                style={[styles.sbTimer, timeLeft <= 5 && { color: colors.danger }]}
              >
                ⏱{timeLeft}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          onPress={() => phase === 'playing' && setPaused(true)}
          hitSlop={8}
          style={[styles.iconBtn, phase !== 'playing' && { opacity: 0.35 }]}
        >
          <Text style={styles.iconBtnText}>⏸</Text>
        </Pressable>
      </View>

      <View style={portrait ? styles.col : styles.row}>
        {(() => {
          const panelFor = (p: Player) => (
            <PlayerPanel
              key={`p${p}`}
              player={p}
              name={nameFor(p)}
              game={game}
              phase={phase}
              horizontal={portrait}
              width={portrait ? boardW : panelW}
              height={portrait ? panelH : undefined}
              isTurn={game.turn === p && phase === 'playing'}
              aiControlled={mode === 'ai' && p === AI_PLAYER}
              offActive={!!offOption && game.turn === p}
              canUndo={undoStack.length > 0}
              onUndo={doUndo}
              onOff={() => onPressOff(p)}
              onOffLayout={(rect) => (offRects.current[p] = rect)}
            />
          );
          const board = (
            <View
              key="board"
              style={{ width: boardW, height: boardH }}
              {...boardPan.panHandlers}
            >
              <BoardSvg
                state={game}
                width={boardW}
                height={boardH}
                sourcePoints={inputLocked ? EMPTY_POINTS : sourcePointSet}
                selectedPoint={
                  aiTurn
                    ? aiPreview?.src.kind === 'point'
                      ? aiPreview.src.point!
                      : null
                    : inputLocked
                      ? null
                      : selected?.kind === 'point'
                        ? selected.point!
                        : null
                }
                destPoints={
                  aiTurn
                    ? aiPreview && aiPreview.dest !== 'off'
                      ? new Set([aiPreview.dest])
                      : EMPTY_POINTS
                    : inputLocked
                      ? EMPTY_POINTS
                      : destPointSet
                }
                handIsSource={inputLocked ? false : handIsSource}
                handSelected={
                  aiTurn
                    ? aiPreview?.src.kind === 'hand'
                    : inputLocked
                      ? false
                      : selected?.kind === 'hand'
                }
                background={getTheme(themeId).background}
                layout={themeLayout}
              />
            </View>
          );
          // Dikeyde: Siyah üstte, tahta ortada, Beyaz altta
          return portrait
            ? [panelFor(1), board, panelFor(0)]
            : [panelFor(0), board, panelFor(1)];
        })()}
      </View>

      {/* Sürüklenen pul */}
      {dragPos && (
        <View
          pointerEvents="none"
          style={[
            styles.dragChecker,
            {
              width: dragR * 2,
              height: dragR * 2,
              borderRadius: dragR,
              left: dragPos.x - dragR,
              top: dragPos.y - dragR,
              backgroundColor:
                game.turn === 0 ? colors.whiteChecker : colors.blackChecker,
              borderColor:
                game.turn === 0 ? colors.whiteCheckerEdge : colors.blackCheckerEdge,
            },
          ]}
        />
      )}

      {/* Merkezde Zar At butonu (kendi turum, zar atılmadan önce; süre işler) */}
      {phase === 'playing' && game.rolled === null && !inputLocked && (
        <View style={styles.rollOverlay} pointerEvents="box-none">
          <Pressable style={styles.centerRollBtn} onPress={doRoll}>
            <Text style={styles.centerRollText}>🎲 Zar At</Text>
            <Text style={styles.centerRollTimer}>⏱ {timeLeft} sn</Text>
          </Pressable>
        </View>
      )}

      {/* Online: rakip oynuyor göstergesi */}
      {opponentTurn && (
        <View style={styles.rollOverlay} pointerEvents="none">
          <View style={styles.waitBox}>
            <Text style={styles.waitText}>⏳ Rakip oynuyor…</Text>
          </View>
        </View>
      )}

      {/* Hamle yapılamıyor uyarısı */}
      {noMovePopup && (
        <View style={styles.rollOverlay} pointerEvents="none">
          <View style={styles.noMoveBox}>
            <Text style={styles.noMoveText}>⚠️ {noMovePopup}</Text>
            <Text style={styles.noMoveSub}>sıra rakibe geçiyor…</Text>
          </View>
        </View>
      )}

      {/* Son 5 saniye geri sayımı */}
      {phase === 'playing' && !inputLocked && game.winner === null && timeLeft <= 5 && timeLeft > 0 && (
        <View style={styles.rollOverlay} pointerEvents="none">
          <View style={styles.countBox}>
            <Text style={styles.countText}>{timeLeft}</Text>
          </View>
        </View>
      )}

      {/* Zar atma popup'ı */}
      {rollPopup && (
        <RollPopup
          key={rollPopup.key}
          dice={rollPopup.dice}
          playerName={nameFor(rollPopup.player)}
        />
      )}

      {/* Duraklatma ekranı */}
      {paused && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>⏸ Duraklatıldı</Text>
            <Text style={styles.modalSub}>Süre ve rakip bekliyor</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setPaused(false)}
            >
              <Text style={styles.primaryBtnText}>▶ Devam Et</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={exitGame}>
              <Text style={styles.ghostBtnText}>Menüye Dön</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'opening' && (
        <OpeningOverlay
          opening={opening}
          aiMode={mode === 'ai'}
          onRoll={() => setOpening({ w: randomDie(), b: randomDie() })}
          onStart={(starter) => {
            setGame(newGame(starter));
            setPhase('playing');
          }}
        />
      )}

      {/* Rakip oyundan ayrıldı */}
      {opponentLeft && phase !== 'over' && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>👋 Rakip ayrıldı</Text>
            <Text style={styles.modalSub}>Oyun sonlandı.</Text>
            <Pressable style={styles.primaryBtn} onPress={onExit}>
              <Text style={styles.primaryBtnText}>Menüye Dön</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'over' && game.winner !== null && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {isOnline ? (
              <>
                <Text style={styles.modalTitle}>
                  {game.winner === mySeat ? '🏆 Kazandın!' : '😔 Kaybettin'}
                </Text>
                <Text style={styles.modalSub}>
                  {game.winner === mySeat
                    ? '15 pulunu ilk sen topladın.'
                    : 'Rakip 15 pulunu önce topladı.'}
                </Text>
                <Pressable style={styles.primaryBtn} onPress={onExit}>
                  <Text style={styles.primaryBtnText}>Menüye Dön</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  🏆 {nameFor(game.winner)}{' '}
                  {matchOver && matchLen > 1 ? 'seriyi kazandı!' : 'kazandı!'}
                </Text>
                <Text style={styles.modalSub}>
                  {matchLen > 1
                    ? `Seri durumu: ${series[0]} – ${series[1]} (${matchLen} oyunluk seri)`
                    : '15 pulunu ilk toplayan oldu.'}
                </Text>
                {matchOver ? (
                  <Pressable style={styles.primaryBtn} onPress={newSeries}>
                    <Text style={styles.primaryBtnText}>Yeni Seri</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.primaryBtn} onPress={nextGame}>
                    <Text style={styles.primaryBtnText}>
                      {matchLen > 1
                        ? `Sonraki Oyun (${gameNo + 1}/${matchLen})`
                        : 'Yeni Oyun'}
                    </Text>
                  </Pressable>
                )}
                <Pressable style={styles.ghostBtn} onPress={exitGame}>
                  <Text style={styles.ghostBtnText}>Menüye Dön</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

/** Zar atılınca ortada beliren, yaylanarak büyüyen zar gösterimi */
function RollPopup({
  dice,
  playerName,
}: {
  dice: [number, number];
  playerName: string;
}) {
  const scale = useRef(new Animated.Value(0.2)).current;
  // Yuvarlanma: kısa süre rastgele yüzler göster, sonra gerçek sonuca otur
  const [faces, setFaces] = useState<[number, number]>(dice);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      if (n >= 7) {
        clearInterval(iv);
        setFaces(dice);
        setSettled(true);
      } else {
        setFaces([1 + ((Math.random() * 6) | 0), 1 + ((Math.random() * 6) | 0)]);
      }
    }, 55);
    return () => clearInterval(iv);
  }, [scale, dice]);
  return (
    <View style={styles.rollOverlay} pointerEvents="none">
      <Animated.View style={[styles.rollBox, { transform: [{ scale }] }]}>
        <Text style={styles.rollName}>{playerName}</Text>
        <View style={styles.rollDice}>
          <View style={{ transform: [{ rotate: settled ? '-10deg' : '0deg' }] }}>
            <Die value={faces[0]} size={56} />
          </View>
          <View style={{ transform: [{ rotate: settled ? '8deg' : '0deg' }] }}>
            <Die value={faces[1]} size={56} />
          </View>
        </View>
        {settled && dice[0] === dice[1] && (
          <Text style={styles.rollDouble}>ÇİFT! ×4</Text>
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function OpeningOverlay({
  opening,
  aiMode,
  onRoll,
  onStart,
}: {
  opening: { w: number; b: number } | null;
  aiMode: boolean;
  onRoll: () => void;
  onStart: (p: Player) => void;
}) {
  const tie = opening !== null && opening.w === opening.b;
  const starter: Player | null =
    opening && !tie ? (opening.w > opening.b ? 0 : 1) : null;
  const whiteLabel = aiMode ? 'SEN' : 'Beyaz';
  const blackLabel = aiMode ? 'Bilgisayar' : 'Siyah';
  const starterText =
    starter === null
      ? ''
      : aiMode
        ? starter === 0
          ? '🎉 Sen başlıyorsun!'
          : 'Bilgisayar başlıyor'
        : `${PLAYER_NAMES[starter]} başlıyor`;
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Başlangıç Zarı</Text>
        <Text style={styles.modalSub}>Yüksek atan oyuna başlar</Text>
        {opening && (
          <View style={styles.openDice}>
            <View style={styles.openDie}>
              <Text style={[styles.openLabel, aiMode && styles.openLabelYou]}>
                {whiteLabel}
              </Text>
              <Die value={opening.w} size={44} />
            </View>
            <View style={styles.openDie}>
              <Text style={styles.openLabel}>{blackLabel}</Text>
              <Die value={opening.b} size={44} />
            </View>
          </View>
        )}
        {tie && <Text style={styles.modalSub}>Berabere! Tekrar atın.</Text>}
        {starter !== null ? (
          <>
            <Text style={[styles.modalSub, styles.starterText]}>
              {starterText}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => onStart(starter)}>
              <Text style={styles.primaryBtnText}>Başla</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={onRoll}>
            <Text style={styles.primaryBtnText}>
              {opening ? 'Tekrar At' : 'Zarları At'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

interface PanelProps {
  player: Player;
  name: string;
  game: GameState;
  phase: Phase;
  horizontal: boolean;
  width: number;
  height?: number;
  isTurn: boolean;
  aiControlled: boolean;
  offActive: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onOff: () => void;
  onOffLayout: (rect: Rect) => void;
}

function PlayerPanel({
  player,
  name,
  game,
  phase,
  horizontal,
  width,
  height,
  isTurn,
  aiControlled,
  offActive,
  canUndo,
  onUndo,
  onOff,
  onOffLayout,
}: PanelProps) {
  const checkerColor = player === 0 ? colors.whiteChecker : colors.blackChecker;
  const edge = player === 0 ? colors.whiteCheckerEdge : colors.blackCheckerEdge;
  const offRef = useRef<View>(null);
  const handCount = game.hand[player];

  const dice = isTurn && phase === 'playing' && (
    <View style={horizontal ? styles.controlsRow : styles.controls}>
      {game.rolled ? (
        <View style={styles.diceRow}>
          {game.rolled.map((v, i) => {
            const remaining = game.dice.filter((d) => d === v).length;
            const used =
              game.rolled![0] === game.rolled![1]
                ? i >= remaining
                : !game.dice.includes(v);
            return <Die key={i} value={v} size={34} dimmed={used} />;
          })}
          {game.rolled[0] === game.rolled[1] && (
            <Text style={styles.doubleText}>×4 ({game.dice.length})</Text>
          )}
        </View>
      ) : aiControlled ? (
        <Text style={styles.aiThinking}>düşünüyor…</Text>
      ) : null}

      {canUndo && !aiControlled && (
        <Pressable style={styles.ghostBtn} onPress={onUndo}>
          <Text style={styles.ghostBtnText}>↩ Geri Al</Text>
        </Pressable>
      )}
    </View>
  );

  const offTray = (
    <Pressable
      ref={offRef}
      onPress={onOff}
      onLayout={() =>
        requestAnimationFrame(() =>
          offRef.current?.measureInWindow((x, y, w, h) =>
            onOffLayout({ x, y, w, h }),
          ),
        )
      }
      style={[styles.tray, offActive && styles.trayOffActive]}
    >
      <Text style={styles.trayLabel}>Toplanan</Text>
      <View style={styles.trayRow}>
        <View
          style={[
            styles.miniChecker,
            { backgroundColor: checkerColor, borderColor: edge },
          ]}
        />
        <Text style={styles.trayCount}>
          ×{game.borneOff[player]}
          <Text style={styles.trayTotal}>/{TOTAL_CHECKERS}</Text>
        </Text>
      </View>
    </Pressable>
  );

  if (horizontal) {
    // Dikey ekranda üst/alt yatay şerit
    return (
      <View
        style={[
          styles.panel,
          styles.panelH,
          { width, height },
          isTurn && styles.panelActive,
        ]}
      >
        <View style={styles.panelHLeft}>
          <View style={styles.panelHeader}>
            <View style={[styles.turnDot, { backgroundColor: checkerColor }]} />
            <Text style={styles.panelName} numberOfLines={1}>{name}</Text>
          </View>
          {handCount > 0 && (
            <Text style={styles.handCountText}>Elde {handCount}</Text>
          )}
        </View>
        {dice}
        <View style={styles.panelHRight}>{offTray}</View>
      </View>
    );
  }

  return (
    <View style={[styles.panel, { width }, isTurn && styles.panelActive]}>
      <View style={styles.panelHeader}>
        <View style={[styles.turnDot, { backgroundColor: checkerColor }]} />
        <Text style={styles.panelName} numberOfLines={1}>{name}</Text>
      </View>
      {handCount > 0 && (
        <Text style={styles.handCountText}>Elde {handCount} pul (barda)</Text>
      )}
      {offTray}
      <View style={styles.panelSpacer} />
      {dice}
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    userSelect: 'none', // web'de sürüklerken yazı seçilmesin
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  iconBtn: {
    backgroundColor: '#00000066',
    borderRadius: 22,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF25',
  },
  iconBtnText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  scoreboard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00000044',
    borderRadius: 14,
    marginHorizontal: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF18',
    gap: 4,
  },
  sbSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  sbSideActive: {
    borderColor: colors.accent,
    backgroundColor: '#00000044',
  },
  sbAvatar: {
    fontSize: 17,
  },
  sbName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  sbTimer: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  sbScore: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  sbScoreText: {
    color: colors.brass,
    fontSize: 19,
    fontWeight: '900',
  },
  sbScoreSub: {
    color: colors.textDim,
    fontSize: 9,
    marginTop: -2,
  },
  bannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pauseBtn: {
    backgroundColor: '#00000055',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFFFFF22',
  },
  pauseBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  timerText: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  scoreChip: {
    backgroundColor: '#00000055',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  scoreText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  centerRollBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 34,
    borderWidth: 2,
    borderColor: '#00000044',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  centerRollText: {
    color: '#33200F',
    fontWeight: '900',
    fontSize: 20,
  },
  centerRollTimer: {
    color: '#33200F',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.75,
  },
  noMoveBox: {
    backgroundColor: '#241812EE',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  noMoveText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  noMoveSub: {
    color: colors.textDim,
    fontSize: 12,
  },
  waitBox: {
    backgroundColor: '#241812CC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  waitText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  countBox: {
    backgroundColor: '#241812EE',
    borderRadius: 999,
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.danger,
  },
  countText: {
    color: colors.danger,
    fontSize: 42,
    fontWeight: '900',
  },
  rollOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollBox: {
    backgroundColor: '#241812EE',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.brass,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  rollName: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  rollDice: {
    flexDirection: 'row',
    gap: 14,
  },
  rollDouble: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  turnWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  turnDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00000066',
  },
  turnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  col: {
    flex: 1,
    flexDirection: 'column',
    gap: 6,
    alignItems: 'center',
  },
  panel: {
    backgroundColor: colors.frame,
    borderRadius: 10,
    padding: 8,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  panelActive: {
    borderColor: colors.accent,
  },
  panelH: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelHLeft: {
    flex: 1,
    gap: 4,
  },
  panelHRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  handCountText: {
    color: colors.textDim,
    fontSize: 11,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  tray: {
    backgroundColor: '#00000033',
    borderRadius: 8,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 2,
  },
  handTray: {
    minHeight: 64,
  },
  traySource: {
    borderColor: colors.dest,
  },
  traySelected: {
    borderColor: colors.highlight,
  },
  trayOffActive: {
    borderColor: colors.dest,
  },
  trayLabel: {
    color: colors.textDim,
    fontSize: 11,
  },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  handStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingTop: 2,
  },
  handChecker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  handCheckerOverlap: {
    marginLeft: -12,
  },
  trayEmpty: {
    color: colors.textDim,
    fontSize: 13,
  },
  miniChecker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  trayCount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  trayTotal: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '400',
  },
  panelSpacer: {
    flex: 1,
  },
  controls: {
    gap: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  diceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  doubleText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  aiThinking: {
    color: colors.textDim,
    fontSize: 13,
    fontStyle: 'italic',
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#3E2723',
    fontWeight: '700',
    fontSize: 14,
  },
  ghostBtn: {
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 13,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    backgroundColor: colors.frame,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    minWidth: 260,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  modalSub: {
    color: colors.textDim,
    fontSize: 13,
  },
  openDice: {
    flexDirection: 'row',
    gap: 24,
    marginVertical: 6,
  },
  openDie: {
    alignItems: 'center',
    gap: 6,
  },
  openLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  openLabelYou: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '900',
  },
  starterText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  dragChecker: {
    position: 'absolute',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
});
