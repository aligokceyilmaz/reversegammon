import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderHandlers } from 'react-native';
import {
  applyMove,
  endTurn,
  legalMoves,
  moveSources,
  movesFrom,
  newGame,
  randomDie,
  rollDice,
  TOTAL_CHECKERS,
} from '../engine';
import type { GameState, Move, MoveSource, Player } from '../engine';
import { BoardSvg, boardGeometry } from './BoardSvg';
import { Die } from './Dice';
import { colors, PLAYER_NAMES } from './theme';

type Phase = 'opening' | 'playing' | 'over';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragInfo {
  source: MoveSource | null;
  /** Basılan hane seçili kaynağın hedefiyse: bırakınca uygulanacak hamle */
  pending: Move | null;
  moved: boolean;
  wasSelected: boolean;
}

interface Props {
  onExit: () => void;
}

export function GameScreen({ onExit }: Props) {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('opening');
  const [opening, setOpening] = useState<{ w: number; b: number } | null>(null);
  const [game, setGame] = useState<GameState>(() => newGame());
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<MoveSource | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  // --- Boyutlar ---
  const pad = 8;
  const panelW = Math.max(104, Math.min(width * 0.17, 150));
  const bannerH = 30;
  const boardW = width - panelW * 2 - pad * 4;
  const boardH = height - bannerH - pad * 3;
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

  const selectedMoves = useMemo(
    () => (selected ? movesFrom(game, selected) : []),
    [game, selected],
  );
  const destPointSet = useMemo(
    () =>
      new Set(
        selectedMoves
          .filter((m): m is Move & { to: number } => m.type !== 'bearoff')
          .map((m) => m.to),
      ),
    [selectedMoves],
  );
  const bearoffMove = selectedMoves.find((m) => m.type === 'bearoff');

  // PanResponder'lar bir kez kurulur; güncel duruma ref üzerinden erişirler
  const ui = useRef({
    phase,
    game,
    selected,
    selectedMoves,
    sourcePointSet,
    destPointSet,
    handIsSource,
    geo,
  });
  ui.current = {
    phase,
    game,
    selected,
    selectedMoves,
    sourcePointSet,
    destPointSet,
    handIsSource,
    geo,
  };

  // Tahtanın pencere içi konumu kendi yerleşimimizden bilinir
  // (measureInWindow web'de çalışmadığı için hesapla)
  const boardOrigin = { x: pad + panelW + pad, y: pad + bannerH };
  const boardOriginRef = useRef(boardOrigin);
  boardOriginRef.current = boardOrigin;
  const offRects = useRef<[Rect | null, Rect | null]>([null, null]);
  const dragRef = useRef<DragInfo | null>(null);

  function doApply(move: Move) {
    setUndoStack((s) => [...s, ui.current.game]);
    const next = applyMove(ui.current.game, move);
    setGame(next);
    // Elden art arda yerleştirme akıcı olsun: el hâlâ kaynaksa seçili kalsın
    if (move.type === 'place' && movesFrom(next, { kind: 'hand' }).length > 0) {
      setSelected({ kind: 'hand' });
    } else {
      setSelected(null);
    }
  }
  const doApplyRef = useRef(doApply);
  doApplyRef.current = doApply;

  /** Sürükleme bırakıldığında hedefi bul ve hamleyi uygula */
  function handleDrop(pageX: number, pageY: number, source: MoveSource) {
    const u = ui.current;
    const moves = movesFrom(u.game, source);
    const local = {
      x: pageX - boardOriginRef.current.x,
      y: pageY - boardOriginRef.current.y,
    };
    const pt = u.geo.pointAt(local.x, local.y);
    if (pt !== null) {
      const mv = moves.find((m) => m.type !== 'bearoff' && m.to === pt);
      if (mv) {
        doApplyRef.current(mv);
        return;
      }
      return; // tahtada geçersiz hedef: hamle yok
    }
    // Tahta dışına bırakma: toplama mümkünse topla ("Toplanan" kutusu ölçülebildiyse
    // sadece kutu üstünde, ölçülemediyse (web) tahta dışı yeterli)
    const bo = moves.find((m) => m.type === 'bearoff');
    if (!bo) return;
    const off = offRects.current[u.game.turn];
    if (
      !off ||
      (pageX >= off.x &&
        pageX <= off.x + off.w &&
        pageY >= off.y &&
        pageY <= off.y + off.h)
    ) {
      doApplyRef.current(bo);
    }
  }

  /** Tahta üzerinde dokunma + sürükleme */
  const boardPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        const u = ui.current;
        return u.phase === 'playing' && u.game.rolled !== null;
      },
      onPanResponderGrant: (evt) => {
        const u = ui.current;
        const { locationX, locationY } = evt.nativeEvent;
        const pt = u.geo.pointAt(locationX, locationY);
        dragRef.current = null;
        if (pt === null) {
          setSelected(null);
          return;
        }
        const isSelectedPoint =
          u.selected?.kind === 'point' && u.selected.point === pt;
        // Seçili kaynağın hedefi mi? (bırakınca uygulanır)
        const pending =
          u.selected && u.destPointSet.has(pt) && !isSelectedPoint
            ? (u.selectedMoves.find(
                (m) => m.type !== 'bearoff' && m.to === pt,
              ) ?? null)
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
        // Hedef değilse basar basmaz seç (vurgular basılıyken görünsün)
        if (isSource && !pending) setSelected({ kind: 'point', point: pt });
      },
      onPanResponderMove: (_evt, gs) => {
        const d = dragRef.current;
        if (!d || !d.source) return;
        if (d.moved || Math.abs(gs.dx) + Math.abs(gs.dy) > 8) {
          if (!d.moved && d.source.kind === 'point') {
            // Sürükleme başladı: kaynağı seç ki hedefler vurgulansın
            setSelected(d.source);
          }
          d.moved = true;
          setDragPos({ x: gs.moveX, y: gs.moveY });
        }
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
        // Dokunma: hedefse hamleyi uygula, değilse seçimi aç/kapa
        if (d.pending) {
          doApplyRef.current(d.pending);
          return;
        }
        if (d.wasSelected) setSelected(null);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPos(null);
      },
    }),
  ).current;

  /** El tepsisinden dokunma + sürükleme (oyuncuya özel) */
  function makeHandPan(player: Player) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => {
        const u = ui.current;
        return (
          u.phase === 'playing' &&
          u.game.turn === player &&
          u.game.rolled !== null &&
          u.handIsSource
        );
      },
      onPanResponderGrant: () => {
        const wasSelected = ui.current.selected?.kind === 'hand';
        dragRef.current = {
          source: { kind: 'hand' },
          pending: null,
          moved: false,
          wasSelected,
        };
        setSelected({ kind: 'hand' });
      },
      onPanResponderMove: (_evt, gs) => {
        const d = dragRef.current;
        if (!d) return;
        if (d.moved || Math.abs(gs.dx) + Math.abs(gs.dy) > 8) {
          d.moved = true;
          setDragPos({ x: gs.moveX, y: gs.moveY });
        }
      },
      onPanResponderRelease: (_evt, gs) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragPos(null);
        if (!d) return;
        if (!d.moved) {
          if (d.wasSelected) setSelected(null);
          return;
        }
        if (d.source) handleDrop(gs.moveX, gs.moveY, d.source);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPos(null);
      },
    });
  }
  const handPans = useRef([makeHandPan(0), makeHandPan(1)]).current;

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
    if (phase === 'playing' && game.rolled && !selected && sources.length === 1) {
      setSelected(sources[0]);
    }
  }, [game, phase, selected, sources]);

  const mustPass =
    phase === 'playing' &&
    game.rolled !== null &&
    game.dice.length > 0 &&
    legal.length === 0;

  function doRoll() {
    setGame(rollDice(game, randomDie(), randomDie()));
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
    if (phase !== 'playing' || p !== game.turn || !bearoffMove) return;
    doApply(bearoffMove);
  }

  function restart() {
    setPhase('opening');
    setOpening(null);
    setGame(newGame());
    setUndoStack([]);
    setSelected(null);
  }

  const turnName = PLAYER_NAMES[game.turn];
  const dragR = Math.max(geo.r, 16);

  return (
    <View style={styles.root}>
      <View style={[styles.banner, { height: bannerH }]}>
        <Pressable onPress={onExit} hitSlop={8}>
          <Text style={styles.menuBtn}>‹ Menü</Text>
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
            {phase === 'playing' ? `Sıra: ${turnName}` : 'Ters Tavla'}
          </Text>
        </View>
        <Text style={styles.menuBtn}> </Text>
      </View>

      <View style={styles.row}>
        <PlayerPanel
          player={0}
          game={game}
          phase={phase}
          width={panelW}
          isTurn={game.turn === 0 && phase === 'playing'}
          handIsSource={handIsSource && game.turn === 0}
          handSelected={selected?.kind === 'hand' && game.turn === 0}
          offActive={!!bearoffMove && game.turn === 0}
          canUndo={undoStack.length > 0}
          mustPass={mustPass}
          onRoll={doRoll}
          onUndo={doUndo}
          onPass={doPass}
          onOff={() => onPressOff(0)}
          handPanHandlers={handPans[0].panHandlers}
          onOffLayout={(rect) => (offRects.current[0] = rect)}
        />
        <View style={{ width: boardW, height: boardH }} {...boardPan.panHandlers}>
          <BoardSvg
            state={game}
            width={boardW}
            height={boardH}
            sourcePoints={sourcePointSet}
            selectedPoint={selected?.kind === 'point' ? selected.point! : null}
            destPoints={destPointSet}
          />
        </View>
        <PlayerPanel
          player={1}
          game={game}
          phase={phase}
          width={panelW}
          isTurn={game.turn === 1 && phase === 'playing'}
          handIsSource={handIsSource && game.turn === 1}
          handSelected={selected?.kind === 'hand' && game.turn === 1}
          offActive={!!bearoffMove && game.turn === 1}
          canUndo={undoStack.length > 0}
          mustPass={mustPass}
          onRoll={doRoll}
          onUndo={doUndo}
          onPass={doPass}
          onOff={() => onPressOff(1)}
          handPanHandlers={handPans[1].panHandlers}
          onOffLayout={(rect) => (offRects.current[1] = rect)}
        />
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
  width: number;
  isTurn: boolean;
  handIsSource: boolean;
  handSelected: boolean;
  offActive: boolean;
  canUndo: boolean;
  mustPass: boolean;
  onRoll: () => void;
  onUndo: () => void;
  onPass: () => void;
  onOff: () => void;
  handPanHandlers: GestureResponderHandlers;
  onOffLayout: (rect: Rect) => void;
}

