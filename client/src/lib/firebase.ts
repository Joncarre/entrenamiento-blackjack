import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * Conexion con Firestore.
 *
 * Las claves de Firebase son publicas por diseno: viajan en el bundle y
 * cualquiera puede leerlas. Lo que protege los datos son las reglas de
 * seguridad (firestore.rules), no el secreto de estas claves.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Sin projectId no hay base a la que hablar: la mesa sigue, el historial no. */
export const isConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let database: Firestore | null = null;

/**
 * Devuelve la base, creandola la primera vez. Si falta configuracion no
 * revienta: la aplicacion tiene que seguir siendo jugable sin historial.
 */
export function db(): Firestore | null {
  if (!isConfigured) return null;
  if (database) return database;

  app = initializeApp(config);
  try {
    // Cache local: la mesa se juega en el movil, donde la cobertura falla.
    // Con esto las partidas se guardan igual y se sincronizan al volver.
    database = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Navegador sin IndexedDB o con varias pestanas en conflicto: sin cache.
    database = getFirestore(app);
  }
  return database;
}

/** Nombres de coleccion en un solo sitio, para no escribirlos a mano. */
export const COL = {
  sessions: 'sessions',
  rounds: 'rounds',
  decisions: 'decisions',
  /** Contadores agregados: evitan tener que leer todo el historial. */
  stats: 'stats',
  progress: 'progress',
  situations: 'situations',
  mistakes: 'mistakes',
} as const;

/** Documento unico con los totales de siempre. */
export const GLOBAL_DOC = 'global';

/**
 * Tamano del bloque con el que se preagrega la curva de aprendizaje. Los
 * tamanos que ofrece la interfaz son multiplos de este, de modo que se
 * agrupan sin perder exactitud.
 */
export const BUCKET_UNIT = 10;
