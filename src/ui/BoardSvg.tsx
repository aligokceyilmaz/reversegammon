import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';
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

/** Hane indeksi → görsel konum. Alt sıra: 0-11 (sağdan sola), üst sıra: 12-23 (soldan sağa) */
function pointToGrid(i: number): { row: 'top' | 'bottom'; col: number } {
  return i < 12 ? { row: 'bottom', col: 11 - i } : { row: 'top', col: i - 12 };
}

/**
 * Tahta geometrisi: çizim ile dokunma/sürükleme aynı hesabı kullansın diye
 * hem BoardSvg hem GameScreen buradan besleniyor.
 */
export function boardGeometry(width: number, height: number) {
  const fp = 10; // çerçeve kalınlığı
  const innerW = width - fp * 2;
  const innerH = height - fp * 2;
  const pw = innerW / 13; // 12 hane + 1 bar genişliği
  const barW = pw;
  const r = Math.min(pw * 0.46, 26); // pul yarıçapı
  const triLen = innerH * 0.42;
  const halfLen = innerH / 2 - 4;
  const colX = (col: number) => fp + col * pw + (col >= 6 ? barW : 0) + pw / 2;

  /** Tahta-yerel koordinat → hane indeksi (bar/dışarısı: null) */
  function pointAt(x: number, y: number): number | null {
    if (x < fp || x > width - fp || y < fp || y > height - fp) return null;
    const xi = x - fp;
    let col: number;
    if (xi < 6 * pw) col = Math.floor(xi / pw);
    else if (xi < 6 * pw + barW) return null; // orta bar
    else col = 6 + Math.floor((xi - 6 * pw - barW) / pw);
    if (col < 0 || col > 11) return null;
    return y < height / 2 ? 12 + col : 11 - col;
  }

  return { fp, innerW, innerH, pw, barW, r, triLen, halfLen, colX, pointAt };
}

export function BoardSvg({
  state,
  width,
  height,
  sourcePoints,
  selectedPoint,
  destPoints,
}: Props) {
  const { fp, innerW, innerH, pw, barW, r, triLen, halfLen, colX } =
    boardGeometry(width, height);

  const triangles: React.ReactNode[] = [];
  const checkers: React.ReactNode[] = [];
  const destGlows: React.ReactNode[] = []; // pulların altında
  const destDots: React.ReactNode[] = []; // pulların üstünde

  for (let i = 0; i < 24; i++) {
    const { row, col } = pointToGrid(i);
    const cx = colX(col);
    const baseY = row === 'bottom' ? height - fp : fp;
    const dir = row === 'bottom' ? -1 : 1;
    const tipY = baseY + dir * triLen;
    const triPts = `${cx - pw / 2},${baseY} ${cx + pw / 2},${baseY} ${cx},${tipY}`;
    const isDest = destPoints.has(i);
    const isSource = sourcePoints.has(i);
    const isSelected = selectedPoint === i;

    triangles.push(
      <Polygon
        key={`t${i}`}
        points={triPts}
        fill={col % 2 === (row === 'bottom' ? 0 : 1) ? colors.triLight : colors.triDark}
        opacity={0.95}
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
      const cy = baseY + dir * (r + 3 + k * step);
      const isTop = k === n - 1;
      checkers.push(
        <Circle
          key={`c${i}-${k}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={p === 0 ? colors.whiteChecker : colors.blackChecker}
          stroke={
            isTop && isSelected
              ? colors.highlight
              : isTop && isSource
                ? colors.dest
                : p === 0
                  ? colors.whiteCheckerEdge
                  : colors.blackCheckerEdge
          }
          strokeWidth={isTop && (isSource || isSelected) ? 3.5 : 1.5}
        />,
      );
      // İç halka: pul dokusu
      checkers.push(
        <Circle
          key={`ci${i}-${k}`}
          cx={cx}
          cy={cy}
          r={r * 0.62}
          fill="none"
          stroke={p === 0 ? colors.whiteCheckerEdge : '#546E7A'}
          strokeWidth={1}
          opacity={0.7}
        />,
      );
    });

    // Boş hedef hanede iniş noktası işareti
    if (isDest) {
      const cy = baseY + dir * (r + 3 + n * step + (n > 0 ? r * 0.4 : 0));
      destDots.push(
        <Circle
          key={`dd${i}`}
          cx={cx}
          cy={Math.abs(cy - baseY) > halfLen ? baseY + dir * halfLen : cy}
          r={r * 0.45}
          fill={colors.dest}
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />,
      );
    }

  }

  // Giriş bölgesi numaraları (her oyuncunun kendi 1-6'sı, sağ yarıda)
  const labels: React.ReactNode[] = [];
  for (let d = 1; d <= 6; d++) {
    const wCol = pointToGrid(d - 1).col; // beyaz girişi alt sağ
    labels.push(
      <SvgText
        key={`lw${d}`}
        x={colX(wCol)}
        y={height - 2}
        fontSize={8}
        fill={colors.textDim}
        textAnchor="middle"
      >
        {d}
      </SvgText>,
    );
    const bCol = pointToGrid(24 - d).col; // siyah girişi üst sağ
    labels.push(
      <SvgText
        key={`lb${d}`}
        x={colX(bCol)}
        y={8}
        fontSize={8}
        fill={colors.textDim}
        textAnchor="middle"
      >
        {d}
      </SvgText>,
    );
  }

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={10} fill={colors.frame} />
        <Rect x={fp} y={fp} width={innerW} height={innerH} fill={colors.felt} />
        {/* Orta bar */}
        <Rect x={fp + 6 * pw} y={fp} width={barW} height={innerH} fill={colors.bar} />
        {triangles}
        {destGlows}
        {checkers}
        {destDots}
        {labels}
      </Svg>
    </View>
  );
}
