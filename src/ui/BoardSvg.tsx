import React from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
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
  /** Tema arka plan görseli; verilirse vektörel tahta çizilmez */
  background?: ImageSourcePropType | null;
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
  // Pul yarıçapı: parmakla rahat tutulsun diye hane genişliğinden biraz taşar
  // (gerçek tavla uygulamalarındaki gibi); dokunma alanı zaten tüm sütundur
  const r = Math.min(pw * 0.58, 34);
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
      {/* Parlaklık vurgusu (üst-sol) */}
      <Ellipse
        cx={cx - r * 0.32}
        cy={cy - r * 0.42}
        rx={r * 0.34}
        ry={r * 0.2}
        fill="#FFFFFF"
        opacity={w ? 0.4 : 0.16}
      />
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
  background,
}: Props) {
  const geo = boardGeometry(width, height);
  const { fp, innerW, innerH, pw, barW, barX, r, triLen, halfLen } = geo;

  const triangles: React.ReactNode[] = [];
  const checkers: React.ReactNode[] = [];
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
      // Hedef işareti: pulun ineceği noktada belirgin bir halka+nokta
      // (üçgen boyama yok; her temada sütun merkezine hizalı kalır)
      const off = Math.min(r + 4 + n * step + (n > 0 ? r * 0.4 : 0), halfLen);
      const cy = by + dy * off;
      destDots.push(
        <React.Fragment key={`dd${i}`}>
          <Circle cx={bx} cy={cy} r={r * 0.82} fill={colors.dest} opacity={0.28} />
          <Circle
            cx={bx}
            cy={cy}
            r={r * 0.5}
            fill={colors.dest}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        </React.Fragment>,
      );
    }
  }

  // Bar üzerindeki desteler: oyun başında eldeki pullar, toplama başlayınca
  // toplanan pullar aynı hazneye geri dolar. Beyaz alt yarıda, Siyah üstte.
  const barC = barX + barW / 2;
  const rb = Math.min(barW * 0.54, r); // deste pulları da parmağa uygun boyda
  const handStacks: React.ReactNode[] = [];
  for (const p of [0, 1] as const) {
    const count = state.hand[p] > 0 ? state.hand[p] : state.borneOff[p];
    const isHand = state.hand[p] > 0;
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
            isHand && isTop && isTurn && handSelected
              ? colors.highlight
              : isHand && isTop && isTurn && handIsSource
                ? colors.dest
                : undefined
          }
          ringWidth={
            isHand && isTop && isTurn && (handIsSource || handSelected)
              ? 3
              : undefined
          }
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

  // Pirinç menteşeler (bar üzerinde)
  const hinges = [height * 0.32, height / 2, height * 0.68].map((hy, idx) => (
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
      {background && (
        <Image
          source={background}
          style={{ position: 'absolute', top: 0, left: 0, width, height }}
          resizeMode="stretch"
        />
      )}
      <Svg
        width={width}
        height={height}
        style={background ? { position: 'absolute', top: 0, left: 0 } : undefined}
      >
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5E4128" />
            <Stop offset="0.5" stopColor="#4E3421" />
            <Stop offset="1" stopColor="#33200F" />
          </LinearGradient>
          <LinearGradient id="felt" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#D29B60" />
            <Stop offset="0.55" stopColor="#C08A52" />
            <Stop offset="1" stopColor="#A9713D" />
          </LinearGradient>
          <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#33200F" />
            <Stop offset="0.5" stopColor="#5E4128" />
            <Stop offset="1" stopColor="#33200F" />
          </LinearGradient>
          <LinearGradient id="brassGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F0D06A" />
            <Stop offset="0.5" stopColor="#D9A73E" />
            <Stop offset="1" stopColor="#9A711A" />
          </LinearGradient>
          <LinearGradient id="triLight" x1="0" y1="0" x2="0.25" y2="1">
            <Stop offset="0" stopColor="#F7DFAC" />
            <Stop offset="1" stopColor="#E2BE7E" />
          </LinearGradient>
          <LinearGradient id="triDark" x1="0" y1="0" x2="0.25" y2="1">
            <Stop offset="0" stopColor="#6B4526" />
            <Stop offset="1" stopColor="#4A2C13" />
          </LinearGradient>
          {/* Parlak krem pul */}
          <RadialGradient id="chW" cx="0.38" cy="0.3" r="1">
            <Stop offset="0" stopColor="#FDF3D7" />
            <Stop offset="0.55" stopColor="#F2DFB6" />
            <Stop offset="0.85" stopColor="#DCC08B" />
            <Stop offset="1" stopColor="#BC9C67" />
          </RadialGradient>
          <RadialGradient id="chWdip" cx="0.5" cy="0.55" r="0.8">
            <Stop offset="0" stopColor="#E4CD9E" />
            <Stop offset="0.7" stopColor="#F0DDB4" />
            <Stop offset="1" stopColor="#FBF0D2" />
          </RadialGradient>
          {/* Parlak koyu kahve pul */}
          <RadialGradient id="chB" cx="0.38" cy="0.3" r="1">
            <Stop offset="0" stopColor="#6E5344" />
            <Stop offset="0.55" stopColor="#42302A" />
            <Stop offset="0.85" stopColor="#2E1F17" />
            <Stop offset="1" stopColor="#1B100A" />
          </RadialGradient>
          <RadialGradient id="chBdip" cx="0.5" cy="0.55" r="0.8">
            <Stop offset="0" stopColor="#271812" />
            <Stop offset="0.7" stopColor="#3C2B24" />
            <Stop offset="1" stopColor="#54403A" />
          </RadialGradient>
        </Defs>
        {/* Vektörel tahta yalnızca tema görseli yoksa çizilir */}
        {!background && (
          <>
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
            {hinges}
            {labels}
          </>
        )}
        {checkers}
        {handStacks}
        {destDots}
      </Svg>
    </View>
  );
}
