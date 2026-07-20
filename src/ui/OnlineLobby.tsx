import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { findMatch } from '../online/match';
import type { MatchResult, Seat } from '../online/match';
import { ensureSignedIn } from '../online/firebase';
import { loadProfile } from '../profile';
import { colors } from './theme';

interface Props {
  onMatched: (result: MatchResult, opponent: Seat, uid: string) => void;
  onCancel: () => void;
}

/** Rakip aranıyor ekranı */
export function OnlineLobby({ onMatched, onCancel }: Props) {
  const [status, setStatus] = useState('Bağlanıyor…');
  const [seconds, setSeconds] = useState(0);
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    const cancel = cancelRef.current;
    let iv: ReturnType<typeof setInterval>;
    (async () => {
      try {
        const uid = await ensureSignedIn();
        const profile = await loadProfile();
        const me: Seat = {
          uid,
          name: profile.name || 'Oyuncu',
          avatar: profile.avatar || '🙂',
        };
        setStatus('Rakip aranıyor…');
        iv = setInterval(() => setSeconds((s) => s + 1), 1000);
        const result = await findMatch(me, () => setStatus('Rakip bekleniyor…'), cancel);
        if (cancel.cancelled || !result) return;
        // Rakibin gerçek adı/avatarı ilk snapshot'ta GameScreen'de güncellenir.
        onMatched(result, { uid: '', name: 'Rakip', avatar: '🙂' }, uid);
      } catch (e) {
        setStatus('Bağlantı hatası. İnternet ve Firebase ayarlarını kontrol et.');
      }
    })();
    return () => {
      cancel.cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [onMatched]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>🌍 Online</Text>
      <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 20 }} />
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.timer}>{seconds} sn</Text>
      <Pressable
        style={styles.cancelBtn}
        onPress={() => {
          cancelRef.current.cancelled = true;
          onCancel();
        }}
      >
        <Text style={styles.cancelText}>İptal</Text>
      </Pressable>
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
    gap: 8,
  },
  title: {
    color: colors.accent,
    fontSize: 30,
    fontWeight: '900',
  },
  status: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  timer: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 20,
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  cancelText: {
    color: colors.text,
    fontSize: 15,
  },
});
