/* =====================================================
   ERP JW Finance v8.0.0 - INDEX (LOGIN / CADASTRO)
   Integração segura com Firebase Auth + compatibilidade legado local
   - Multiusuário por hash do e-mail
   - Mantém sessão: gf_erp_current_userId + gf_erp_logged
   - Mantém compatibilidade com contas já existentes no localStorage
   - Firebase primeiro, fallback local quando necessário
   ===================================================== */

(function () {
  'use strict';

  async function boot() {
    try {
      if (window.Core?.migrate) await Core.migrate.runOnce();
    } catch {}

    if (!window.Core || !window.ERP) {
      console.error('[Index] Core/ERP não carregados.');
      return;
    }

    try { ERP.theme.apply(); } catch {}

    if (Core.user.isLogged()) {
      window.location.href = 'dashboard.html';
      return;
    }

    try {
      // ✅ FIX: usa firebaseCurrentUser (resolvido pelo onAuthStateChanged)
      // em vez de firebaseAuth.currentUser (que é sempre null no carregamento)
      const firebaseUser = window.firebaseCurrentUser || null;
      if (firebaseUser?.email) {
        await establishLocalSession(firebaseUser, null, true);
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (err) {
      console.warn('[Index] Falha ao restaurar sessão Firebase:', err);
    }

    bind();
    syncAuthModeHint();
  }

  const $ = (id) => document.getElementById(id);
  const statusEl = () => $('status');

  function setStatus(msg, type = 'info') {
    const el = statusEl();
    if (!el) return;
    el.textContent = msg || '';
    el.className = `status status--${type}`;
  }

  function syncAuthModeHint() {
    const el = document.getElementById('auth-mode-hint');
    if (!el) return;

    const state = window.firebaseState || {};
    if (state.enabled) {
      el.textContent = '☁️ Modo online disponível — autenticação Firebase via REST ativa';
      return;
    }

    if (state.mode === 'local-fallback') {
      el.textContent = '🔒 Modo local ativo — dados salvos neste navegador (Firebase indisponível neste ambiente)';
      return;
    }

    el.textContent = '🔒 Modo local — dados salvos apenas neste navegador';
  }

  function normEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function normName(name) {
    return String(name || '').trim();
  }

  async function hashPassword(password) {
    return await Core.crypto.sha256Hex(String(password || ''));
  }

  function getFirebaseApi() {
    const api = window.firebaseApi || {};
    return {
      auth: window.firebaseAuth || null,
      createUserWithEmailAndPassword: api.createUserWithEmailAndPassword || null,
      signInWithEmailAndPassword: api.signInWithEmailAndPassword || null,
      updateProfile: api.updateProfile || null,
      signOut: api.signOut || null
    };
  }

  async function getUserIdByEmail(email) {
    return await Core.user.hashEmail(normEmail(email));
  }

  async function establishLocalSession(firebaseUser, explicitName = null, keepLegacyPasswordHash = true) {
    const email = normEmail(firebaseUser?.email);
    if (!email) throw new Error('Usuário Firebase inválido.');

    const userId = await getUserIdByEmail(email);
    const key = Core.keys.user(userId);
    const existing = Core.storage.getJSON(key, null);

    const user = {
      nome:
        normName(explicitName) ||
        normName(firebaseUser?.displayName) ||
        normName(existing?.nome) ||
        email.split('@')[0],
      email,
      firebaseUid: firebaseUser.uid,
      authProvider: 'firebase',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (keepLegacyPasswordHash && existing?.passwordHash) {
      user.passwordHash = existing.passwordHash;
    }

    Core.storage.setJSON(key, user);
    localStorage.setItem(Core.user.SESSION.loggedKey, 'true');
    Core.user.setCurrentUserId(userId);

    return { ok: true, userId, user };
  }

  async function createLocalAccount(name, email, password) {
    const userId = await getUserIdByEmail(email);
    const key = Core.keys.user(userId);

    const existing = Core.storage.getJSON(key, null);
    if (existing) return { ok: false, error: 'Já existe uma conta com esse e-mail.' };

    const user = {
      nome: normName(name),
      email: normEmail(email),
      passwordHash: await hashPassword(password),
      authProvider: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    Core.storage.setJSON(key, user);
    return { ok: true, userId, user };
  }

  async function loginLocal(email, password) {
    const userId = await getUserIdByEmail(email);
    const user = Core.storage.getJSON(Core.keys.user(userId), null);

    if (!user) return { ok: false, error: 'Conta não encontrada. Verifique o e-mail.' };

    const passHash = await hashPassword(password);
    if (passHash !== user.passwordHash) return { ok: false, error: 'Senha incorreta.' };

    localStorage.setItem(Core.user.SESSION.loggedKey, 'true');
    Core.user.setCurrentUserId(userId);

    return { ok: true, userId, user };
  }

  async function createAccount(name, email, password) {
    const cleanName = normName(name);
    const cleanEmail = normEmail(email);
    const fb = getFirebaseApi();

    if (fb.auth && fb.createUserWithEmailAndPassword) {
      try {
        const cred = await fb.createUserWithEmailAndPassword(fb.auth, cleanEmail, password);

        if (fb.updateProfile && cleanName) {
          try {
            await fb.updateProfile(cred.user, { displayName: cleanName });
          } catch (profileErr) {
            console.warn('[Index] Não foi possível atualizar displayName:', profileErr);
          }
        }

        const local = await establishLocalSession(cred.user, cleanName, false);

        const merged = Core.storage.getJSON(Core.keys.user(local.userId), {}) || {};
        merged.passwordHash = await hashPassword(password);
        merged.updatedAt = new Date().toISOString();
        Core.storage.setJSON(Core.keys.user(local.userId), merged);

        return { ok: true, userId: local.userId, user: merged };
      } catch (err) {
        console.error('[Index] Erro Firebase ao criar conta:', err);

        const code = String(err?.code || '');

        if (code.includes('auth/operation-not-allowed')) {
          return { ok: false, error: 'O método Email/Senha não está habilitado no Firebase.' };
        }

        if (code.includes('auth/email-already-in-use')) {
          const localExisting = await loginLocal(cleanEmail, password).catch(() => null);
          if (localExisting?.ok) {
            return { ok: false, error: 'Já existe uma conta com esse e-mail.' };
          }
          return { ok: false, error: 'Este e-mail já está cadastrado.' };
        }

        if (code.includes('auth/invalid-email')) {
          return { ok: false, error: 'E-mail inválido.' };
        }

        if (code.includes('auth/weak-password')) {
          return { ok: false, error: 'Senha fraca. Use pelo menos 6 caracteres.' };
        }

        return { ok: false, error: err?.message || 'Erro ao criar conta no Firebase.' };
      }
    }

    return await createLocalAccount(cleanName, cleanEmail, password);
  }

  async function login(email, password) {
    const cleanEmail = normEmail(email);
    const fb = getFirebaseApi();

    if (fb.auth && fb.signInWithEmailAndPassword) {
      try {
        const cred = await fb.signInWithEmailAndPassword(fb.auth, cleanEmail, password);
        const local = await establishLocalSession(cred.user, null, true);
        return { ok: true, userId: local.userId, user: local.user };
      } catch (err) {
        console.warn('[Index] Falha no login Firebase, tentando legado local:', err);

        const code = String(err?.code || '');

        if (code.includes('auth/operation-not-allowed')) {
          return { ok: false, error: 'O método Email/Senha não está habilitado no Firebase.' };
        }

        if (
          code.includes('auth/user-not-found') ||
          code.includes('auth/wrong-password') ||
          code.includes('auth/invalid-credential') ||
          code.includes('auth/invalid-email')
        ) {
          return await loginLocal(cleanEmail, password);
        }

        if (code.includes('auth/too-many-requests')) {
          return { ok: false, error: 'Muitas tentativas. Aguarde e tente novamente.' };
        }

        const fallback = await loginLocal(cleanEmail, password).catch(() => null);
        if (fallback?.ok) return fallback;

        return { ok: false, error: err?.message || 'Erro ao autenticar. Tente novamente.' };
      }
    }

    return await loginLocal(cleanEmail, password);
  }

  function bind() {
    const loginForm = $('login-form');
    const signupForm = $('signup-form');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Autenticando...', 'info');

        const email = $('login-email')?.value || '';
        const pass = $('login-password')?.value || '';

        try {
          const res = await login(email, pass);
          if (!res.ok) return setStatus(res.error, 'error');

          setStatus('Login OK. Redirecionando...', 'ok');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          setStatus('Erro ao autenticar. Tente novamente.', 'error');
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setStatus('Criando conta...', 'info');

        const name = $('signup-name')?.value || '';
        const email = $('signup-email')?.value || '';
        const pass = $('signup-password')?.value || '';

        if (String(pass).length < 6) {
          return setStatus('Senha deve ter no mínimo 6 caracteres.', 'error');
        }

        try {
          const res = await createAccount(name, email, pass);
          if (!res.ok) return setStatus(res.error, 'error');

          setStatus('Conta criada. Redirecionando...', 'ok');
          window.location.href = 'dashboard.html';
        } catch (err) {
          console.error(err);
          setStatus('Erro ao criar conta. Tente novamente.', 'error');
        }
      });
    }
  }

  window.addEventListener('firebase-ready', syncAuthModeHint);

  if (window._firebaseReadyDispatched) {
    boot();
  } else {
    window.addEventListener('firebase-ready', boot, { once: true });

    setTimeout(() => {
      if (!window._firebaseReadyDispatched) {
        console.warn('[Index] Firebase não sinalizou prontidão em 5s. Iniciando mesmo assim.');
        boot();
      }
    }, 5000);
  }
})();
