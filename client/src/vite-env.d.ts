/// <reference types="vite/client" />

/**
 * Configuracion de Firebase. Se inyecta en el build desde variables de entorno
 * (.env en local, panel de Netlify en produccion).
 *
 * Estas claves acaban en el bundle y son publicas por diseno: identifican el
 * proyecto, no autorizan nada. Lo que protege los datos son firestore.rules.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
