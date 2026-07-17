import React from 'react';
import { View, StyleSheet } from 'react-native';

/** Zar yüzündeki pip yerleşimleri (3x3 ızgara hücreleri) */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

interface Props {
  value: number;
  size?: number;
  dimmed?: boolean;
}

export function Die({ value, size = 40, dimmed = false }: Props) {
  const pip = size * 0.16;
  const cell = size / 4;
  return (
    <View
      style={[
        styles.die,
        {
          width: size,
          height: size,
          borderRadius: size * 0.2,
          opacity: dimmed ? 0.3 : 1,
        },
      ]}
    >
      {(PIPS[value] ?? []).map(([r, c], i) => (
        <View
          key={i}
          style={[
            styles.pip,
            {
              width: pip,
              height: pip,
              borderRadius: pip / 2,
              left: cell * (c + 1) - pip / 2,
              top: cell * (r + 1) - pip / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  die: {
    // Ahşap zar görünümü
    backgroundColor: '#DBAE6C',
    borderWidth: 1,
    borderColor: '#7A5322',
    borderBottomWidth: 3,
    borderBottomColor: '#8A5F28',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pip: {
    position: 'absolute',
    backgroundColor: '#2E1C0C',
  },
});
