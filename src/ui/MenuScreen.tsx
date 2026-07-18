import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loadProfile, saveProfile, winRate } from '../profile';
import type { Profile } from '../profile';
import { colors } from './theme';

const RULES = [
  ['🎲', 'Tahta boş başlar; 15 pulun barın üzerindeki destendedir. Açılışta herkes birer zar atar, yüksek atan başlar.'],
  ['📥', 'Zar değeriyle pulunu kendi başlangıç bölgesine (1-6 numaralı haneler) sokarsın: 5-2 attıysan 5 ve 2 hanelerine koyabilirsin. Koymak zorunlu değildir; tahtadaki pulunu da ilerletebilirsin.'],
  ['➕', 'İki zarı aynı pulda birleştirebilirsin (5-2 → 7 ilerleme). Çift zar 4 hamle hakkı verir.'],
  ['🔒', 'Rakibin TEK pulunun üstüne oturursan onu kilitlersin: üstündeki pul gidene kadar oynayamaz. Üst üste 2 rakip pulu olan hane sana kapalıdır.'],
  ['🏗️', 'Kule zincirlenebilir: kilitleyen tek pulun üstüne rakip de oturabilir (B,S,B,S...). En üstte aynı renkten 2 pul olunca o hane tamamen kapanır.'],
  ['🧭', 'Herkes kendi köşesinden girip karşı köşeye doğru ilerler; yollar tamamen çakışır, karşılaşmalar bundan doğar.'],
  ['🏁', '15 pulunun tamamı karşı bölgeye (son 6 hane) ulaşınca toplama başlar: zarın gösterdiği hanedeki pul toplanır; zar en uzak serbest puldan büyükse en uzaktaki serbest pul toplanır.'],
  ['🏆', '15 pulunu ilk toplayan oyunu kazanır!'],
] as const;

interface Props {
  onPlay: (mode: 'pvp' | 'ai') => void;
}

export function MenuScreen({ onPlay }: Props) {
  const [showRules, setShowRules] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      setNameInput(p.name);
    });
  }, []);

  async function submitName() {
    const name = nameInput.trim().slice(0, 16);
    if (!name || !profile) return;
    const next = { ...profile, name };
    setProfile(next);
    setEditingName(false);
    await saveProfile(next);
  }

  const needsName = profile !== null && (profile.name === '' || editingName);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>R3V3RS3</Text>
      <Text style={styles.subtitle}>Ters tavla · Kilitle · İlk toplayan kazanır</Text>

      {/* Profil kartı */}
      {profile !== null &&
        (needsName ? (
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Kullanıcı adını seç</Text>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="örn. AliG"
              placeholderTextColor={colors.textDim}
              maxLength={16}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Pressable style={styles.smallBtn} onPress={submitName}>
              <Text style={styles.smallBtnText}>Kaydet</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <Text style={styles.profileName}>👤 {profile.name}</Text>
              <Pressable onPress={() => setEditingName(true)} hitSlop={8}>
                <Text style={styles.profileEdit}>değiştir</Text>
              </Pressable>
            </View>
            <Text style={styles.profileStats}>
              🤖 Bilgisayara karşı: {profile.aiGames} oyun · {profile.aiWins}{' '}
              galibiyet · %{winRate(profile)} başarı
            </Text>
          </View>
        ))}

      <Pressable style={styles.primaryBtn} onPress={() => onPlay('ai')}>
        <Text style={styles.primaryBtnText}>🤖 Tek Kişilik</Text>
      </Pressable>
      <Pressable style={styles.primaryBtn} onPress={() => onPlay('pvp')}>
        <Text style={styles.primaryBtnText}>👥 2 Kişi (aynı telefon)</Text>
      </Pressable>
      <Pressable style={styles.ghostBtn} onPress={() => setShowRules(!showRules)}>
        <Text style={styles.ghostBtnText}>
          {showRules ? 'Kuralları Gizle' : '❓ Nasıl Oynanır?'}
        </Text>
      </Pressable>

      {showRules && (
        <ScrollView
          style={styles.rules}
          contentContainerStyle={{ gap: 10, padding: 14 }}
        >
          {RULES.map(([icon, text], i) => (
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
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 8,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 6,
  },
  profileCard: {
    backgroundColor: colors.frame,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
    minWidth: 260,
    maxWidth: 420,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  profileEdit: {
    color: colors.textDim,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  profileStats: {
    color: colors.textDim,
    fontSize: 12,
  },
  profileLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  nameInput: {
    backgroundColor: '#00000044',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textDim,
    color: colors.text,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 200,
    textAlign: 'center',
    fontSize: 15,
  },
  smallBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  smallBtnText: {
    color: '#33200F',
    fontWeight: '700',
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 36,
    minWidth: 260,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#33200F',
    fontWeight: '800',
    fontSize: 17,
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
    maxHeight: 260,
    maxWidth: 620,
    alignSelf: 'stretch',
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
