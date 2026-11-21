/* =====================================================================
   platform.js — everything that differs between the web (PWA) build and
   the Android (Capacitor) build: speech, storage, saving/sharing files.
   ===================================================================== */
(function (G) {
'use strict';
const C = G.Capacitor;
const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
const _pl = {};
const plugin = n => !NATIVE ? null : (_pl[n] || (_pl[n] = (C.registerPlugin ? C.registerPlugin(n) : C.Plugins && C.Plugins[n])));

/* ---------------- speech ---------------- */
/* handlers: {partial(text), final(text), state('listening'|'idle', reason)} */
const speech = (() => {
  let h = null, want = false, state = 'idle';
  const setState = (s, r) => { state = s; h && h.state && h.state(s, r); };

  if (NATIVE) {
    const SR = plugin('SpeechRecognition'); let last = '', wired = false, perm = false;
    const wire = async () => {
      if (wired) return; wired = true;
      await SR.addListener('partialResults', d => { last = (d.matches && d.matches[0]) || last; h && h.partial && h.partial(last); });
      await SR.addListener('listeningState', d => {
        if (d.status === 'started') { setState('listening'); return; }
        if (last.trim()) { const t = last; last = ''; h && h.final && h.final(t); }
        if (want) setTimeout(() => want && run(), 150); else setState('idle', 'stopped');
      });
    };
    const run = () => SR.start({ language: 'ar-EG', maxResults: 1, partialResults: true, popup: false }).catch(e => { want = false; setState('idle', 'error'); h && h.error && h.error(String(e && e.message || e)); });
    return {
      supported: !!SR,
      get listening() { return state === 'listening' || want; },
      async start(handlers) {
        h = handlers; last = '';
        if (!perm) { const p = await SR.requestPermissions(); perm = p.speechRecognition === 'granted'; if (!perm) { h.error && h.error('not-allowed'); return false; } }
        const a = await SR.available(); if (!a.available) { h.error && h.error('unavailable'); return false; }
        await wire(); want = true; setState('listening'); run(); return true;
      },
      async stop() { want = false; try { await SR.stop(); } catch (e) {} if (last.trim()) { const t = last; last = ''; h && h.final && h.final(t); } setState('idle', 'stopped'); },
    };
  }

  const R = G.SpeechRecognition || G.webkitSpeechRecognition;
  if (!R) return { supported: false, listening: false, start: async () => false, stop: async () => {} };
  let rec = null, session = '';
  const make = () => {
    rec = new R(); rec.lang = 'ar-EG'; rec.continuous = !/Android/i.test(navigator.userAgent); rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { session = ''; setState('listening'); };
    /* Android Chrome repeats the whole utterance in every result ("قطعه", "قطعه 45", "قطعه 45 لام" …).
       So we rebuild the session text from all results, collapsing any result that extends the previous one,
       and hand it to the app ONCE when the session ends. */
    rec.onresult = e => {
      const out = [];
      for (let i = 0; i < e.results.length; i++) {
        const t = (e.results[i][0].transcript || '').trim(); if (!t) continue;
        const last = out[out.length - 1];
        if (last !== undefined && (t.startsWith(last) || last.startsWith(t))) out[out.length - 1] = t.length >= last.length ? t : last;
        else out.push(t);
      }
      session = out.join(' ');
      h && h.partial && h.partial(session);
    };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; h && h.error && h.error('not-allowed'); } };
    rec.onend = () => {
      const t = session.trim(); session = '';
      if (t && h && h.final) h.final(t);
      if (want) { try { rec.start(); } catch (x) { setTimeout(() => { try { want && rec.start(); } catch (y) {} }, 250); } } else setState('idle', 'stopped');
    };
  };
  return {
    supported: true,
    get listening() { return state === 'listening' || want; },
    async start(handlers) { h = handlers; if (!rec) make(); want = true; try { rec.start(); } catch (e) {} return true; },
    async stop() { want = false; try { rec && rec.stop(); } catch (e) {} },
  };
})();

/* ---------------- storage (IndexedDB, localStorage fallback) ---------------- */
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!G.indexedDB) return rej('no idb');
    const r = indexedDB.open('haram-violations', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const s = t.objectStore('kv'); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return {
    async get(k) { try { return await tx('readonly', s => s.get(k)); } catch (e) { try { return JSON.parse(localStorage.getItem('hv_' + k)); } catch (x) { return null; } } },
    async set(k, v) {
      const val = JSON.parse(JSON.stringify(v));
      try { await tx('readwrite', s => s.put(val, k)); } catch (e) { try { localStorage.setItem('hv_' + k, JSON.stringify(val)); } catch (x) {} }
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },
  };
})();

/* ---------------- files ---------------- */
const blobToB64 = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(b); });
const safeName = n => n.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

const files = {
  /* keeps a permanent copy (Documents/مخالفات on Android, Downloads on web) */
  async save(blob, name, mime = 'application/pdf') {
    name = safeName(name);
    if (NATIVE) {
      const FS = plugin('Filesystem'); const data = await blobToB64(blob);
      const r = await FS.writeFile({ path: 'مخالفات/' + name, data, directory: 'DOCUMENTS', recursive: true });
      return { where: 'Documents/مخالفات', uri: r.uri };
    }
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { where: 'التنزيلات' };
  },
  /* share sheet (WhatsApp, Drive, printer apps …) */
  async share(blob, name, mime = 'application/pdf') {
    name = safeName(name);
    if (NATIVE) {
      const FS = plugin('Filesystem'), SH = plugin('Share'); const data = await blobToB64(blob);
      const r = await FS.writeFile({ path: 'share/' + name, data, directory: 'CACHE', recursive: true });
      await SH.share({ title: name, files: [r.uri], dialogTitle: 'إرسال الملف' }); return true;
    }
    const f = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return true; }
    await files.save(blob, name, mime); return false;
  },
  /* open in the phone's PDF viewer (which has Print) */
  async open(blob, name) {
    name = safeName(name);
    if (NATIVE) {
      const FS = plugin('Filesystem'), FO = plugin('FileOpener'); const data = await blobToB64(blob);
      const r = await FS.writeFile({ path: 'open/' + name, data, directory: 'CACHE', recursive: true });
      await FO.open({ filePath: r.uri, contentType: 'application/pdf' }); return true;
    }
    const url = URL.createObjectURL(blob); const w = G.open(url, '_blank'); if (!w) await files.save(blob, name); return true;
  },
};

G.Plat = { NATIVE, speech, store, files };
})(window);
