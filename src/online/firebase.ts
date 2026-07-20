import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ALVAT Firebase yapılandırması (web app config — gizli değildir, güvenlik
// Firestore kurallarıyla sağlanır).
const firebaseConfig = {
  apiKey: 'AIzaSyBXmc8cTslWgG_i79AxOCpWGnwmc04D6nY',
  authDomain: 'alvat-98a56.firebaseapp.com',
  projectId: 'alvat-98a56',
  storageBucket: 'alvat-98a56.firebasestorage.app',
  messagingSenderId: '437765986976',
  appId: '1:437765986976:web:4c3740bd8bb1d08c2ec7c5',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/** Anonim giriş yapar ve kullanıcı kimliğini (uid) döndürür */
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user.uid);
      }
    });
    signInAnonymously(auth).catch((e) => {
      unsub();
      reject(e);
    });
  });
}
