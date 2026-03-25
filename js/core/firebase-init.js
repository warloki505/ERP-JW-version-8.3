/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/core/firebase-init.js
   Versão: 8.2.6 | Data: 2026-03-18 | Autor: JW

   OBJETIVO:
   - Remover dependência do SDK remoto do Firebase (gstatic)
   - Evitar bloqueio por CSP/antivírus/extensões em GitHub Pages
   - Manter autenticação online por REST + fallback local
   - Sempre disparar o evento 'firebase-ready'

   ESTRATÉGIA:
   1) Não carregar nenhum script remoto
   2) Usar somente endpoints REST oficiais do Firebase Auth
   3) Persistir sessão local com refresh token
   4) Em caso de falha, entrar em modo local sem travar a interface
   ═══════════════════════════════════════════════════════════════ */

const FIREBASE_TIMEOUT_MS = 8000;
const FIREBASE_AUTH_STORAGE_KEY = 'gf_erp_firebase_rest_session';
const FIREBASE_AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1';
const FIREBASE_TOKEN_BASE = 'https://securetoken.googleapis.com/v1';

const firebaseConfig = {
  apiKey: 'AIzaSyDfmnoa1wAyshL7mEcsY2_p_7RQ8l2hT8g',
  authDomain: 'jw-finance.firebaseapp.com',
  projectId: 'jw-finance',
  storageBucket: 'jw-finance.firebasestorage.app',
  messagingSenderId: '194023086147',
  appId: '1:194023086147:web:533318c8185fd17d135cf6',
  measurementId: 'G-KG0884FGY8'
};

function setFirebaseOffline(reason = 'Firebase indisponível.') {
  window.firebaseApp = null;
  window.firebaseAuth = null;
  window.firebaseDB = null;
  window.firebaseAnalytics = null;
  window.firebaseCurrentUser = null;
  window.firebaseApi = {};
  window.firebaseState = {
    enabled: false,
    mode: 'local-fallback',
    ready: true,
    reason,
    timestamp: new Date().toISOString()
  };
}

function dispatchReady() {
  if (window._firebaseReadyDispatched) return;
  window._firebaseReadyDispatched = true;
  window.dispatchEvent(new CustomEvent('firebase-ready', {
    detail: window.firebaseState || { enabled: false, mode: 'unknown', ready: true }
  }));
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || 'Operação'} excedeu ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function shouldForceLocalMode() {
  try {
    const byStorage = localStorage.getItem('gf_erp_force_local_auth') === '1';
    const byQuery = new URLSearchParams(window.location.search).get('localAuth') === '1';
    return byStorage || byQuery;
  } catch {
    return false;
  }
}

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(FIREBASE_AUTH_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(FIREBASE_AUTH_STORAGE_KEY);
  } catch {}
}

function storeSession(session) {
  try {
    localStorage.setItem(FIREBASE_AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

function normalizeUser(payload, fallback = {}) {
  return {
    uid: payload.localId || payload.user_id || fallback.uid || '',
    email: payload.email || fallback.email || '',
    displayName: payload.displayName || fallback.displayName || '',
    idToken: payload.idToken || payload.id_token || fallback.idToken || '',
    refreshToken: payload.refreshToken || payload.refresh_token || fallback.refreshToken || '',
    expiresIn: Number(payload.expiresIn || payload.expires_in || fallback.expiresIn || 3600),
    emailVerified: Boolean(payload.emailVerified ?? fallback.emailVerified ?? false),
    providerId: 'password'
  };
}

function serializeSession(user) {
  const expiresAt = Date.now() + (Math.max(60, Number(user.expiresIn || 3600)) * 1000);
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    idToken: user.idToken,
    refreshToken: user.refreshToken,
    expiresAt,
    emailVerified: Boolean(user.emailVerified)
  };
}

async function postJson(url, body, extra = {}) {
  const response = await withTimeout(fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(extra.headers || {})
    },
    body: JSON.stringify(body),
    ...extra
  }), FIREBASE_TIMEOUT_MS, 'Requisição Firebase');

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    const err = new Error(message);
    err.code = mapFirebaseErrorCode(message);
    err.firebaseMessage = message;
    throw err;
  }
  return data;
}

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  const response = await withTimeout(fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  }), FIREBASE_TIMEOUT_MS, 'Requisição Firebase');

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    const err = new Error(message);
    err.code = mapFirebaseErrorCode(message);
    err.firebaseMessage = message;
    throw err;
  }
  return data;
}

