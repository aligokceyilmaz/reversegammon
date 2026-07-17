import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { GameState, Player } from '../engine';
import { colors } from './theme';

interface Props {
  state: GameState;
  width: number;
  height: number;
  /** Hamle yapılabilecek kaynak haneler */
  sourcePoints: ReadonlySet<number>;
  /** Seçili kaynak hane */
  selectedPoint: number | null;
  /** Seçili kaynaktan gidilebilecek hedef haneler */
  destPoints: ReadonlySet<number>;
  /** Sıradaki oyuncunun eldeki (bardaki) pulları oynanabilir mi / seçili mi */
  handIsSource: boolean;
  handSelected: boolean;
}

/**
 * Tahta geometrisi — klasik tavla duruşu her zaman korunur: üçgenler üst ve
 * alt kenardan içeri bakar, bar dikey ortadadır. Dikey ekranda tahta uzar,
 * hane genişliği ekrana göre ölçeklenir (klasik mobil tavla görünümü).
 * Alt sıra 0-11 (sağdan sola, Beyaz girişi sağ-alt), üst sıra 12-23
 * (soldan sağa, Siyah girişi sağ-üst). Oyuna girmemiş pullar barın
 * üzerinde bekler: Beyaz'ınki alt yarıda, Siyah'ınki üst yarıda.
 */
export function boardGeometry(width: number, height: number) {
  const fp = 10; // çerçeve kalınlığı
  const innerW = width - fp * 2;
  const innerH = height - fp * 2;
  const pw = innerW / 13; // 12 hane + bar
  const barW = pw;
  const r = Math.min(pw * 0.46, 30); // pul yarıçapı
  const triLen = innerH * 0.4;
  const halfLen = innerH / 2 - 4;
  const barX = fp + 6 * pw; // barın sol kenarı

  /** Şeridin (sütunun) x merkezi (bar atlanır) */
  const laneC = (lane: number) => fp + lane * pw + (lane >= 6 ? barW : 0) + pw / 2;

  /** Hane → kenar noktası ve içe doğru birim yön */
  function pointGeom(i: number): {
    bx: number;
    by: number;
    dx: number;
    dy: number;
    lane: number;
  } {
    const bottom = i < 12;
    const lane = bottom ? 11 - i : i - 12;
    return {
      bx: laneC(lane),
      by: bottom ? height - fp : fp,
      dx: 0,
      dy: bottom ? -1 : 1,
      lane,
    };
  }

  /** Tahta-yerel koordinat → hane indeksi (bar/dışarısı: null) */
  function pointAt(x: number, y: number): number | null {
    if (x < fp || x > width - fp || y < fp || y > height - fp) return null;
    const along = x - fp;
    let lane: number;
    if (along < 6 * pw) lane = Math.floor(along / pw);
    else if (along < 6 * pw + barW) return null; // orta bar
    else lane = 6 + Math.floor((along - 6 * pw - barW) / pw);
    if (lane < 0 || lane > 11) return null;
    return y < height / 2 ? 12 + lane : 11 - lane;
  }

  /** Barın üzerindeki el destesi bölgesi: hangi oyuncunun? (değilse null) */
  function barZoneAt(x: number, y: number): Player | null {
    if (x < barX - pw * 0.2 || x > barX + barW + pw * 0.2) return null;
    if (y < fp || y > height - fp) return null;
    return y >= height / 2 ? 0 : 1;
  }

  return {
    fp,
    innerW,
    innerH,
    pw,
    barW,
    barX,
    r,
    triLen,
    halfLen,
    laneC,
    pointGeom,
    pointAt,
    barZoneAt,
  };
}

/** Tornalanmış ahşap pul (gölge + gövde + oyuk merkez) */
function Checker({
  cx,
  cy,
  r,
  player,
  ringColor,
  ringWidth,
  dimmed,
  keyPrefix,
}: {
  cx: number;
  cy: number;
  r: number;
  player: Player;
  ringColor?: string;
  ringWidth?: number;
  dimmed?: boolean;
  keyPrefix: string;
}) {
  const w = player === 0;
  return (
    <React.Fragment key={keyPrefix}>
      <Ellipse
        cx={cx + 1.2}
        cy={cy + 2.2}
        rx={r * 1.0}
        ry={r * 0.92}
        fill="#000"
        opacity={0.3}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill={w ? 'url(#chW)' : 'url(#chB)'}
        stroke={ringColor ?? (w ? '#8F7345' : '#1C0E06')}
        strokeWidth={ringWidth ?? 1.2}
      />
      {/* Torna izi halka */}
      <Circle
        cx={cx}
        cy={cy}
        r={r * 0.72}
        fill="none"
        stroke={w ? '#B99B6B' : '#6B4630'}
        strokeWidth={1}
        opacity={0.85}
      />
      {/* Oyuk (çukur) merkez */}
      <Circle cx={cx} cy={cy} r={r * 0.45} fill={w ? 'url(#chWdip)' : 'url(#chBdip)'} />
      {dimmed && <Circle cx={cx} cy={cy} r={r} fill="#000" opacity={0.16} />}
    </React.Fragment>
  );
}

