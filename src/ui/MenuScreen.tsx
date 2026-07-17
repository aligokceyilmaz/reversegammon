import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from './theme';

const RULES_SUMMARY = [
  ['🎲', 'Tahta boş başlar; 15 pulun elindedir. Zar değeriyle pulunu kendi başlangıç bölgesine (1-6) koyarsın ya da tahtadaki pulunu ilerletirsin. Koymak zorunlu değildir.'],
  ['🔒', 'Rakibin TEK pulunun üstüne oturursan onu kilitlersin; üstündeki pul gidene kadar oynayamaz. Üst üste 2 rakip pulu olan hane kapalıdır.'],
  ['🏗️', 'Kilit zincirlenebilir: en üstteki tek pulun üstüne rakip de oturabilir. En üstte aynı renkten 2 pul olunca hane tamamen kapanır.'],
  ['🏁', '15 pulunun tamamını karşı bölgeye ulaştırıp klasik tavla gibi toplarsın. İlk toplayan kazanır!'],
] as const;

interface Props {
  onPlay: () => void;
}

export function MenuScreen({ onPlay }: Props) {
  const [showRules, setShowRules] = useState(false);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>TERS TAVLA</Text>
      <Text style={styles.subtitle}>Boş tahtayla başla · Kilitle · İlk toplayan kazanır</Text>

      <Pressable style={styles.primaryBtn} onPress={onPlay}>
        <Text style={styles.primaryBtnText}>▶ Oyna (2 Kişi)</Text>
      </Pressable>
      <Pressable style={styles.ghostBtn} onPress={() => setShowRules(!showRules)}>
        <Text style={styles.ghostBtnText}>
          {showRules ? 'Kuralları Gizle' : 'Nasıl Oynanır?'}
        </Text>
      </Pressable>

      {showRules && (
        <ScrollView style={styles.rules} contentContainerStyle={{ gap: 10, padding: 12 }}>
          {RULES_SUMMARY.map(([icon, text], i) => (
            <View key={i} style={styles.ruleRow}>
              <Text style={styles.ruleIcon}>{icon}</Text>
              <Text style={styles.ruleText}>{text}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 6,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  primaryBtnText: {
    color: '#3E2723',
    fontWeight: '800',
    fontSize: 18,
  },
  ghostBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 14,
  },
  rules: {
    maxHeight: 180,
    maxWidth: 620,
    backgroundColor: colors.frame,
    borderRadius: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  ruleIcon: {
    fontSize: 18,
  },
  ruleText: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
});