function mapFirebaseErrorCode(message) {
  const msg = String(message || '').toUpperCase();
  if (msg.includes('EMAIL_EXISTS')) return 'auth/email-already-in-use';
  if (msg.includes('OPERATION_NOT_ALLOWED')) return 'auth/operation-not-allowed';
  if (msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'auth/too-many-requests';
  if (msg.includes('EMAIL_NOT_FOUND')) return 'auth/user-not-found';
  if (msg.includes('INVALID_PASSWORD')) return 'auth/wrong-password';
  if (msg.includes('USER_DISABLED')) return 'auth/user-disabled';
  if (msg.includes('INVALID_EMAIL')) return 'auth/invalid-email';
  if (msg.includes('WEAK_PASSWORD')) return 'auth/weak-password';
  if (msg.includes('TOKEN_EXPIRED')) return 'auth/id-token-expired';
  if (msg.includes('INVALID_ID_TOKEN')) return 'auth/invalid-id-token';
  if (msg.includes('INVALID_REFRESH_TOKEN')) return 'auth/invalid-refresh-token';
  if (msg.includes('PROJECT_NUMBER_MISMATCH')) return 'auth/project-number-mismatch';
  return 'auth/internal-error';
}

function makeRestAuth() {
  return {
    provider: 'firebase-rest',
    projectId: firebaseConfig.projectId,
    apiKey: firebaseConfig.apiKey
  };
}

function setFirebaseOnline(user) {
  const session = serializeSession(user);
  storeSession(session);

  window.firebaseApp = {
    provider: 'firebase-rest',
    config: { ...firebaseConfig }
  };
  window.firebaseAuth = makeRestAuth();
  window.firebaseDB = null;
  window.firebaseAnalytics = null;
  window.firebaseCurrentUser = {
    uid: session.uid,
    email: session.email,
    displayName: session.displayName,
    emailVerified: session.emailVerified,
    providerData: [{ providerId: 'password' }],
    getIdToken: async () => session.idToken
  };
  window.firebaseState = {
    enabled: true,
    mode: 'firebase-rest',
    ready: true,
    reason: '',
    timestamp: new Date().toISOString()
  };
}

async function createUserWithEmailAndPassword(_auth, email, password) {
  const data = await postJson(`${FIREBASE_AUTH_BASE}/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    email,
    password,
    returnSecureToken: true
  });

  const user = normalizeUser(data);
  setFirebaseOnline(user);
  return { user: window.firebaseCurrentUser };
}

async function signInWithEmailAndPassword(_auth, email, password) {
  const data = await postJson(`${FIREBASE_AUTH_BASE}/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    email,
    password,
    returnSecureToken: true
  });

  const user = normalizeUser(data);
  setFirebaseOnline(user);
  return { user: window.firebaseCurrentUser };
}

async function updateProfile(user, profile = {}) {
  const session = readStoredSession();
  const idToken = session?.idToken;
  if (!idToken) {
    const err = new Error('Sessão expirada. Faça login novamente.');
    err.code = 'auth/requires-recent-login';
    throw err;
  }

  const data = await postJson(`${FIREBASE_AUTH_BASE}/accounts:update?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    idToken,
    displayName: String(profile.displayName || ''),
    returnSecureToken: true
  });

  const nextUser = normalizeUser(data, {
    uid: user?.uid || session?.uid,
    email: user?.email || session?.email,
    displayName: profile.displayName || user?.displayName || session?.displayName,
    refreshToken: data.refreshToken || session?.refreshToken,
    idToken: data.idToken || session?.idToken,
    expiresIn: data.expiresIn || 3600,
    emailVerified: session?.emailVerified
  });

  setFirebaseOnline(nextUser);
  return window.firebaseCurrentUser;
}

async function signOut() {
  clearStoredSession();
  window.firebaseCurrentUser = null;
  window.firebaseState = {
    enabled: true,
    mode: 'firebase-rest',
    ready: true,
    reason: '',
    timestamp: new Date().toISOString()
  };
}

async function restoreSessionFromRefreshToken() {
  const session = readStoredSession();
  if (!session?.refreshToken) return false;

  const isFresh = Number(session.expiresAt || 0) > (Date.now() + 30 * 1000);
  if (isFresh && session.idToken && session.uid && session.email) {
    setFirebaseOnline({
      uid: session.uid,
      email: session.email,
      displayName: session.displayName || '',
      idToken: session.idToken,
      refreshToken: session.refreshToken,
      expiresIn: Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000)),
      emailVerified: session.emailVerified
    });
    return true;
  }

  const data = await postForm(`${FIREBASE_TOKEN_BASE}/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken
  });

  setFirebaseOnline({
    uid: data.user_id || session.uid,
    email: session.email,
    displayName: session.displayName || '',
    idToken: data.id_token,
    refreshToken: data.refresh_token || session.refreshToken,
    expiresIn: Number(data.expires_in || 3600),
    emailVerified: session.emailVerified
  });

  return true;
}

async function initFirebase() {
  try {
    if (shouldForceLocalMode()) {
      console.warn('[Firebase] Modo local forçado por configuração.');
      setFirebaseOffline('Modo local forçado por configuração.');
      return;
    }

    console.log('[Firebase] Iniciando bootstrap REST sem SDK remoto...');

    window.firebaseApi = {
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      updateProfile,
      signOut
    };

    window.firebaseApp = {
      provider: 'firebase-rest',
      config: { ...firebaseConfig }
    };
    window.firebaseAuth = makeRestAuth();
    window.firebaseDB = null;
    window.firebaseAnalytics = null;
    window.firebaseCurrentUser = null;
    window.firebaseState = {
      enabled: true,
      mode: 'firebase-rest',
      ready: false,
      reason: '',
      timestamp: new Date().toISOString()
    };

    try {
      await restoreSessionFromRefreshToken();
    } catch (restoreErr) {
      console.warn('[Firebase] Sessão REST não restaurada:', restoreErr);
      clearStoredSession();
      window.firebaseCurrentUser = null;
      window.firebaseState = {
        enabled: true,
        mode: 'firebase-rest',
        ready: true,
        reason: '',
        timestamp: new Date().toISOString()
      };
    }

    if (!window.firebaseCurrentUser) {
      window.firebaseState = {
        enabled: true,
        mode: 'firebase-rest',
        ready: true,
        reason: '',
        timestamp: new Date().toISOString()
      };
    }
  } catch (err) {
    const msg = String(err?.message || err || 'Falha desconhecida ao inicializar Firebase.');
    console.warn('[Firebase] Bootstrap REST indisponível. App seguirá em modo local.', err);
    setFirebaseOffline(`Firebase REST indisponível: ${msg}`);
  } finally {
    dispatchReady();
  }
}

initFirebase();
