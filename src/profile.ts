import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'alvat:profile';
const OLD_KEY = 'r3v3rs3:profile'; // eski isimden geçiş

export interface Profile {
  name: string;
  /** Seçilen avatar (emoji) */
  avatar: string;
  /** Bilgisayara karşı oynanan toplam oyun */
  aiGames: number;
  /** Bilgisayara karşı kazanılan oyun */
  aiWins: number;
  /** Online oynanan toplam oyun */
  onlineGames: number;
  /** Online kazanılan oyun */
  onlineWins: number;
  /** Seçili tahta teması (id) */
  theme: string;
  /** Pro üyelik (şimdilik test amaçlı yerel; mağazada satın almaya bağlanacak) */
  isPro: boolean;
  /** Ses efektleri kapalı mı? */
  muted: boolean;
}

export const emptyProfile: Profile = {
  name: '',
  avatar: '',
  aiGames: 0,
  aiWins: 0,
  onlineGames: 0,
  onlineWins: 0,
  theme: 'classic',
  isPro: false,
  muted: false,
};

/** Seçilebilir avatarlar (üst sıra kadın, alt sıra erkek) */
export const AVATARS = ['👩', '👩‍🦰', '👱‍♀️', '👧', '👨', '🧔', '👱‍♂️', '👦'];

export async function loadProfile(): Promise<Profile> {
  try {
    const raw =
      (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(OLD_KEY));
    if (!raw) return { ...emptyProfile };
    return { ...emptyProfile, ...JSON.parse(raw) };
  } catch {
    return { ...emptyProfile };
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // depolama hatası oyunu engellemesin
  }
}

/** AI'ya karşı biten bir oyunun sonucunu işler */
export async function recordAiResult(won: boolean): Promise<void> {
  const p = await loadProfile();
  p.aiGames += 1;
  if (won) p.aiWins += 1;
  await saveProfile(p);
}

/** Online biten bir oyunun sonucunu işler */
export async function recordOnlineResult(won: boolean): Promise<void> {
  const p = await loadProfile();
  p.onlineGames += 1;
  if (won) p.onlineWins += 1;
  await saveProfile(p);
}

export async function setTheme(theme: string): Promise<void> {
  const p = await loadProfile();
  p.theme = theme;
  await saveProfile(p);
}

export async function setPro(isPro: boolean): Promise<void> {
  const p = await loadProfile();
  p.isPro = isPro;
  await saveProfile(p);
}

export async function setMutedPref(muted: boolean): Promise<void> {
  const p = await loadProfile();
  p.muted = muted;
  await saveProfile(p);
}

export function winRate(p: Profile): number {
  return p.aiGames === 0 ? 0 : Math.round((p.aiWins / p.aiGames) * 100);
}

export function onlineWinRate(p: Profile): number {
  return p.onlineGames === 0
    ? 0
    : Math.round((p.onlineWins / p.onlineGames) * 100);
}
