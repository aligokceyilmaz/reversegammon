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

/**
 * Anonim giriş yapar ve kullanıcı kimliğini (uid) döndürür.
 * Kısıtlı ağlarda (ör. Apple inceleme ortamı) bağlantı asılı kalmasın diye
 * zaman aşımı vardır; süre dolarsa hata fırlatır (sonsuz "Bağlanıyor" olmaz).
 */
export function ensureSignedIn(timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && !done) {
        done = true;
        clearTimeout(timer);
        unsub();
        resolve(user.uid);
      }
    });
    timer = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      reject(new Error('timeout'));
    }, timeoutMs);
    signInAnonymously(auth).catch((e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      reject(e);
    });
  });
}
