import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { BoardSvg } from './BoardSvg';
import { Die } from './Dice';
import { colors, PLAYER_NAMES } from './theme';

type Phase = 'opening' | 'playing' | 'over';

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

  function doApply(move: Move) {
    setUndoStack((s) => [...s, game]);
    const next = applyMove(game, move);
    setGame(next);
    // Elden art arda yerleştirme akıcı olsun: el hâlâ kaynaksa seçili kalsın
    if (move.type === 'place' && movesFrom(next, { kind: 'hand' }).length > 0) {
      setSelected({ kind: 'hand' });
    } else {
      setSelected(null);
    }
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

  function onPressPoint(i: number) {
    if (phase !== 'playing' || !game.rolled) return;
    if (selected && destPointSet.has(i)) {
      const move = selectedMoves.find((m) => m.type !== 'bearoff' && m.to === i);
      if (move) doApply(move);
      return;
    }
    if (sourcePointSet.has(i)) {
      setSelected(
        selected?.kind === 'point' && selected.point === i
          ? null
          : { kind: 'point', point: i },
      );
      return;
    }
    setSelected(null);
  }

  function onPressHand(p: Player) {
    if (phase !== 'playing' || p !== game.turn || !handIsSource) return;
    setSelected(selected?.kind === 'hand' ? null : { kind: 'hand' });
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

  // --- Boyutlar ---
  const pad = 8;
  const panelW = Math.max(104, Math.min(width * 0.17, 150));
  const bannerH = 30;
  const boardW = width - panelW * 2 - pad * 4;
  const boardH = height - bannerH - pad * 3;

  const turnName = PLAYER_NAMES[game.turn];

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
          onHand={() => onPressHand(0)}
          onOff={() => onPressOff(0)}
        />
        <View style={{ width: boardW, height: boardH }}>
          <BoardSvg
            state={game}
            width={boardW}
            height={boardH}
            sourcePoints={sourcePointSet}
            selectedPoint={selected?.kind === 'point' ? selected.point! : null}
            destPoints={destPointSet}
            onPressPoint={onPressPoint}
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
          onHand={() => onPressHand(1)}
          onOff={() => onPressOff(1)}
        />
      </View>

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
  onHand: () => void;
  onOff: () => void;
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
  onHand,
  onOff,
}: PanelProps) {
  const checkerColor = player === 0 ? colors.whiteChecker : colors.blackChecker;
  const edge = player === 0 ? colors.whiteCheckerEdge : colors.blackCheckerEdge;
  return (
    <View style={[styles.panel, { width }, isTurn && styles.panelActive]}>
      <View style={styles.panelHeader}>
        <View style={[styles.turnDot, { backgroundColor: checkerColor }]} />
        <Text style={styles.panelName}>{PLAYER_NAMES[player]}</Text>
      </View>

      <Pressable
        onPress={onHand}
        style={[
          styles.tray,
          handIsSource && styles.traySource,
          handSelected && styles.traySelected,
        ]}
      >
        <Text style={styles.trayLabel}>Elde</Text>
        <View style={styles.trayRow}>
          <View
            style={[
              styles.miniChecker,
              { backgroundColor: checkerColor, borderColor: edge },
            ]}
          />
          <Text style={styles.trayCount}>×{game.hand[player]}</Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onOff}
        style={[styles.tray, offActive && styles.traySource]}
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
                // Kalan zar listesinde bu değerden kaç tane var?
                const remaining = game.dice.filter((d) => d === v).length;
                const used =
                  game.rolled![0] === game.rolled![1]
                    ? i >= remaining // çiftte 4 hak tek değer üstünden
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
  traySource: {
    borderColor: colors.dest,
  },
  traySelected: {
    borderColor: colors.highlight,
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
});
