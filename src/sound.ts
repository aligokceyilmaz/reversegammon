import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

export type Sfx = 'dice' | 'place' | 'move' | 'lock' | 'win';

const SOURCES: Record<Sfx, number> = {
  dice: require('../assets/sfx/dice.wav'),
  place: require('../assets/sfx/place.wav'),
  move: require('../assets/sfx/move.wav'),
  lock: require('../assets/sfx/lock.wav'),
  win: require('../assets/sfx/win.wav'),
};

let players: Partial<Record<Sfx, AudioPlayer>> = {};
let ready = false;
let muted = false;

/** Uygulama açılışında bir kez çağrılır: ses modunu ayarlar ve oyuncuları hazırlar */
export function initSound(initialMuted: boolean): void {
  muted = initialMuted;
  if (ready) return;
  ready = true;
  try {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    for (const key of Object.keys(SOURCES) as Sfx[]) {
      players[key] = createAudioPlayer(SOURCES[key]);
    }
  } catch {
    // ses altyapısı yoksa (örn. bazı web ortamları) sessizce geç
  }
}

export function setMuted(m: boolean): void {
  muted = m;
}

/** Kısa bir efekti çalar (baştan). Sessizdeyse hiçbir şey yapmaz. */
export function play(name: Sfx): void {
  if (muted || !ready) return;
  const p = players[name];
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // çalma hatası oyunu etkilemesin
  }
}
