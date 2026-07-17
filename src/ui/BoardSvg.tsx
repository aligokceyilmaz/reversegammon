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
import type { GameState } from '../engine';
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
}

/**
 * Tahta geometrisi — yön bağımsız. Yatayda üçgenler alt/üst kenardan,
 * dikeyde sağ/sol kenardan içeri bakar. Çizim ve dokunma aynı hesabı kullanır.
 *
 * Dikey dizilim: sağ sütun alttan üste 0-11 (Beyaz girişi sağ-alt),
 * sol sütun üstten alta 12-23 (Siyah girişi sol-alt).
 */
export function boardGeometry(width: number, height: number) {
  const portrait = height > width;
  const fp = 10; // çerçeve kalınlığı
  const innerW = width - fp * 2;
  const innerH = height - fp * 2;
  const laneAxis = portrait ? innerH : innerW; // 12 hane + bar bu eksende
  const depthAxis = portrait ? innerW : innerH; // üçgen uzunluğu bu eksende
  const pw = laneAxis / 13;
  const barW = pw;
  const r = Math.min(pw * 0.46, 30); // pul yarıçapı
  const triLen = depthAxis * 0.42;
  const halfLen = depthAxis / 2 - 4;

  /** Uzun eksende şeridin merkezi (bar atlanır) */
  const laneC = (lane: number) => fp + lane * pw + (lane >= 6 ? barW : 0) + pw / 2;

  /** Hane → kenar noktası ve içe doğru birim yön */
  function pointGeom(i: number): {
    bx: number;
    by: number;
    dx: number;
    dy: number;
    lane: number;
  } {
    if (!portrait) {
      // Alt sıra 0-11 (sağdan sola), üst sıra 12-23 (soldan sağa)
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
    // Dikey: sağ sütun 0-11 (alttan üste), sol sütun 12-23 (üstten alta)
    const right = i < 12;
    const lane = right ? 11 - i : i - 12;
    return {
      bx: right ? width - fp : fp,
      by: laneC(lane),
      dx: right ? -1 : 1,
      dy: 0,
      lane,
    };
  }

  /** Tahta-yerel koordinat → hane indeksi (bar/dışarısı: null) */
  function pointAt(x: number, y: number): number | null {
    if (x < fp || x > width - fp || y < fp || y > height - fp) return null;
    const along = (portrait ? y : x) - fp;
    let lane: number;
    if (along < 6 * pw) lane = Math.floor(along / pw);
    else if (along < 6 * pw + barW) return null; // orta bar
    else lane = 6 + Math.floor((along - 6 * pw - barW) / pw);
    if (lane < 0 || lane > 11) return null;
    if (!portrait) {
      return y < height / 2 ? 12 + lane : 11 - lane;
    }
    return x >= width / 2 ? 11 - lane : 12 + lane;
  }

  return {
    portrait,
    fp,
    innerW,
    innerH,
    pw,
    barW,
    r,
    triLen,
    halfLen,
    laneC,
    pointGeom,
    pointAt,
  };
}

export function BoardSvg({
  state,
  width,
  height,
  sourcePoints,
  selectedPoint,
  destPoints,
}: Props) {
  const geo = boardGeometry(width, height);
  const { portrait, fp, innerW, innerH, pw, barW, r, triLen, halfLen } = geo;

  const triangles: React.ReactNode[] = [];
  const checkers: React.ReactNode[] = [];
  const destGlows: React.ReactNode[] = []; // pulların altında
  const destDots: React.ReactNode[] = []; // pulların üstünde

  for (let i = 0; i < 24; i++) {
    const { bx, by, dx, dy, lane } = geo.pointGeom(i);
    // Üçgenin taban kenarı (kenara dik yönde pw genişliğinde)
    const px = Math.abs(dy); // perpendicular birim vektör
    const py = Math.abs(dx);
    const tipX = bx + dx * triLen;
    const tipY = by + dy * triLen;
    const triPts = `${bx - px * (pw / 2)},${by - py * (pw / 2)} ${bx + px * (pw / 2)},${by + py * (pw / 2)} ${tipX},${tipY}`;
    const isDest = destPoints.has(i);
    const isSource = sourcePoints.has(i);
    const isSelected = selectedPoint === i;
    const light = lane % 2 === (i < 12 ? 0 : 1);

    triangles.push(
      <Polygon
        key={`t${i}`}
        points={triPts}
        fill={light ? 'url(#triLight)' : 'url(#triDark)'}
        stroke="#00000030"
        strokeWidth={1}
      />,
    );

    if (isDest) {
      destGlows.push(
        <Polygon key={`d${i}`} points={triPts} fill={colors.dest} opacity={0.45} />,
      );
    }

    // Pul kulesi: dizinin başı hanenin dibinde, sonu (en üst pul) ortaya doğru
    const stack = state.points[i];
    const n = stack.length;
    const step = n <= 1 ? 0 : Math.min(r * 1.9, (halfLen - 2 * r) / (n - 1));
    stack.forEach((p, k) => {
      const cx = bx + dx * (r + 4 + k * step);
      const cy = by + dy * (r + 4 + k * step);
      const isTop = k === n - 1;
      // Zemine düşen yumuşak gölge
      checkers.push(
        <Ellipse
          key={`sh${i}-${k}`}
          cx={cx + 1.5}
          cy={cy + 2.5}
          rx={r * 1.0}
          ry={r * 0.92}
          fill="#000"
          opacity={0.28}
        />,
      );
      checkers.push(
        <Circle
          key={`c${i}-${k}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={p === 0 ? 'url(#chW)' : 'url(#chB)'}
          stroke={
            isTop && isSelected
              ? colors.highlight
              : isTop && isSource
                ? colors.dest
                : p === 0
                  ? '#8A7B58'
                  : '#0D1418'
          }
          strokeWidth={isTop && (isSource || isSelected) ? 3.5 : 1.2}
        />,
      );
      // Tornalanmış iç halkalar
      checkers.push(
        <Circle
          key={`ci${i}-${k}`}
          cx={cx}
          cy={cy}
          r={r * 0.66}
          fill="none"
          stroke={p === 0 ? '#B5A578' : '#5C707B'}
          strokeWidth={1.2}
          opacity={0.8}
        />,
      );
      checkers.push(
        <Circle
          key={`ci2${i}-${k}`}
          cx={cx}
          cy={cy}
          r={r * 0.4}
          fill={p === 0 ? 'url(#chWc)' : 'url(#chBc)'}
          opacity={0.9}
        />,
      );
      // Altta kalan (kilitli/örtülü) pullar hafif gölgelensin
      if (!isTop) {
        checkers.push(
          <Circle
            key={`cd${i}-${k}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="#000"
            opacity={0.16}
          />,
        );
      }
    });

    // Hedef hanede iniş noktası işareti
    if (isDest) {
      const off = Math.min(r + 4 + n * step + (n > 0 ? r * 0.4 : 0), halfLen);
      destDots.push(
        <Circle
          key={`dd${i}`}
          cx={bx + dx * off}
          cy={by + dy * off}
          r={r * 0.45}
          fill={colors.dest}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />,
      );
    }
  }

  // Giriş bölgesi numaraları (her oyuncunun kendi 1-6'sı)
  const labels: React.ReactNode[] = [];
  for (let d = 1; d <= 6; d++) {
    for (const pl of [0, 1] as const) {
      const idx = pl === 0 ? d - 1 : 24 - d;
      const g = geo.pointGeom(idx);
      const lx = portrait ? (g.dx > 0 ? 5 : width - 5) : g.bx;
      const ly = portrait ? g.by + 3 : g.dy > 0 ? 8 : height - 3;
      labels.push(
        <SvgText
          key={`l${pl}-${d}`}
          x={lx}
          y={ly}
          fontSize={8}
          fill={colors.textDim}
          textAnchor="middle"
        >
          {d}
        </SvgText>,
      );
    }
  }

  // Orta bar konumu
  const barRect = portrait
    ? { x: fp, y: fp + 6 * pw, w: innerW, h: barW }
    : { x: fp + 6 * pw, y: fp, w: barW, h: innerH };

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#6B4A38" />
            <Stop offset="0.5" stopColor="#573C2E" />
            <Stop offset="1" stopColor="#3E2723" />
          </LinearGradient>
          <LinearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7A5949" />
            <Stop offset="1" stopColor="#5D4037" />
          </LinearGradient>
          <LinearGradient id="barGrad" x1="0" y1="0" x2={portrait ? '0' : '1'} y2={portrait ? '1' : '0'}>
            <Stop offset="0" stopColor="#2E1D18" />
            <Stop offset="0.5" stopColor="#4E342E" />
            <Stop offset="1" stopColor="#2E1D18" />
          </LinearGradient>
          <LinearGradient id="triLight" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E2D6CC" />
            <Stop offset="1" stopColor="#C4B2A4" />
          </LinearGradient>
          <LinearGradient id="triDark" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#AB8E7E" />
            <Stop offset="1" stopColor="#8C7264" />
          </LinearGradient>
          <RadialGradient id="chW" cx="0.35" cy="0.32" r="0.9">
            <Stop offset="0" stopColor="#FFFEF8" />
            <Stop offset="0.6" stopColor="#F0E7CF" />
            <Stop offset="1" stopColor="#CBBB92" />
          </RadialGradient>
          <RadialGradient id="chWc" cx="0.4" cy="0.35" r="1">
            <Stop offset="0" stopColor="#FBF6E8" />
            <Stop offset="1" stopColor="#D8C9A2" />
          </RadialGradient>
          <RadialGradient id="chB" cx="0.35" cy="0.32" r="0.9">
            <Stop offset="0" stopColor="#7C8F9B" />
            <Stop offset="0.55" stopColor="#46545C" />
            <Stop offset="1" stopColor="#1C262C" />
          </RadialGradient>
          <RadialGradient id="chBc" cx="0.4" cy="0.35" r="1">
            <Stop offset="0" stopColor="#5D707B" />
            <Stop offset="1" stopColor="#2A363D" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} rx={12} fill="url(#wood)" />
        <Rect x={fp} y={fp} width={innerW} height={innerH} fill="url(#felt)" />
        {/* İç kenar gölgesi */}
        <Rect
          x={fp}
          y={fp}
          width={innerW}
          height={innerH}
          fill="none"
          stroke="#00000055"
          strokeWidth={3}
        />
        {/* Orta bar */}
        <Rect
          x={barRect.x}
          y={barRect.y}
          width={barRect.w}
          height={barRect.h}
          fill="url(#barGrad)"
        />
        {triangles}
        {destGlows}
        {checkers}
        {destDots}
        {labels}
      </Svg>
    </View>
  );
}
