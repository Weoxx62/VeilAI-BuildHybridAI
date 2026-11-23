import {
  initVeilFirebase,
  type FirebaseConfigInput,
  type VeilFirebaseServices,
} from "@veilai/hybrid-core";

export function readFirebaseEnvConfig(): FirebaseConfigInput {
  const debugRaw = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
    recaptchaSiteKey: import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY ?? "",
    appCheckDebugToken:
      debugRaw === "true"
        ? true
        : typeof debugRaw === "string" && debugRaw.trim().length > 0
          ? debugRaw.trim()
          : false,
  };
}

let servicesInstance: VeilFirebaseServices | null = null;

export function getWebFirebaseServices(): VeilFirebaseServices {
  if (!servicesInstance) {
    // Optional Chrome Prompt API Origin Trial meta tag injection for production Firebase Hosting
    const otToken = import.meta.env.VITE_CHROME_ORIGIN_TRIAL_TOKEN?.trim();
    if (otToken && typeof document !== "undefined") {
      const existing = document.querySelector('meta[http-equiv="origin-trial"]');
      if (!existing) {
        const meta = document.createElement("meta");
        meta.httpEquiv = "origin-trial";
        meta.content = otToken;
        document.head.appendChild(meta);
      }
    }
    servicesInstance = initVeilFirebase(readFirebaseEnvConfig());
  }
  return servicesInstance;
}
