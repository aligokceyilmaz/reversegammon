import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

/**
 * ALVAT logosu — altın kabartma yazı, arkada kırmızı/siyah tavla üçgenleri,
 * ortada pul + zar, altta el yazısı "Backgammon".
 */
export function Logo({ width = 300 }: { width?: number }) {
  const height = width * 0.52;
  return (
    <Svg width={width} height={height} viewBox="0 0 320 166">
      <Defs>
        <LinearGradient id="lgGold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE9A6" />
          <Stop offset="0.45" stopColor="#F2B93E" />
          <Stop offset="1" stopColor="#B97812" />
        </LinearGradient>
        <LinearGradient id="lgRed" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D8442E" />
          <Stop offset="1" stopColor="#8E2314" />
        </LinearGradient>
        <LinearGradient id="lgDark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A3A31" />
          <Stop offset="1" stopColor="#1D140E" />
        </LinearGradient>
        <LinearGradient id="lgCream" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF7DE" />
          <Stop offset="1" stopColor="#E8C88E" />
        </LinearGradient>
      </Defs>

      {/* Arka üçgenler */}
      <Polygon points="6,18 44,18 25,108" fill="url(#lgRed)" stroke="#3A1006" strokeWidth={2} />
      <Polygon points="276,18 314,18 295,108" fill="url(#lgDark)" stroke="#120A05" strokeWidth={2} />

      {/* ALVAT */}
      <SvgText
        x={160}
        y={64}
        fontSize={58}
        fontWeight="bold"
        textAnchor="middle"
        fill="url(#lgGold)"
        stroke="#3A2410"
        strokeWidth={3.5}
        letterSpacing={3}
      >
        ALVAT
      </SvgText>

      {/* Pullar ve zar */}
      <Ellipse cx={118} cy={92} rx={26} ry={13} fill="#1D140E" opacity={0.5} />
      <Ellipse cx={118} cy={87} rx={26} ry={14} fill="url(#lgDark)" stroke="#0E0803" strokeWidth={1.5} />
      <Ellipse cx={118} cy={83} rx={19} ry={9} fill="#3A2C24" />
      <Ellipse cx={202} cy={92} rx={26} ry={13} fill="#1D140E" opacity={0.5} />
      <Ellipse cx={202} cy={87} rx={26} ry={14} fill="url(#lgCream)" stroke="#8F7345" strokeWidth={1.5} />
      <Ellipse cx={202} cy={83} rx={19} ry={9} fill="#EFDCB2" />
      <Rect x={140} y={62} width={42} height={42} rx={9} fill="url(#lgCream)" stroke="#6B4A20" strokeWidth={2} transform="rotate(8 161 83)" />
      {[
        [150, 72], [161, 83], [172, 94], [172, 72], [150, 94],
      ].map(([px, py], i) => (
        <Circle key={i} cx={px} cy={py} r={3.4} fill="#241505" transform="rotate(8 161 83)" />
      ))}

      {/* Backgammon el yazısı */}
      <SvgText
        x={160}
        y={148}
        fontSize={34}
        fontStyle="italic"
        fontWeight="bold"
        fontFamily="serif"
        textAnchor="middle"
        fill="url(#lgCream)"
        stroke="#33200F"
        strokeWidth={1.8}
      >
        Backgammon
      </SvgText>
    </Svg>
  );
}