function PlayerPanel({
  player,
  game,
  phase,
  width,
  isTurn,
  handIsSource,
  handSelected,
  offActive,
  canUndo,
  mustPass,
  onRoll,
  onUndo,
  onPass,
  onOff,
  handPanHandlers,
  onOffLayout,
}: PanelProps) {
  const checkerColor = player === 0 ? colors.whiteChecker : colors.blackChecker;
  const edge = player === 0 ? colors.whiteCheckerEdge : colors.blackCheckerEdge;
  const offRef = useRef<View>(null);
  const handCount = game.hand[player];

  return (
    <View style={[styles.panel, { width }, isTurn && styles.panelActive]}>
      <View style={styles.panelHeader}>
        <View style={[styles.turnDot, { backgroundColor: checkerColor }]} />
        <Text style={styles.panelName}>{PLAYER_NAMES[player]}</Text>
      </View>

      {/* Eldeki pullar: dizili tepsi, sürüklenebilir */}
      <View
        {...handPanHandlers}
        style={[
          styles.tray,
          styles.handTray,
          handIsSource && styles.traySource,
          handSelected && styles.traySelected,
        ]}
      >
        <Text style={styles.trayLabel}>Elde · {handCount}</Text>
        <View style={styles.handStack}>
          {Array.from({ length: handCount }, (_, i) => (
            <View
              key={i}
              style={[
                styles.handChecker,
                i > 0 && styles.handCheckerOverlap,
                { backgroundColor: checkerColor, borderColor: edge },
              ]}
            />
          ))}
          {handCount === 0 && <Text style={styles.trayEmpty}>—</Text>}
        </View>
      </View>

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

      <View style={styles.panelSpacer} />

      {isTurn && phase === 'playing' && (
        <View style={styles.controls}>
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
          ) : (
            <Pressable style={styles.primaryBtn} onPress={onRoll}>
              <Text style={styles.primaryBtnText}>🎲 Zar At</Text>
            </Pressable>
          )}

          {mustPass && (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.danger }]}
              onPress={onPass}
            >
              <Text style={styles.primaryBtnText}>
                {canUndo ? 'Zar oynanamıyor — Devam' : 'Hamle yok — Pas'}
              </Text>
            </Pressable>
          )}

          {canUndo && !mustPass && (
            <Pressable style={styles.ghostBtn} onPress={onUndo}>
              <Text style={styles.ghostBtnText}>↩ Geri Al</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 8,
    userSelect: 'none', // web'de sürüklerken yazı seçilmesin
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  menuBtn: {
    color: colors.textDim,
    fontSize: 14,
    width: 60,
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
    gap: 8,
    alignItems: 'stretch',
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
