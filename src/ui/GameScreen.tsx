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
  TOTAL_CHECKERS,
} from '../engine';
import type { DestOption, GameState, MoveSource, Player } from '../engine';
import { chooseMove } from '../engine/ai';
import { recordAiResult } from '../profile';
import { BoardSvg, boardGeometry } from './BoardSvg';
import { Die } from './Dice';
import { AI_NAME, colors, PLAYER_NAMES } from './theme';

type Phase = 'opening' | 'playing' | 'over';

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

export type GameMode = 'pvp' | 'ai';

interface Props {
  mode: GameMode;
  onExit: () => void;
}

/** AI her zaman Siyah (oyuncu 1) olarak oynar */
const AI_PLAYER: Player = 1;
const EMPTY_POINTS: ReadonlySet<number> = new Set();

export function GameScreen({ mode, onExit }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('opening');
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
  const recordedRef = useRef(false);

  // --- Boyutlar (çentik/safe-area dahil, küçük ekranlara sığacak şekilde) ---
  const portrait = height > width;
  const pad = 6;
  const gap = 6;
  const padL = pad + insets.left;
  const padR = pad + insets.right;
  const padT = pad + insets.top;
  const padB = pad + insets.bottom;
  const bannerH = 26;
  // Dikeyde paneller üstte/altta yatay şerit, yatayda solda/sağda dikey sütun
  const panelW = Math.max(92, Math.min(width * 0.15, 140));
  const panelH = Math.max(64, Math.min(height * 0.11, 92));
  const boardW = portrait
    ? width - padL - padR
    : width - padL - padR - panelW * 2 - gap * 2;
  const boardH = portrait
    ? height - padT - padB - bannerH - panelH * 2 - gap * 2
    : height - padT - padB - bannerH - gap;
  const geo = boardGeometry(boardW, boardH);

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

  /** Bir hedef seçeneğini (tek hamle ya da kombine dizi) tek geri-alma adımı olarak uygula */
  function doApplyOption(option: DestOption) {
    setUndoStack((s) => [...s, ui.current.game]);
    let next = ui.current.game;
    for (const m of option.moves) next = applyMove(next, m);
    setGame(next);
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
        return u.phase === 'playing' && u.game.rolled !== null && !u.aiTurn;
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
    if (game.rolled && game.dice.length === 0) {
      const t = setTimeout(() => {
        setGame(endTurn(game));
        setUndoStack([]);
        setSelected(null);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [game, phase]);

  // Tek kaynak varsa otomatik seç (örn. ilk turlarda sadece "el" oynanabilir)
  useEffect(() => {
    if (
      phase === 'playing' &&
      game.rolled &&
      !selected &&
      sources.length === 1 &&
      !aiTurn
    ) {
      setSelected(sources[0]);
    }
  }, [game, phase, selected, sources, aiTurn]);

  // AI (Bilgisayar) turu: zar at → hamleyi önce vurgula, sonra oyna → gerekirse pas
  useEffect(() => {
    if (!aiTurn) return;
    let t: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout> | undefined;
    if (game.rolled === null) {
      t = setTimeout(() => {
        const d1 = randomDie();
        const d2 = randomDie();
        setGame(rollDice(game, d1, d2));
        setRollPopup({ dice: [d1, d2], player: AI_PLAYER, key: Date.now() });
        setUndoStack([]);
        setSelected(null);
      }, 900);
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
          setGame(applyMove(game, m));
        }, 750);
      }, 650);
    } else if (game.dice.length > 0) {
      // Hamle yok: pas
      t = setTimeout(() => {
        setGame(endTurn(game));
        setUndoStack([]);
        setSelected(null);
      }, 1100);
    }
    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
      setAiPreview(null);
    };
  }, [aiTurn, game, legal]);

  // Zar popup'ı kısa süre sonra kaybolsun
  useEffect(() => {
    if (!rollPopup) return;
    const t = setTimeout(() => setRollPopup(null), 1300);
    return () => clearTimeout(t);
  }, [rollPopup]);

  // AI moduna karşı biten oyunu istatistiklere işle (bir kez)
  useEffect(() => {
    if (phase === 'over' && mode === 'ai' && game.winner !== null && !recordedRef.current) {
      recordedRef.current = true;
      recordAiResult(game.winner === 0);
    }
  }, [phase, mode, game.winner]);

  const mustPass =
    phase === 'playing' &&
    game.rolled !== null &&
    game.dice.length > 0 &&
    legal.length === 0;

  function doRoll() {
    const d1 = randomDie();
    const d2 = randomDie();
    setGame(rollDice(game, d1, d2));
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

  function doPass() {
    setGame(endTurn(game));
    setUndoStack([]);
    setSelected(null);
  }

  function onPressOff(p: Player) {
    if (phase !== 'playing' || p !== game.turn || !offOption) return;
    doApplyOption(offOption);
  }

  function restart() {
    setPhase('opening');
    setOpening(null);
    setGame(newGame());
    setUndoStack([]);
    setSelected(null);
    setAiPreview(null);
    setRollPopup(null);
    recordedRef.current = false;
  }

  const turnName = PLAYER_NAMES[game.turn];
  const dragR = Math.max(geo.r, 16);

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
        <Pressable onPress={onExit} hitSlop={8} style={styles.menuBtnBox}>
          <Text style={styles.menuBtnText}>‹ Menü</Text>
        </Pressable>
        <View style={styles.turnWrap}>
          <View
            style={[
              styles.turnDot,
              {
                backgroundColor:
                  game.turn === 0 ? colors.whiteChecker : colors.blackChecker,
              },
            ]}
          />
          <Text style={styles.turnText}>
            {phase === 'playing'
              ? `Sıra: ${mode === 'ai' && game.turn === AI_PLAYER ? AI_NAME : turnName}`
              : 'ALVAT'}
          </Text>
        </View>
        <View style={styles.menuBtnSpacer} />
      </View>

      <View style={portrait ? styles.col : styles.row}>
        {(() => {
          const panelFor = (p: Player) => (
            <PlayerPanel
              key={`p${p}`}
              player={p}
              game={game}
              phase={phase}
              horizontal={portrait}
              width={portrait ? boardW : panelW}
              height={portrait ? panelH : undefined}
              isTurn={game.turn === p && phase === 'playing'}
              aiControlled={mode === 'ai' && p === AI_PLAYER}
              offActive={!!offOption && game.turn === p}
              canUndo={undoStack.length > 0}
              mustPass={mustPass}
              onRoll={doRoll}
              onUndo={doUndo}
              onPass={doPass}
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
                sourcePoints={aiTurn ? EMPTY_POINTS : sourcePointSet}
                selectedPoint={
                  aiTurn
                    ? aiPreview?.src.kind === 'point'
                      ? aiPreview.src.point!
                      : null
                    : selected?.kind === 'point'
                      ? selected.point!
                      : null
                }
                destPoints={
                  aiTurn
                    ? aiPreview && aiPreview.dest !== 'off'
                      ? new Set([aiPreview.dest])
                      : EMPTY_POINTS
                    : destPointSet
                }
                handIsSource={aiTurn ? false : handIsSource}
                handSelected={
                  aiTurn ? aiPreview?.src.kind === 'hand' : selected?.kind === 'hand'
                }
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

      {/* Zar atma popup'ı */}
      {rollPopup && (
        <RollPopup
          key={rollPopup.key}
          dice={rollPopup.dice}
          playerName={
            mode === 'ai' && rollPopup.player === AI_PLAYER
              ? AI_NAME
              : PLAYER_NAMES[rollPopup.player]
          }
        />
      )}

      {phase === 'opening' && (
        <OpeningOverlay
          opening={opening}
          onRoll={() => setOpening({ w: randomDie(), b: randomDie() })}
          onStart={(starter) => {
            setGame(newGame(starter));
            setPhase('playing');
          }}
        />
      )}

      {phase === 'over' && game.winner !== null && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              🏆 {PLAYER_NAMES[game.winner]} kazandı!
            </Text>
            <Text style={styles.modalSub}>15 pulunu ilk toplayan oldu.</Text>
            <Pressable style={styles.primaryBtn} onPress={restart}>
              <Text style={styles.primaryBtnText}>Yeni Oyun</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={onExit}>
              <Text style={styles.ghostBtnText}>Menüye Dön</Text>
            </Pressable>
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
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return (
    <View style={styles.rollOverlay} pointerEvents="none">
      <Animated.View style={[styles.rollBox, { transform: [{ scale }] }]}>
        <Text style={styles.rollName}>{playerName}</Text>
        <View style={styles.rollDice}>
          <View style={{ transform: [{ rotate: '-10deg' }] }}>
            <Die value={dice[0]} size={56} />
          </View>
          <View style={{ transform: [{ rotate: '8deg' }] }}>
            <Die value={dice[1]} size={56} />
          </View>
        </View>
        {dice[0] === dice[1] && <Text style={styles.rollDouble}>ÇİFT! ×4</Text>}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function OpeningOverlay({
  opening,
  onRoll,
  onStart,
}: {
  opening: { w: number; b: number } | null;
  onRoll: () => void;
  onStart: (p: Player) => void;
}) {
  const tie = opening !== null && opening.w === opening.b;
  const starter: Player | null =
    opening && !tie ? (opening.w > opening.b ? 0 : 1) : null;
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Başlangıç Zarı</Text>
        <Text style={styles.modalSub}>Yüksek atan oyuna başlar</Text>
        {opening && (
          <View style={styles.openDice}>
            <View style={styles.openDie}>
              <Text style={styles.openLabel}>Beyaz</Text>
              <Die value={opening.w} size={44} />
            </View>
            <View style={styles.openDie}>
              <Text style={styles.openLabel}>Siyah</Text>
              <Die value={opening.b} size={44} />
            </View>
          </View>
        )}
        {tie && <Text style={styles.modalSub}>Berabere! Tekrar atın.</Text>}
        {starter !== null ? (
          <>
            <Text style={[styles.modalSub, { color: colors.accent }]}>
              {PLAYER_NAMES[starter]} başlıyor
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
  game: GameState;
  phase: Phase;
  horizontal: boolean;
  width: number;
  height?: number;
  isTurn: boolean;
  aiControlled: boolean;
  offActive: boolean;
  canUndo: boolean;
  mustPass: boolean;
  onRoll: () => void;
  onUndo: () => void;
  onPass: () => void;
  onOff: () => void;
  onOffLayout: (rect: Rect) => void;
}

function PlayerPanel({
  player,
  game,
  phase,
  horizontal,
  width,
  height,
  isTurn,
  aiControlled,
  offActive,
  canUndo,
  mustPass,
  onRoll,
  onUndo,
  onPass,
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
      ) : (
        <Pressable style={styles.primaryBtn} onPress={onRoll}>
          <Text style={styles.primaryBtnText}>🎲 Zar At</Text>
        </Pressable>
      )}

      {mustPass && !aiControlled && (
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.danger }]}
          onPress={onPass}
        >
          <Text style={styles.primaryBtnText}>
            {canUndo ? 'Zar oynanamıyor' : 'Hamle yok — Pas'}
          </Text>
        </Pressable>
      )}

      {canUndo && !mustPass && !aiControlled && (
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
            <Text style={styles.panelName}>{aiControlled ? AI_NAME : PLAYER_NAMES[player]}</Text>
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
        <Text style={styles.panelName}>{aiControlled ? AI_NAME : PLAYER_NAMES[player]}</Text>
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
  menuBtnBox: {
    backgroundColor: '#00000055',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFFFFF22',
  },
  menuBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  menuBtnSpacer: {
    width: 64,
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
