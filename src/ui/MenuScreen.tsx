import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { newGame, TOTAL_CHECKERS } from '../engine';
import type { GameState, Player } from '../engine';
import {
  AVATARS,
  loadProfile,
  onlineWinRate,
  saveProfile,
  setPro,
  setTheme,
  winRate,
} from '../profile';
import type { Profile } from '../profile';
import { BoardSvg } from './BoardSvg';
import { THEMES } from './themes';
import { colors } from './theme';

// ---------------------------------------------------------------------------
// Nasıl Oynanır: mini tahta görselleriyle sayfalı rehber
// ---------------------------------------------------------------------------

function miniState(
  stacks: Record<number, Player[]>,
  hand: [number, number] = [15, 15],
): GameState {
  const s = newGame();
  for (const [pt, stack] of Object.entries(stacks)) {
    s.points[Number(pt)] = [...stack];
  }
  s.hand = [...hand];
  return s;
}

interface HowToPage {
  title: string;
  text: string;
  state: GameState;
  dests?: number[];
  sources?: number[];
  selected?: number | null;
  handGlow?: boolean;
}

const PAGES: HowToPage[] = [
  {
    title: '1 · Boş Tahta, Desteden Başla',
    text: 'Tahta boş başlar; 15 pulun ortadaki barın üzerindeki destede bekler. Zar değeriyle pulunu KENDİ bölgene (sağ alttaki 1-6 numaralı haneler) sokarsın. Örn. 5 ve 2 attıysan 5 ve 2 numaralı hanelere birer pul koyabilirsin.',
    state: miniState({}),
    dests: [4, 1],
    handGlow: true,
  },
  {
    title: '2 · İlerle ve Birleştir',
    text: 'Elindeki pulları istersen tek tek, istersen gelen zarların TOPLAMI kadar direkt koyabilirsin. Örn. 5+2 attın: pulunu 5 hanesine koyup 2 ilerletirsin — ya da tek harekette toplam 7 ilerisine koyarsın. Yeşiller: önce 5 hanesi, sonra onun 2 ilerisi. Çift zarda da aynı mantık: 4-4 attıysan 4 hamle hakkın var; aynı pulu 4+4 ya da 4+4+4 ileriye tek seferde taşıyabilirsin. Koymak zorunlu da değil; tahtadaki pulunu da ilerletebilirsin.',
    state: miniState({ 8: [0, 0] }, [13, 15]),
    dests: [4, 6],
    handGlow: true,
  },
  {
    title: '3 · Kilitle!',
    text: 'Rakibin TEK pulunun üstüne oturursan onu KİLİTLERSİN: üstündeki pul gidene kadar oynayamaz. Soldaki kulede beyaz, siyahı kilitlemiş. Üst üste 2 rakip pulu olan hane ise sana kapalıdır.',
    state: miniState({ 9: [1, 0], 14: [1, 1] }, [14, 12]),
  },
  {
    title: '4 · Kule Zinciri',
    text: 'Kilitleyen tek pulun üstüne rakip de oturabilir: kuleler zincirlenir (siyah-beyaz-siyah...). En üstte aynı renkten 2 pul olduğu anda o hane tamamen kapanır ve alttakiler bekler.',
    state: miniState({ 10: [1, 0, 1], 16: [1, 0, 0] }, [12, 12]),
  },
  {
    title: '5 · Topla ve Kazan',
    text: '15 pulunun tamamı karşı bölgeye (son 6 hane) ulaşınca toplama başlar: zar değerine göre pullar tahtadan çıkar. 15 pulunu ilk toplayan oyunu kazanır!',
    state: (() => {
      const s = miniState(
        { 18: [0, 0, 0], 20: [0, 0], 22: [0] },
        [0, 15],
      );
      s.borneOff[0] = TOTAL_CHECKERS - 6;
      return s;
    })(),
    sources: [22],
    selected: 22,
  },
];

function HowToPlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const { width, height } = useWindowDimensions();
  const p = PAGES[page];
  const bw = Math.min(width - 48, 340);
  const bh = Math.min(height * 0.5, 420);
  return (
    <View style={styles.howtoOverlay}>
      <Text style={styles.howtoTitle}>{p.title}</Text>
      <BoardSvg
        state={p.state}
        width={bw}
        height={bh}
        sourcePoints={new Set(p.sources ?? [])}
        selectedPoint={p.selected ?? null}
        destPoints={new Set(p.dests ?? [])}
        handIsSource={!!p.handGlow}
        handSelected={!!p.handGlow}
      />
      <Text style={styles.howtoText}>{p.text}</Text>
      <View style={styles.howtoNav}>
        <Pressable
          style={[styles.ghostBtn, page === 0 && { opacity: 0.3 }]}
          disabled={page === 0}
          onPress={() => setPage(page - 1)}
        >
          <Text style={styles.ghostBtnText}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.howtoCount}>
          {page + 1}/{PAGES.length}
        </Text>
        {page < PAGES.length - 1 ? (
          <Pressable style={styles.smallBtn} onPress={() => setPage(page + 1)}>
            <Text style={styles.smallBtnText}>İleri ›</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.smallBtn} onPress={onClose}>
            <Text style={styles.smallBtnText}>Bitti ✓</Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={onClose} style={styles.howtoClose} hitSlop={10}>
        <Text style={styles.howtoCloseText}>✕</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

interface Props {
  onPlay: (mode: 'pvp' | 'ai' | 'online', matchLen: number) => void;
}

export function MenuScreen({ onPlay }: Props) {
  const { width } = useWindowDimensions();
  const [showRules, setShowRules] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [matchLen, setMatchLen] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      setNameInput(p.name);
      setAvatarInput(p.avatar);
    });
  }, []);

  async function chooseTheme(id: string) {
    if (!profile) return;
    const next = { ...profile, theme: id };
    setProfile(next);
    await setTheme(id);
  }

  async function togglePro() {
    if (!profile) return;
    const next = { ...profile, isPro: !profile.isPro };
    setProfile(next);
    await setPro(next.isPro);
  }

  async function submitName() {
    const name = nameInput.trim().slice(0, 16);
    if (!name || !profile) return;
    const next = {
      ...profile,
      name,
      avatar: avatarInput || AVATARS[0],
    };
    setProfile(next);
    setEditingName(false);
    await saveProfile(next);
  }

  const needsName = profile !== null && (profile.name === '' || editingName);

  return (
    <View style={styles.root}>
      <Image
        source={require('../../assets/logo.png')}
        style={{
          width: Math.min(width - 48, 340),
          height: Math.min(width - 48, 340) * 0.69,
        }}
        resizeMode="contain"
      />
      <Text style={styles.subtitle}>Ters tavla · Kilitle · İlk toplayan kazanır</Text>

      {/* Profil kartı */}
      {profile !== null &&
        (needsName ? (
          <View style={styles.profileCard}>
            <Text style={styles.profileLabel}>Avatarını ve adını seç</Text>
            <View style={styles.avatarRow}>
              {AVATARS.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setAvatarInput(a)}
                  style={[
                    styles.avatarChip,
                    avatarInput === a && styles.avatarChipOn,
                  ]}
                >
                  <Text style={styles.avatarEmoji}>{a}</Text>
                </Pressable>
              ))}
            </View>
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
              <Text style={styles.profileAvatar}>{profile.avatar || '👤'}</Text>
              <Text style={styles.profileName}>{profile.name}</Text>
              <Pressable onPress={() => setEditingName(true)} hitSlop={8}>
                <Text style={styles.profileEdit}>değiştir</Text>
              </Pressable>
            </View>
            <Text style={styles.profileStats}>
              🤖 Bilgisayar: {profile.aiGames} oyun · {profile.aiWins} galibiyet
              · %{winRate(profile)}
            </Text>
            <Text style={styles.profileStats}>
              🌍 Online: {profile.onlineGames} oyun · {profile.onlineWins}{' '}
              galibiyet · %{onlineWinRate(profile)}
            </Text>
          </View>
        ))}

      {/* Seri uzunluğu */}
      <View style={styles.seriesRow}>
        <Text style={styles.seriesLabel}>Seri:</Text>
        {[1, 3, 5].map((n) => (
          <Pressable
            key={n}
            style={[styles.seriesChip, matchLen === n && styles.seriesChipOn]}
            onPress={() => setMatchLen(n)}
          >
            <Text
              style={[
                styles.seriesChipText,
                matchLen === n && styles.seriesChipTextOn,
              ]}
            >
              {n} Oyun
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.primaryBtn, styles.onlineBtn]}
        onPress={() => onPlay('online', 1)}
      >
        <Text style={styles.primaryBtnText}>🌍 Online Oyna</Text>
      </Pressable>
      <Pressable style={styles.primaryBtn} onPress={() => onPlay('ai', matchLen)}>
        <Text style={styles.primaryBtnText}>🤖 Tek Kişilik</Text>
      </Pressable>
      <Pressable style={styles.primaryBtn} onPress={() => onPlay('pvp', matchLen)}>
        <Text style={styles.primaryBtnText}>👥 2 Kişi (aynı telefon)</Text>
      </Pressable>
      <View style={styles.bottomRow}>
        <Pressable style={styles.ghostBtn} onPress={() => setShowThemes(true)}>
          <Text style={styles.ghostBtnText}>🎨 Temalar</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => setShowRules(true)}>
          <Text style={styles.ghostBtnText}>❓ Nasıl Oynanır?</Text>
        </Pressable>
      </View>

      {showRules && <HowToPlay onClose={() => setShowRules(false)} />}
      {showThemes && profile && (
        <ThemePicker
          selected={profile.theme}
          isPro={profile.isPro}
          onSelect={chooseTheme}
          onTogglePro={togglePro}
          onClose={() => setShowThemes(false)}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

function ThemePicker({
  selected,
  isPro,
  onSelect,
  onTogglePro,
  onClose,
}: {
  selected: string;
  isPro: boolean;
  onSelect: (id: string) => void;
  onTogglePro: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.howtoOverlay}>
      <Text style={styles.howtoTitle}>🎨 Tahta Temaları</Text>
      <Text style={styles.themeHint}>
        Pro temalar üyelikle açılır. (Test için Pro'yu aç/kapa)
      </Text>
      <View style={styles.themeGrid}>
        {THEMES.map((t) => {
          const locked = t.pro && !isPro;
          const isSel = t.id === selected;
          return (
            <Pressable
              key={t.id}
              style={[
                styles.themeCard,
                isSel && styles.themeCardSel,
                locked && styles.themeCardLocked,
              ]}
              onPress={() => !locked && onSelect(t.id)}
            >
              {t.background ? (
                <Image source={t.background} style={styles.themeThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.themeThumb, styles.themeThumbClassic]} />
              )}
              <Text style={styles.themeName}>{t.name}</Text>
              {t.pro && (
                <Text style={styles.themeBadge}>{locked ? '🔒 PRO' : '⭐ PRO'}</Text>
              )}
              {isSel && <Text style={styles.themeSelMark}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.proToggle} onPress={onTogglePro}>
        <Text style={styles.proToggleText}>
          {isPro ? '🟢 Pro: AÇIK (test)' : '⚪ Pro: kapalı — açmak için dokun (test)'}
        </Text>
      </Pressable>
      <Pressable onPress={onClose} style={styles.howtoClose} hitSlop={10}>
        <Text style={styles.howtoCloseText}>✕</Text>
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
    gap: 12,
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
  profileAvatar: {
    fontSize: 26,
  },
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 300,
  },
  avatarChip: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#00000044',
    padding: 6,
  },
  avatarChipOn: {
    borderColor: colors.accent,
    backgroundColor: '#00000066',
  },
  avatarEmoji: {
    fontSize: 26,
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
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seriesLabel: {
    color: colors.textDim,
    fontSize: 14,
  },
  seriesChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textDim,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  seriesChipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  seriesChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  seriesChipTextOn: {
    color: '#33200F',
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
  onlineBtn: {
    backgroundColor: colors.brass,
    borderWidth: 2,
    borderColor: '#FFE9A6',
  },
  primaryBtnText: {
    color: '#33200F',
    fontWeight: '800',
    fontSize: 17,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  themeHint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
    maxWidth: 340,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 420,
  },
  themeCard: {
    width: 92,
    alignItems: 'center',
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.frame,
  },
  themeCardSel: {
    borderColor: colors.accent,
  },
  themeCardLocked: {
    opacity: 0.55,
  },
  themeThumb: {
    width: 78,
    height: 100,
    borderRadius: 8,
  },
  themeThumbClassic: {
    backgroundColor: '#C08A52',
  },
  themeName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  themeBadge: {
    color: colors.brass,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  themeSelMark: {
    position: 'absolute',
    top: 4,
    right: 8,
    color: colors.accent,
    fontSize: 18,
    fontWeight: '900',
  },
  proToggle: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  proToggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 14,
  },
  howtoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 14,
  },
  howtoTitle: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  howtoText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 480,
  },
  howtoNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  howtoCount: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  howtoClose: {
    position: 'absolute',
    top: 18,
    right: 20,
    backgroundColor: '#00000055',
    borderRadius: 999,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howtoCloseText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