export function BoardSvg({
  state,
  width,
  height,
  sourcePoints,
  selectedPoint,
  destPoints,
  handIsSource,
  handSelected,
}: Props) {
  const geo = boardGeometry(width, height);
  const { fp, innerW, innerH, pw, barW, barX, r, triLen, halfLen } = geo;

  const triangles: React.ReactNode[] = [];
  const checkers: React.ReactNode[] = [];
  const destGlows: React.ReactNode[] = [];
  const destDots: React.ReactNode[] = [];

  for (let i = 0; i < 24; i++) {
    const { bx, by, dy, lane } = geo.pointGeom(i);
    const tipY = by + dy * triLen;
    const triPts = `${bx - pw / 2},${by} ${bx + pw / 2},${by} ${bx},${tipY}`;
    const isDest = destPoints.has(i);
    const isSource = sourcePoints.has(i);
    const isSelected = selectedPoint === i;
    const light = lane % 2 === (i < 12 ? 0 : 1);

    triangles.push(
      <Polygon
        key={`t${i}`}
        points={triPts}
        fill={light ? 'url(#triLight)' : 'url(#triDark)'}
        stroke="#00000038"
        strokeWidth={1}
      />,
    );

    if (isDest) {
      destGlows.push(
        <Polygon key={`d${i}`} points={triPts} fill={colors.dest} opacity={0.42} />,
      );
    }

    const stack = state.points[i];
    const n = stack.length;
    const step = n <= 1 ? 0 : Math.min(r * 1.9, (halfLen - 2 * r) / (n - 1));
    stack.forEach((p, k) => {
      const cy = by + dy * (r + 4 + k * step);
      const isTop = k === n - 1;
      checkers.push(
        <Checker
          key={`c${i}-${k}`}
          keyPrefix={`c${i}-${k}`}
          cx={bx}
          cy={cy}
          r={r}
          player={p}
          dimmed={!isTop}
          ringColor={
            isTop && isSelected
              ? colors.highlight
              : isTop && isSource
                ? colors.dest
                : undefined
          }
          ringWidth={isTop && (isSource || isSelected) ? 3.5 : undefined}
        />,
      );
    });

    if (isDest) {
      const off = Math.min(r + 4 + n * step + (n > 0 ? r * 0.4 : 0), halfLen);
      destDots.push(
        <Circle
          key={`dd${i}`}
          cx={bx}
          cy={by + dy * off}
          r={r * 0.45}
          fill={colors.dest}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />,
      );
    }
  }

  // Bar üzerindeki el desteleri: Beyaz alt yarıda, Siyah üst yarıda
  const barC = barX + barW / 2;
  const rb = Math.min(barW * 0.44, r);
  const handStacks: React.ReactNode[] = [];
  for (const p of [0, 1] as const) {
    const count = state.hand[p];
    if (count === 0) continue;
    const avail = innerH / 2 - 26;
    const step = count <= 1 ? 0 : Math.min(rb * 0.6, (avail - 2 * rb) / (count - 1));
    const startY = p === 0 ? height - fp - rb - 4 : fp + rb + 4;
    const dirY = p === 0 ? -1 : 1;
    const isTurn = state.turn === p;
    for (let k = 0; k < count; k++) {
      const cy = startY + dirY * k * step;
      const isTop = k === count - 1;
      handStacks.push(
        <Checker
          key={`h${p}-${k}`}
          keyPrefix={`h${p}-${k}`}
          cx={barC}
          cy={cy}
          r={rb}
          player={p}
          ringColor={
            isTop && isTurn && handSelected
              ? colors.highlight
              : isTop && isTurn && handIsSource
                ? colors.dest
                : undefined
          }
          ringWidth={isTop && isTurn && (handIsSource || handSelected) ? 3 : undefined}
        />,
      );
    }
    // Deste sayacı
    handStacks.push(
      <SvgText
        key={`hc${p}`}
        x={barC}
        y={p === 0 ? height / 2 + 18 : height / 2 - 12}
        fontSize={10}
        fontWeight="bold"
        fill={colors.text}
        textAnchor="middle"
        opacity={0.9}
      >
        {count}
      </SvgText>,
    );
  }

  // Giriş bölgesi numaraları (her oyuncunun kendi 1-6'sı)
  const labels: React.ReactNode[] = [];
  for (let d = 1; d <= 6; d++) {
    for (const pl of [0, 1] as const) {
      const g = geo.pointGeom(pl === 0 ? d - 1 : 24 - d);
      labels.push(
        <SvgText
          key={`l${pl}-${d}`}
          x={g.bx}
          y={g.dy > 0 ? 8 : height - 3}
          fontSize={8}
          fill={colors.textDim}
          textAnchor="middle"
        >
          {d}
        </SvgText>,
      );
    }
  }

  // Pirinç menteşeler (bar üzerinde, ortada)
  const hinges = [height / 2].map((hy, idx) => (
    <React.Fragment key={`hinge${idx}`}>
      <Rect
        x={barC - barW * 0.28}
        y={hy - 7}
        width={barW * 0.56}
        height={14}
        rx={2}
        fill="url(#brassGrad)"
        stroke="#7A5D12"
        strokeWidth={0.8}
      />
      <Circle cx={barC} cy={hy - 3.5} r={1.2} fill="#7A5D12" />
      <Circle cx={barC} cy={hy + 3.5} r={1.2} fill="#7A5D12" />
    </React.Fragment>
  ));

  // Ahşap damar çizgileri (çok hafif)
  const grains: React.ReactNode[] = [];
  for (let gi = 0; gi < 10; gi++) {
    const gx = fp + (innerW / 10) * gi + (gi % 3) * 4;
    grains.push(
      <Rect
        key={`g${gi}`}
        x={gx}
        y={fp}
        width={1.2}
        height={innerH}
        fill={gi % 2 === 0 ? '#000' : '#FFF'}
        opacity={0.035}
      />,
    );
  }

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#5A3F27" />
            <Stop offset="0.5" stopColor="#46311D" />
            <Stop offset="1" stopColor="#33220F" />
          </LinearGradient>
          <LinearGradient id="felt" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#8A6845" />
            <Stop offset="0.5" stopColor="#7A5A3C" />
            <Stop offset="1" stopColor="#684A2E" />
          </LinearGradient>
          <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#33220F" />
            <Stop offset="0.5" stopColor="#5A4128" />
            <Stop offset="1" stopColor="#33220F" />
          </LinearGradient>
          <LinearGradient id="brassGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E8C95A" />
            <Stop offset="0.5" stopColor="#C9A227" />
            <Stop offset="1" stopColor="#8F6E14" />
          </LinearGradient>
          <LinearGradient id="triLight" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor="#F2E4BE" />
            <Stop offset="1" stopColor="#D9C393" />
          </LinearGradient>
          <LinearGradient id="triDark" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor="#9C4A28" />
            <Stop offset="1" stopColor="#7A3418" />
          </LinearGradient>
          {/* Krem akçaağaç pul */}
          <RadialGradient id="chW" cx="0.35" cy="0.3" r="0.95">
            <Stop offset="0" stopColor="#FBF0D2" />
            <Stop offset="0.6" stopColor="#EAD8B2" />
            <Stop offset="1" stopColor="#C3A272" />
          </RadialGradient>
          <RadialGradient id="chWdip" cx="0.5" cy="0.55" r="0.8">
            <Stop offset="0" stopColor="#CDB183" />
            <Stop offset="0.7" stopColor="#E2CD9F" />
            <Stop offset="1" stopColor="#F3E5C2" />
          </RadialGradient>
          {/* Koyu ceviz pul */}
          <RadialGradient id="chB" cx="0.35" cy="0.3" r="0.95">
            <Stop offset="0" stopColor="#7C5138" />
            <Stop offset="0.6" stopColor="#4A2E20" />
            <Stop offset="1" stopColor="#2A160B" />
          </RadialGradient>
          <RadialGradient id="chBdip" cx="0.5" cy="0.55" r="0.8">
            <Stop offset="0" stopColor="#2E1A0E" />
            <Stop offset="0.7" stopColor="#4A2E20" />
            <Stop offset="1" stopColor="#5F3D28" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} rx={12} fill="url(#wood)" />
        <Rect x={fp} y={fp} width={innerW} height={innerH} fill="url(#felt)" />
        {grains}
        <Rect
          x={fp}
          y={fp}
          width={innerW}
          height={innerH}
          fill="none"
          stroke="#00000055"
          strokeWidth={3}
        />
        <Rect x={barX} y={fp} width={barW} height={innerH} fill="url(#barGrad)" />
        {triangles}
        {destGlows}
        {checkers}
        {hinges}
        {handStacks}
        {destDots}
        {labels}
      </Svg>
    </View>
  );
}
