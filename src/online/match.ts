import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { newGame } from '../engine';
import type { GameState, Player } from '../engine';
import { db, ensureSignedIn } from './firebase';

export interface Seat {
  uid: string;
  name: string;
  avatar: string;
}

/** Firestore'da saklanan oyun belgesi (points nested-array olamaz → string) */
interface GameDoc {
  status: 'waiting' | 'playing' | 'over' | 'abandoned';
  seats: { [k: string]: Seat | null };
  pointsJson: string;
  hand: [number, number];
  borneOff: [number, number];
  turn: Player;
  dice: number[];
  rolled: [number, number] | null;
  winner: Player | null;
  updatedBy: string;
}

export function serialize(state: GameState): Omit<GameDoc, 'status' | 'seats' | 'updatedBy'> {
  return {
    pointsJson: JSON.stringify(state.points),
    hand: state.hand,
    borneOff: state.borneOff,
    turn: state.turn,
    dice: state.dice,
    rolled: state.rolled,
    winner: state.winner,
  };
}

export function deserialize(d: GameDoc): GameState {
  return {
    points: JSON.parse(d.pointsJson),
    hand: d.hand,
    borneOff: d.borneOff,
    turn: d.turn,
    dice: d.dice,
    rolled: d.rolled ?? null,
    winner: d.winner ?? null,
  };
}

export interface MatchResult {
  gameId: string;
  seat: Player;
}

/**
 * Rastgele rakip bulur: bekleyen bir oyun varsa katılır, yoksa yeni bekleyen
 * oyun oluşturup rakibi bekler. Bulut fonksiyonu gerektirmez; katılım
 * transaction ile yarış koşulundan korunur.
 * cancelRef.cancelled true olursa bekleme iptal edilir.
 */
export async function findMatch(
  me: Seat,
  onWaiting: () => void,
  cancelRef: { cancelled: boolean },
): Promise<MatchResult | null> {
  const uid = await ensureSignedIn();
  me = { ...me, uid };
  const games = collection(db, 'games');

  // 1) Bekleyen bir oyun ara (benim olmayan)
  const waitingQ = query(games, where('status', '==', 'waiting'), limit(5));
  const snap = await getDocs(waitingQ);
  for (const g of snap.docs) {
    if (cancelRef.cancelled) return null;
    const data = g.data() as GameDoc;
    if (data.seats['0']?.uid === uid) continue; // kendi beklemem
    // Transaction ile 1. koltuğa otur
    try {
      const joined = await runTransaction(db, async (tx) => {
        const fresh = await tx.get(g.ref);
        const fd = fresh.data() as GameDoc | undefined;
        if (!fd || fd.status !== 'waiting' || fd.seats['1']) return false;
        const start = serialize(newGame(0));
        tx.update(g.ref, {
          status: 'playing',
          'seats.1': me,
          ...start,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
        return true;
      });
      if (joined) return { gameId: g.id, seat: 1 };
    } catch {
      // yarış: başkası kaptı, sıradakine bak
    }
  }

  if (cancelRef.cancelled) return null;

  // 2) Bekleyen yok → kendi oyununu oluştur ve rakibi bekle
  const initial = serialize(newGame(0));
  const ref = await addDoc(games, {
    status: 'waiting',
    seats: { '0': me, '1': null },
    ...initial,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  onWaiting();

  return new Promise<MatchResult | null>((resolve) => {
    const unsub = onSnapshot(ref, (docSnap) => {
      const d = docSnap.data() as GameDoc | undefined;
      if (cancelRef.cancelled) {
        unsub();
        deleteDoc(ref).catch(() => {});
        resolve(null);
        return;
      }
      if (d && d.status === 'playing' && d.seats['1']) {
        unsub();
        resolve({ gameId: ref.id, seat: 0 });
      }
    });
  });
}

export function subscribeGame(
  gameId: string,
  cb: (state: GameState, doc: GameDoc) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'games', gameId), (docSnap) => {
    const d = docSnap.data() as GameDoc | undefined;
    if (d && d.status !== 'waiting') cb(deserialize(d), d);
  });
}

export async function pushState(
  gameId: string,
  uid: string,
  state: GameState,
): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), {
    ...serialize(state),
    status: state.winner !== null ? 'over' : 'playing',
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function abandonGame(gameId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), {
    status: 'abandoned',
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}
