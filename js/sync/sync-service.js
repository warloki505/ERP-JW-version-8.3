/* ═══════════════════════════════════════════════════════════════
   ERP JW Finance — js/sync/sync-service.js
   Versão: 8.3.0 | Data: 2026-03-22 | Autor: JW

   RESPONSABILIDADE:
   Camada híbrida de sincronização multi-device (Fase 3)
   - localStorage continua como fonte operacional primária
   - Firebase Auth REST existente fornece identidade / token
   - Firestore REST atua como camada de replicação
   - fila local garante persistência offline e retry
   - soft delete evita ressurreição de registros
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (window.SyncService) return;

  const VERSION = '8.3.0';
  const TX_SCHEMA_VERSION = 1;
  const DEFAULTS = {
    pollMs: 10_000,
    debounceMs: 3_500,
    maxRetries: 5,
    featureFlagKey: 'gf_erp_sync_feature_enabled',
    deviceIdKey: 'gf_erp_deviceId'
  };

  let currentUserId = null;
  let startedFor = null;
  let flushTimer = null;
  let pollTimer = null;
  let bootPromise = null;
  let lastStatus = 'idle';
  let lastStatusMessage = 'Sincronização inativa.';

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setStatus(status, message = '') {
    lastStatus = status;
    lastStatusMessage = message || '';

    try {
      window.dispatchEvent(new CustomEvent('erp-sync-status', {
        detail: { status, message: lastStatusMessage, timestamp: nowIso() }
      }));
    } catch {}

    attachIndicator();
    updateIndicator();
  }

  function isEnabled() {
    try {
      return localStorage.getItem(DEFAULTS.featureFlagKey) !== '0';
    } catch {
      return true;
    }
  }

  function hasFirebaseSession() {
    return !!(window.firebaseState?.enabled && window.firebaseCurrentUser?.uid);
  }

  function isOnlineCapable() {
    return navigator.onLine !== false && hasFirebaseSession();
  }

  function ensureDeviceId() {
    try {
      let existing = localStorage.getItem(DEFAULTS.deviceIdKey);
      if (existing) return existing;
      existing = (crypto?.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(DEFAULTS.deviceIdKey, existing);
      return existing;
    } catch {
      return 'device-unavailable';
    }
  }

  function getDeviceId() {
    return ensureDeviceId();
  }

  function getQueueKey(userId) {
    return `gf_erp_syncQueue_${userId}`;
  }

  function getShadowKey(userId) {
    return `gf_erp_syncShadow_${userId}`;
  }

  function getBootstrapKey(userId) {
    return `gf_erp_syncBootstrap_${userId}`;
  }

  function getLastPullKey(userId) {
    return `gf_erp_syncLastPull_${userId}`;
  }

  function readQueue(userId = currentUserId) {
    if (!userId) return [];
    return safeJsonParse(localStorage.getItem(getQueueKey(userId)), []);
  }

  function writeQueue(queue, userId = currentUserId) {
    if (!userId) return;
    localStorage.setItem(getQueueKey(userId), JSON.stringify(Array.isArray(queue) ? queue : []));
  }

  function readShadow(userId = currentUserId) {
    if (!userId) return {};
    return safeJsonParse(localStorage.getItem(getShadowKey(userId)), {});
  }

  function writeShadow(shadow, userId = currentUserId) {
    if (!userId) return;
    localStorage.setItem(getShadowKey(userId), JSON.stringify(shadow || {}));
  }

  function featureLocalOnlyReason() {
    if (!isEnabled()) return 'Feature flag desabilitada';
    if (!window.firebaseState?.enabled) return 'Firebase indisponível neste ambiente';
    if (!window.firebaseCurrentUser?.uid) return 'Usuário não autenticado no Firebase';
    if (navigator.onLine === false) return 'Sem conexão';
    return '';
  }

  async function getIdToken() {
    try {
      return await window.firebaseCurrentUser?.getIdToken?.();
    } catch {
      return '';
    }
  }

  function getProjectId() {
    return window.firebaseApp?.config?.projectId || window.firebaseAuth?.projectId || '';
  }

  function getFirebaseUid() {
    return window.firebaseCurrentUser?.uid || '';
  }

  function getFirestoreRoot() {
    const projectId = getProjectId();
    if (!projectId) return '';
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  }

  function textHash(value) {
    const s = String(value || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }

  function normalizeTx(tx, userId, monthId, preserveDeleted = true) {
    const now = nowIso();
    const current = tx || {};
    const deletedAt = preserveDeleted ? (current.deletedAt || null) : null;
    return {
      id: String(current.id || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`)),
      userId: String(current.userId || userId || ''),
      monthId: String(current.monthId || monthId || ((current.data || '').slice(0, 7)) || ''),
      tipo: current.tipo || 'receita',
      subtipo: current.subtipo || undefined,
      data: current.data || `${monthId || Core.month.getMonthId()}-01`,
      valor: Number(current.valor) || 0,
      categoria: current.categoria || '',
      banco: current.banco || '',
      descricao: current.descricao || '',
      auto: current.auto === true,
      recurrenceId: current.recurrenceId || null,
      createdAt: current.createdAt || now,
      updatedAt: current.updatedAt || now,
      deletedAt,
      deviceId: current.deviceId || getDeviceId(),
      schemaVersion: Number(current.schemaVersion) || TX_SCHEMA_VERSION
    };
  }

  function normalizeTxList(userId, monthId, list) {
    return (Array.isArray(list) ? list : []).map((tx) => normalizeTx(tx, userId, monthId));
  }

  function visibleTx(list) {
    return (Array.isArray(list) ? list : []).filter((tx) => !tx?.deletedAt);
  }

  function listUserMonthKeys(userId) {
    const prefix = `gf_erp_tx_${userId}_`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .filter((k) => /^gf_erp_tx_[^_]+_\d{4}-\d{2}$/.test(k));
  }

  function listBudgetKeys(userId) {
    const prefix = `gf_erp_budgetpct_${userId}_`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .filter((k) => /^gf_erp_budgetpct_[^_]+_\d{4}-\d{2}$/.test(k));
  }

  function getSettingKeys(userId) {
    return [
      Core.keys.user(userId),
      Core.keys.goals(userId),
      Core.keys.cfgCats(userId),
      Core.keys.cfgBanks(userId),
      Core.keys.theme(userId),
      Core.keys.selectedMonth(userId),
      Core.keys.recorr(userId),
      ...listBudgetKeys(userId)
    ];
  }

  function mapSettingKeyToDoc(key, userId) {
    if (key === Core.keys.user(userId)) return { kind: 'profile', docId: 'profile' };
    if (key === Core.keys.goals(userId)) return { kind: 'goals', docId: 'goals' };
    if (key === Core.keys.cfgCats(userId)) return { kind: 'cfgCats', docId: 'cfgCats' };
    if (key === Core.keys.cfgBanks(userId)) return { kind: 'cfgBanks', docId: 'cfgBanks' };
    if (key === Core.keys.theme(userId)) return { kind: 'theme', docId: 'theme' };
    if (key === Core.keys.selectedMonth(userId)) return { kind: 'selectedMonth', docId: 'selectedMonth' };
    if (key === Core.keys.recorr(userId)) return { kind: 'recorr', docId: 'recorr' };
    const budgetMatch = key.match(/^gf_erp_budgetpct_[^_]+_(\d{4}-\d{2})$/);
    if (budgetMatch) return { kind: 'budgetPct', docId: `budgetPct_${budgetMatch[1]}`, monthId: budgetMatch[1] };
    return null;
  }

  function buildUserShadow(userId) {
    const shadow = {};
    listUserMonthKeys(userId).forEach((key) => {
      shadow[key] = textHash(localStorage.getItem(key) || '');
    });
    getSettingKeys(userId).forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) shadow[key] = textHash(raw);
    });
    return shadow;
  }

  function dedupeQueue(queue) {
    const map = new Map();
    (Array.isArray(queue) ? queue : []).forEach((item) => {
      if (!item) return;
      const key = `${item.scope || 'tx'}:${item.docId || item.payload?.id || item.queueId}`;
      map.set(key, item);
    });
    return Array.from(map.values());
  }

  function enqueue(item, userId = currentUserId) {
    if (!userId || !item) return null;
    const queue = readQueue(userId);
    const queueId = item.queueId || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    const record = {
      queueId,
      scope: item.scope || 'tx',
      docId: item.docId || item.payload?.id || queueId,
      type: item.type || 'update',
      payload: item.payload || null,
      timestamp: item.timestamp || nowIso(),
      status: item.status || 'pending',
      retries: Number(item.retries) || 0,
      deviceId: getDeviceId()
    };
    queue.push(record);
    writeQueue(dedupeQueue(queue), userId);
    scheduleFlush(600);
    updateIndicator();
    return record;
  }

  function enqueueTxList(userId, monthId, list) {
    normalizeTxList(userId, monthId, list).forEach((tx) => {
      enqueue({
        scope: 'tx',
        docId: tx.id,
        type: tx.deletedAt ? 'delete' : 'update',
        payload: tx
      }, userId);
    });
  }

  function enqueueSetting(key, rawValue, userId) {
    const meta = mapSettingKeyToDoc(key, userId);
    if (!meta) return;
    let payload = null;
    if (rawValue !== null && rawValue !== undefined) {
      payload = safeJsonParse(rawValue, rawValue);
      if (meta.kind === 'profile' && payload && typeof payload === 'object') {
        const clone = { ...payload };
        delete clone.passwordHash;
        payload = clone;
      }
    }
    enqueue({
      scope: 'setting',
      docId: meta.docId,
      type: 'update',
      payload: {
        key,
        kind: meta.kind,
        monthId: meta.monthId || null,
        value: payload,
        updatedAt: nowIso(),
        deviceId: getDeviceId(),
        schemaVersion: TX_SCHEMA_VERSION
      }
    }, userId);
  }

  function scanLocalChanges(userId = currentUserId) {
    if (!userId) return;
    const shadow = readShadow(userId);
    const current = buildUserShadow(userId);

    listUserMonthKeys(userId).forEach((key) => {
      if (shadow[key] === current[key]) return;
      const monthId = key.slice(key.length - 7);
      const list = safeJsonParse(localStorage.getItem(key), []);
      enqueueTxList(userId, monthId, list);
    });

    getSettingKeys(userId).forEach((key) => {
      const raw = localStorage.getItem(key);
      const hash = raw === null ? null : textHash(raw);
      if (shadow[key] === hash) return;
      if (raw !== null) enqueueSetting(key, raw, userId);
    });

    writeShadow(current, userId);
    updateIndicator();
  }

  function migrateLocalTxSchema(userId = currentUserId) {
    if (!userId) return;
    let changedAny = false;
    listUserMonthKeys(userId).forEach((key) => {
      const monthId = key.slice(key.length - 7);
      const list = safeJsonParse(localStorage.getItem(key), []);
      const normalized = normalizeTxList(userId, monthId, list);
      const a = JSON.stringify(list || []);
      const b = JSON.stringify(normalized);
      if (a !== b) {
        localStorage.setItem(key, b);
        changedAny = true;
      }
    });
    if (changedAny) writeShadow(buildUserShadow(userId), userId);
  }

  function markBootstrapDone(userId = currentUserId) {
    if (!userId) return;
    localStorage.setItem(getBootstrapKey(userId), nowIso());
  }

  function hasBootstrap(userId = currentUserId) {
    if (!userId) return false;
    return !!localStorage.getItem(getBootstrapKey(userId));
  }

  function hasAnyLocalData(userId = currentUserId) {
    if (!userId) return false;
    return listUserMonthKeys(userId).length > 0 || getSettingKeys(userId).some((k) => localStorage.getItem(k) !== null);
  }

  function cmpIso(a, b) {
    return new Date(a || 0).getTime() - new Date(b || 0).getTime();
  }

  function mergeRemoteTx(remoteTx, userId = currentUserId) {
    if (!remoteTx?.id) return false;
    const monthId = remoteTx.monthId || String(remoteTx.data || '').slice(0, 7) || Core.month.getMonthId(new Date());
    const key = Core.keys.tx(userId, monthId);
    const list = safeJsonParse(localStorage.getItem(key), []);
    const normalizedRemote = normalizeTx(remoteTx, userId, monthId);
    const idx = list.findIndex((item) => item?.id === normalizedRemote.id);
    let changed = false;

    if (idx === -1) {
      list.push(normalizedRemote);
      changed = true;
    } else {
      const localTx = normalizeTx(list[idx], userId, monthId);
      if (cmpIso(normalizedRemote.updatedAt, localTx.updatedAt) > 0) {
        list[idx] = { ...localTx, ...normalizedRemote };
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem(key, JSON.stringify(list));
    }
    return changed;
  }

  function applyRemoteSetting(docId, payload, userId = currentUserId) {
    if (!docId || !userId || !payload) return false;
    let key = null;
    if (docId === 'profile') key = Core.keys.user(userId);
    else if (docId === 'goals') key = Core.keys.goals(userId);
    else if (docId === 'cfgCats') key = Core.keys.cfgCats(userId);
    else if (docId === 'cfgBanks') key = Core.keys.cfgBanks(userId);
    else if (docId === 'theme') key = Core.keys.theme(userId);
    else if (docId === 'selectedMonth') key = Core.keys.selectedMonth(userId);
    else if (docId === 'recorr') key = Core.keys.recorr(userId);
    else if (docId.startsWith('budgetPct_')) {
      const monthId = docId.replace('budgetPct_', '');
      key = Core.keys.budgetPct(userId, monthId);
    }
    if (!key) return false;

    const incoming = payload.value;
    const currentRaw = localStorage.getItem(key);
    const currentObj = safeJsonParse(currentRaw, currentRaw);
    const currentUpdatedAt = currentObj?.updatedAt || currentObj?.meta?.updatedAt || '';
    const remoteUpdatedAt = payload.updatedAt || '';

    if (currentRaw !== null && currentUpdatedAt && remoteUpdatedAt && cmpIso(remoteUpdatedAt, currentUpdatedAt) <= 0) {
      return false;
    }

    const toSave = typeof incoming === 'string' ? incoming : JSON.stringify(incoming);
    localStorage.setItem(key, toSave);
    return true;
  }

  async function firestoreFetchJson(url, options = {}) {
    const token = await getIdToken();
    if (!token) throw new Error('Sem token Firebase válido para Firestore.');
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error?.message || `HTTP ${response.status}`);
      err.response = data;
      throw err;
    }
    return data;
  }

  function encodeDocPath(parts) {
    return parts.map((x) => encodeURIComponent(String(x))).join('/');
  }

  function toFirestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    const t = typeof value;
    if (t === 'string') return { stringValue: value };
    if (t === 'boolean') return { booleanValue: value };
    if (t === 'number') {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (t === 'object') {
      const fields = {};
      Object.entries(value).forEach(([k, v]) => {
        fields[k] = toFirestoreValue(v);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function fromFirestoreValue(node) {
    if (!node) return null;
    if ('stringValue' in node) return node.stringValue;
    if ('booleanValue' in node) return !!node.booleanValue;
    if ('integerValue' in node) return Number(node.integerValue);
    if ('doubleValue' in node) return Number(node.doubleValue);
    if ('timestampValue' in node) return node.timestampValue;
    if ('nullValue' in node) return null;
    if ('arrayValue' in node) return (node.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in node) {
      const out = {};
      const fields = node.mapValue.fields || {};
      Object.entries(fields).forEach(([k, v]) => {
        out[k] = fromFirestoreValue(v);
      });
      return out;
    }
    return null;
  }

  function firestoreFieldsToObject(fields) {
    const out = {};
    Object.entries(fields || {}).forEach(([key, value]) => {
      out[key] = fromFirestoreValue(value);
    });
    return out;
  }

  async function upsertRemoteTx(tx) {
    const root = getFirestoreRoot();
    const firebaseUid = getFirebaseUid();
    if (!root || !firebaseUid) throw new Error('Firestore indisponível.');
    const docPath = `${root}/${encodeDocPath(['users', firebaseUid, 'transactions', tx.id])}`;
    const fields = {};
    Object.entries(tx).forEach(([k, v]) => { fields[k] = toFirestoreValue(v); });
    await firestoreFetchJson(docPath, { method: 'PATCH', body: JSON.stringify({ fields }) });
  }

  async function upsertRemoteSetting(docId, payload) {
    const root = getFirestoreRoot();
    const firebaseUid = getFirebaseUid();
    if (!root || !firebaseUid) throw new Error('Firestore indisponível.');
    const docPath = `${root}/${encodeDocPath(['users', firebaseUid, 'settings', docId])}`;
    const body = {
      fields: {
        docId: toFirestoreValue(docId),
        kind: toFirestoreValue(payload.kind || ''),
        key: toFirestoreValue(payload.key || ''),
        monthId: toFirestoreValue(payload.monthId || null),
        updatedAt: toFirestoreValue(payload.updatedAt || nowIso()),
        deviceId: toFirestoreValue(payload.deviceId || getDeviceId()),
        schemaVersion: toFirestoreValue(Number(payload.schemaVersion) || TX_SCHEMA_VERSION),
        value: toFirestoreValue(payload.value)
      }
    };
    await firestoreFetchJson(docPath, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async function listRemoteCollection(collectionId, sinceIso = '') {
    const root = getFirestoreRoot();
    const firebaseUid = getFirebaseUid();
    if (!root || !firebaseUid) return [];

    let pageToken = '';
    const out = [];
    do {
      const query = new URLSearchParams({ pageSize: '500' });
      if (pageToken) query.set('pageToken', pageToken);
      // Filtro de tempo: só baixa documentos atualizados após o último pull
      // Usa o campo updatedAt via Firestore REST structured query quando possível
      if (sinceIso) query.set('orderBy', 'updatedAt');
      const url = `${root}/${encodeDocPath(['users', firebaseUid, collectionId])}?${query.toString()}`;
      const data = await firestoreFetchJson(url, { method: 'GET' });
      (data.documents || []).forEach((doc) => {
        const fields = firestoreFieldsToObject(doc.fields || {});
        // Filtro client-side: ignorar docs não alterados desde o último pull
        if (sinceIso && fields.updatedAt && fields.updatedAt <= sinceIso) return;
        out.push(fields);
      });
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    return out;
  }

  async function flush(userId = currentUserId) {
    if (!userId) return;
    if (!isEnabled()) {
      setStatus('disabled', 'Sincronização desabilitada pela feature flag.');
      return;
    }

    scanLocalChanges(userId);
    const queue = readQueue(userId);
    const pending = queue.filter((item) => item.status === 'pending' || item.status === 'error');

    if (!pending.length) {
      // Se há itens failed na fila, manter status de erro mesmo sem pendentes
      const hasFailed = queue.some((item) => item.status === 'failed');
      if (hasFailed) {
        const failedCount = queue.filter((i) => i.status === 'failed').length;
        setStatus('error', `${failedCount} operação(ões) com falha definitiva na fila.`);
        return;
      }
      setStatus(isOnlineCapable() ? 'synced' : 'offline', isOnlineCapable() ? 'Todos os dados estão sincronizados.' : featureLocalOnlyReason());
      return;
    }

    if (!isOnlineCapable()) {
      setStatus('offline', featureLocalOnlyReason() || 'Sem conexão. Dados mantidos localmente.');
      return;
    }

    setStatus('pending', `Sincronizando ${pending.length} operação(ões)...`);

    for (const item of pending) {
      try {
        if (item.scope === 'tx') await upsertRemoteTx(item.payload || {});
        else await upsertRemoteSetting(item.docId, item.payload || {});
        item.status = 'synced';
        item.syncedAt = nowIso();
        item.error = '';
      } catch (err) {
        item.status = 'error';
        item.error = String(err?.message || err);
        item.retries = Number(item.retries || 0) + 1;
        // Backoff exponencial: 5s, 10s, 20s, 40s, 80s (cap 120s)
        const backoffMs = Math.min(5_000 * Math.pow(2, item.retries - 1), 120_000);
        if (item.retries > DEFAULTS.maxRetries) {
          item.status = 'failed';
          setStatus('error', `Falha persistente ao sincronizar ${item.docId || item.queueId}.`);
        } else {
          scheduleFlush(backoffMs);
        }
      }
    }

    const kept = queue.filter((item) => {
      // Remover synced após 24h
      if (item.status === 'synced') {
        const syncedAt = new Date(item.syncedAt || item.timestamp || 0).getTime();
        return (Date.now() - syncedAt) < 24 * 60 * 60 * 1000;
      }
      // Remover failed definitivo após 7 dias (evita acúmulo infinito)
      if (item.status === 'failed') {
        const ts = new Date(item.timestamp || 0).getTime();
        return (Date.now() - ts) < 7 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
    writeQueue(kept, userId);

    // IMPORTANTE: tratar 'failed' como erro real — não mascarar como synced
    const errors = kept.filter((item) => item.status === 'error' || item.status === 'failed');
    if (errors.length) {
      const failedCount = errors.filter((i) => i.status === 'failed').length;
      const errorCount  = errors.filter((i) => i.status === 'error').length;
      const parts = [];
      if (errorCount)  parts.push(`${errorCount} com erro temporário`);
      if (failedCount) parts.push(`${failedCount} com falha definitiva`);
      setStatus('error', `Sincronização incompleta: ${parts.join(', ')}.`);
      return;
    }

    localStorage.setItem(getLastPullKey(userId), nowIso());
    setStatus('synced', 'Todos os dados estão sincronizados.');
  }

  async function pullRemote(userId = currentUserId) {
    if (!userId || !isOnlineCapable()) return;
    // Incremental: só baixa documentos alterados após o último pull bem-sucedido
    const lastPull = localStorage.getItem(getLastPullKey(userId)) || '';
    let changed = false;
    const txDocs = await listRemoteCollection('transactions', lastPull);
    txDocs.forEach((doc) => {
      if (mergeRemoteTx(doc, userId)) changed = true;
    });

    const settingsDocs = await listRemoteCollection('settings', lastPull);
    settingsDocs.forEach((doc) => {
      if (applyRemoteSetting(doc.docId, doc, userId)) changed = true;
    });

    if (changed) {
      writeShadow(buildUserShadow(userId), userId);
    }

    localStorage.setItem(getLastPullKey(userId), nowIso());
  }

  async function bootstrap(userId = currentUserId) {
    if (!userId || !isOnlineCapable()) return;
    if (hasBootstrap(userId) && hasAnyLocalData(userId)) {
      await pullRemote(userId);
      return;
    }

    setStatus('pending', 'Executando bootstrap do dispositivo...');
    // Pull remoto: em dispositivo novo, gf_erp_syncLastPull_<userId> não existe,
    // então lastPull = '' e listRemoteCollection não aplica filtro de tempo —
    // resultado: download completo de todas as coleções do Firestore (comportamento correto).
    await pullRemote(userId);
    if (!localStorage.getItem(Core.keys.user(userId))) {
      const email = window.firebaseCurrentUser?.email || '';
      const displayName = window.firebaseCurrentUser?.displayName || email.split('@')[0] || 'Usuário';
      localStorage.setItem(Core.keys.user(userId), JSON.stringify({
        nome: displayName,
        email,
        firebaseUid: getFirebaseUid(),
        authProvider: 'firebase',
        createdAt: nowIso(),
        updatedAt: nowIso()
      }));
    }
    markBootstrapDone(userId);
    writeShadow(buildUserShadow(userId), userId);
    setStatus('synced', 'Bootstrap concluído.');
  }

  function scheduleFlush(ms = DEFAULTS.debounceMs) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flush().catch((err) => {
        console.error('[SyncService] flush falhou:', err);
        setStatus('error', String(err?.message || err));
      });
    }, ms);
  }

  function attachIndicator() {
    const actions = document.querySelector('.topbar__actions');
    if (!actions || document.getElementById('syncStatusBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'syncStatusBadge';
    badge.className = 'sync-badge sync-badge--neutral';
    badge.textContent = 'Sync: —';
    badge.title = 'Status da sincronização';
    actions.insertBefore(badge, actions.firstChild || null);
  }

  function updateIndicator() {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;
    const queue = readQueue(currentUserId);
    const pending = queue.filter((item) => item.status === 'pending').length;
    const failed  = queue.filter((item) => item.status === 'error' || item.status === 'failed').length;
    const suffix = pending ? ` • ${pending} pend.` : '';

    let cls = 'sync-badge--neutral';
    let text = 'Sync: —';

    if (lastStatus === 'synced') {
      cls = 'sync-badge--ok';
      text = 'Sync: OK';
    } else if (lastStatus === 'pending') {
      cls = 'sync-badge--pending';
      text = `Sync: pendente${suffix}`;
    } else if (lastStatus === 'offline') {
      cls = 'sync-badge--offline';
      text = 'Sync: offline';
    } else if (lastStatus === 'error') {
      cls = 'sync-badge--error';
      text = `Sync: erro${failed ? ` (${failed})` : ''}`;
    } else if (lastStatus === 'disabled') {
      cls = 'sync-badge--offline';
      text = 'Sync: desabilitado';
    }

    badge.className = `sync-badge ${cls}`;
    badge.textContent = text;
    badge.title = lastStatusMessage || text;
  }

  function bindGlobalEvents() {
    if (window.__erpSyncBound) return;
    window.__erpSyncBound = true;

    window.addEventListener('online', () => {
      setStatus('pending', 'Conexão restaurada. Sincronizando...');
      scheduleFlush(300);
      pullRemote().catch((err) => setStatus('error', String(err?.message || err)));
    });

    window.addEventListener('focus', () => {
      if (currentUserId) {
        scanLocalChanges(currentUserId);
        if (isOnlineCapable()) {
          pullRemote(currentUserId).catch((err) => setStatus('error', String(err?.message || err)));
          scheduleFlush(300);
        }
      }
    });

    window.addEventListener('storage', (evt) => {
      if (!currentUserId) return;
      if (!evt.key) return;
      if (!evt.key.includes(currentUserId)) return;
      scanLocalChanges(currentUserId);
      updateIndicator();
    });
  }

  async function start(userId = Core.user?.getCurrentUserId?.()) {
    if (!userId) return;
    currentUserId = userId;
    attachIndicator();
    bindGlobalEvents();
    ensureDeviceId();
    migrateLocalTxSchema(userId);
    scanLocalChanges(userId);
    updateIndicator();

    if (startedFor === userId && bootPromise) return bootPromise;
    startedFor = userId;

    bootPromise = (async () => {
      if (!isEnabled()) {
        setStatus('disabled', 'Sincronização desabilitada pela feature flag.');
        return;
      }

      if (!hasFirebaseSession()) {
        setStatus('offline', featureLocalOnlyReason() || 'Modo local ativo.');
        return;
      }

      try {
        await bootstrap(userId);
        await flush(userId);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
          if (!currentUserId) return;
          scanLocalChanges(currentUserId);
          pullRemote(currentUserId)
            .then(() => flush(currentUserId))
            .catch((err) => setStatus('error', String(err?.message || err)));
        }, DEFAULTS.pollMs);
      } catch (err) {
        console.error('[SyncService] start falhou:', err);
        setStatus('error', String(err?.message || err));
      }
    })();

    return bootPromise;
  }

  function stop() {
    if (flushTimer) clearTimeout(flushTimer);
    if (pollTimer) clearInterval(pollTimer);
    flushTimer = null;
    pollTimer = null;
    currentUserId = null;
    startedFor = null;
    bootPromise = null;
  }

  function markDirty() {
    if (!currentUserId) return;
    scanLocalChanges(currentUserId);
    scheduleFlush(500);
  }

  window.SyncService = {
    VERSION,
    TX_SCHEMA_VERSION,
    start,
    stop,
    flush,
    pullRemote,
    bootstrap,
    scanLocalChanges,
    markDirty,
    visibleTx,
    normalizeTx,
    normalizeTxList,
    getDeviceId,
    isEnabled,
    enqueue,
    readQueue,
    getStatus() {
      return { status: lastStatus, message: lastStatusMessage };
    }
  };
})();
