(function () {
  'use strict';

  var LATEST_MS = 5 * 60 * 1000;
  var likes = {};
  window.gruLikes = likes;
  var activeDevId = null;
  var extTab = null;
  var pollSmsTimer = null;

  var NOTES_KEY = 'gru_dev_notes';
  var OTP_KEY = 'gru_otp_notes';

  function readNotes(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeNotes(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
  function getNote(id) { return readNotes(NOTES_KEY)[id] || ''; }
  function setNote(id, text) {
    var n = readNotes(NOTES_KEY);
    if (text) n[id] = text; else delete n[id];
    writeNotes(NOTES_KEY, n);
  }
  function getOtpNote(id) { return readNotes(OTP_KEY)[id] || ''; }
  function setOtpNote(id, text) {
    var n = readNotes(OTP_KEY);
    if (text) n[id] = text; else delete n[id];
    writeNotes(OTP_KEY, n);
  }

  var TG = 'https://t.me/+22GMCxzuaw81YTZl';

  function injectSplash() {
    if (document.getElementById('gru-splash')) return;
    var s = document.createElement('div');
    s.id = 'gru-splash';
    s.innerHTML = '<img src="/static/img/logo.png?v=1" alt="Anonymous Guru"><h1>Anounymous_Gru</h1><p>Device Management Console</p>';
    document.body.insertBefore(s, document.body.firstChild);
    var img = s.querySelector('img');
    img.onerror = function () { this.onerror = null; this.src = '/static/img/logo.png'; };
    setTimeout(function () {
      s.classList.add('hide');
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 550);
    }, 1100);
  }

  var LOGO = '/static/img/logo.png?v=1';

  function fixLogos() {
    document.querySelectorAll('img.gru-logo-lg, img.gru-logo-sm, #gru-splash img').forEach(function (img) {
      if (img.getAttribute('src') && img.getAttribute('src').indexOf('logo.png') >= 0) {
        img.dataset.gruFixed = '1';
        return;
      }
      img.dataset.gruFixed = '1';
      img.src = LOGO;
      img.alt = 'Anonymous Guru';
    });
  }

  function tgLinkEl() {
    var a = document.createElement('a');
    a.id = 'gru-tg-link';
    a.href = TG;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'gru-tg-link';
    a.title = 'Join Telegram Channel';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg><span>Join Channel</span>';
    return a;
  }

  function injectConnectTgLink() {
    var brand = document.querySelector('.text-center a.gru-brand-link');
    if (!brand) return;
    if (!brand.getAttribute('href')) {
      brand.setAttribute('href', TG);
      brand.setAttribute('target', '_blank');
      brand.setAttribute('rel', 'noopener noreferrer');
    }
    var old = document.getElementById('gru-tg-link');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  injectSplash();

  function api(path, data, method) {
    var o = { headers: { Accept: 'application/json' } };
    o.method = method || (data ? 'POST' : 'GET');
    if (data) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(data);
    }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function getExtras() {
    try { return JSON.parse(localStorage.getItem('gru_fb_extra') || '[]') || []; } catch (e) { return []; }
  }
  function saveExtras(list) {
    try { localStorage.setItem('gru_fb_extra', JSON.stringify(list || [])); } catch (e) {}
  }
  function syncExtras() {
    var list = getExtras().filter(function (e) { return e && e.url; });
    var seq = Promise.resolve();
    list.forEach(function (e) {
      seq = seq.then(function () {
        return api('/api/firebases/add', { url: e.url, key: e.key || '' }).catch(function () {});
      });
    });
    return seq;
  }

  function readSavedAccounts() {
    try { return JSON.parse(localStorage.getItem('flixy_accounts') || '[]') || []; } catch (e) { return []; }
  }
  function saveToSavedAccounts(items) {
    try {
      var acc = readSavedAccounts();
      (items || []).forEach(function (it) {
        if (!it || !it.url) return;
        var u = String(it.url).trim().replace(/\/+$/, '');
        if (acc.some(function (a) { return String(a.url || a.firebaseUrl || '').trim().replace(/\/+$/, '') === u; })) return;
        acc.push({
          id: Date.now() + Math.floor(Math.random() * 900) + 1,
          url: u,
          key: String(it.key || '').trim(),
          date: new Date().toLocaleString()
        });
      });
      localStorage.setItem('flixy_accounts', JSON.stringify(acc));
    } catch (e) {}
  }

  function gruSharePayload(list) {
    var clean = (list || []).filter(function (i) { return i && i.url; }).map(function (i) {
      return { url: String(i.url).trim().replace(/\/+$/, ''), key: String(i.key || '').trim() };
    });
    if (!clean.length) return null;
    var raw = JSON.stringify(clean);
    var b64 = btoa(unescape(encodeURIComponent(raw)));
    return window.location.origin + window.location.pathname + '?gb=' + encodeURIComponent(b64);
  }
  window.gruShareLink = function (list) {
    var link = gruSharePayload(list);
    if (!link) return Promise.resolve(null);
    copyText(link, '📛 Share link copied — koi bhi ise kholke SABHI firebases ek saath connect karega');
    return Promise.resolve(link);
  };
  window.gruBuildShareList = function () {
    var list = [];
    var pri = window.__gruFbMain || window.__gruFb;
    if (pri && pri.url) list.push({ url: pri.url, key: pri.key || '' });
    getExtras().forEach(function (x) { if (x && x.url) list.push({ url: x.url, key: x.key || '' }); });
    return list;
  };
  function decodeGb(b64) {
    var raw = decodeURIComponent(escape(atob(String(b64 || '').replace(/-/g, '+').replace(/_/g, '/'))));
    var arr = JSON.parse(raw);
    return (arr || []).filter(function (i) { return i && i.url; }).map(function (i) {
      return { url: String(i.url).trim().replace(/\/+$/, ''), key: String(i.key || '').trim() };
    });
  }
  function handleGroupShare() {
    if (window.__gruShareHandled) return;
    var p = null;
    try { p = new URLSearchParams(window.location.search); } catch (e) {}
    if (!p || !p.get('gb')) return;
    window.__gruShareHandled = true;
    var items = null;
    try { items = decodeGb(p.get('gb')); } catch (e) { items = null; }
    try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
    if (!items || !items.length) { toast('Share link valid nahi hai'); return; }
    toast('📛 Shared firebases connect ho rahe hain...');
    window.gruBulkConnect(items).then(function (res) {
      if (res && res.count) {
        toast('💥 ' + res.count + ' firebase connected');
        setTimeout(function () { window.location.reload(); }, 1400);
      } else {
        toast('Share me koi active firebase nahi mila');
      }
    }).catch(function () {
      toast('Share connect failed');
    });
  }

  window.gruSyncConnect = function (url, key) {
    window.__gruFb = { url: String(url || '').trim(), key: String(key || '').trim() };
    window.__gruFbMain = { url: window.__gruFb.url, key: window.__gruFb.key };
    try { localStorage.setItem('gru_fb_creds', JSON.stringify(window.__gruFb)); } catch (e) {}
    saveToSavedAccounts([{ url: window.__gruFb.url, key: window.__gruFb.key }]);
    return api('/api/connect', { dbUrl: url, creds: key || '' }).then(function (r) {
      if (r && r.ok === false) return r;
      return syncExtras().then(function () { return { ok: true }; });
    });
  };

  window.gruSyncDisconnect = function () {
    window.__gruFb = null;
    window.__gruFbMain = null;
    try { localStorage.removeItem('gru_fb_creds'); } catch (e) {}
    return api('/api/disconnect', {}).then(function () {
      try { localStorage.removeItem('gru_fb_extra'); } catch (e) {}
      return { ok: true };
    });
  };

  window.gruFirebasesSync = syncExtras;
  window.gruGetFirebases = getExtras;
  window.gruSaveFirebases = saveExtras;
  window.gruAddFirebase = function (url, key) {
    var list = getExtras();
    url = String(url || '').trim();
    key = String(key || '').trim();
    if (!url) return Promise.reject(new Error('URL required'));
    if (list.some(function (e) { return e.url === url; })) return Promise.reject(new Error('Already added'));
    return api('/api/firebases/add', { url: url, key: key }).then(function (r) {
      if (r.ok === false || (r.error)) throw new Error(r.error || 'Failed');
      list.push({ url: url, key: key });
      saveExtras(list);
      return r;
    });
  };
  window.gruRemoveFirebase = function (url) {
    var list = getExtras().filter(function (e) { return e.url !== url; });
    saveExtras(list);
    return api('/api/firebases/remove', { url: url });
  };

  function getFbCreds() {
    if (window.__gruFb && window.__gruFb.url) return window.__gruFb;
    try {
      var saved = JSON.parse(localStorage.getItem('gru_fb_creds') || 'null');
      if (saved && saved.url) { window.__gruFb = saved; return saved; }
    } catch (e) {}
    try {
      var acc = JSON.parse(localStorage.getItem('flixy_accounts') || '[]');
      if (acc && acc.length) {
        var a = acc[acc.length - 1];
        var url = a.firebaseUrl || a.url || '';
        var key = a.apiKey || a.key || a.creds || '';
        if (url) {
          window.__gruFb = { url: url, key: key };
          return window.__gruFb;
        }
      }
    } catch (e) {}
    try {
      var q = new URLSearchParams(window.location.search).get('s');
      if (q) {
        var raw = decodeURIComponent(escape(atob(q)));
        var parts = raw.split('|||');
        if (parts[0]) {
          window.__gruFb = { url: parts[0], key: parts[1] || '' };
          return window.__gruFb;
        }
      }
    } catch (e) {}
    return null;
  }

  function maskFbUrl(u) {
    var s = String(u || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    var dot = s.indexOf('.');
    if (dot <= 0) return s;
    var first = s.slice(0, dot);
    var rest = s.slice(dot);
    if (first.length <= 5) return first + rest;
    return first.slice(0, 2) + '*****' + first.slice(-3) + rest;
  }
  window.gruMaskFbUrl = maskFbUrl;

  var FB_AUTO_RX = /https?:\/\/[a-z0-9][a-z0-9.-]*\.(?:firebaseio\.com|firebasedatabase\.app)[^\s]*/gi;
  var FB_BARE_RX = /(?:^|[^\w:/.\u25b6])([a-z0-9][a-z0-9-]*\.(?:firebaseio\.com|firebasedatabase\.app))/gi;
  var KEY_LABEL_RX = /(?:auth\s*key|secret|api[_ -]?key|creds?)\s*[:ï¼š]?\s*([A-Za-z0-9_\-.]{6,})/i;

  function cleanFbUrl(m) {
    return String(m || '').replace(/[\]\)}>."'`,;ï¼š]+$/g, '').replace(/\/\.json(\?.*)?$/i, '').replace(/\/+$/, '').trim();
  }

  function bulkParse(text) {
    var src = String(text || '');
    var matches = [];
    FB_AUTO_RX.lastIndex = 0;
    var m;
    while ((m = FB_AUTO_RX.exec(src)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] });
    }
    FB_BARE_RX.lastIndex = 0;
    while ((m = FB_BARE_RX.exec(src)) !== null) {
      var s = m.index + m[0].indexOf(m[1]);
      var e = s + m[1].length;
      var inside = false;
      for (var q = 0; q < matches.length; q++) {
        if (s >= matches[q].start && e <= matches[q].end) { inside = true; break; }
      }
      if (!inside) matches.push({ start: s, end: e, raw: 'https://' + m[1] });
    }
    matches.sort(function (a, b) { return a.start - b.start; });
    var out = [];
    var seen = {};
    for (var i = 0; i < matches.length; i++) {
      var mt = matches[i];
      var url = cleanFbUrl(mt.raw);
      if (!/\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(url)) continue;
      var nextStart = matches[i + 1] ? matches[i + 1].start : src.length;
      var block = src.slice(mt.end, Math.min(nextStart, mt.end + 500));
      var inline = null;
      var mm = src.slice(mt.end).match(/^\s*\|\|\|\s*([^\r\n]+)/);
      if (mm) inline = mm[1].trim().split(/\s+/)[0];
      var key = inline || '';
      if (!key) {
        var lm = block.match(KEY_LABEL_RX);
        if (lm) key = lm[1];
      }
      if (!key) {
        var tm = block.match(/AIza[0-9A-Za-z_-]{35}|[0-9a-fA-F]{40}|AAAA[0-9A-Za-z_-]{30,}/);
        if (tm) key = tm[0];
      }
      var norm = url.toLowerCase().replace(/\/+$/, '');
      if (seen[norm]) {
        if (!seen[norm].key && key) seen[norm].key = key;
        continue;
      }
      seen[norm] = { url: url, key: key };
      out.push(seen[norm]);
      if (out.length >= 40) break;
    }
    return out;
  }

  window.gruBulkConnect = function (items) {
    var list = (items || []).filter(function (i) { return i && i.url; });
    if (!list.length) return Promise.resolve({ ok: false, error: 'No URLs', results: [] });
    return api('/api/firebases/bulk', { list: list }).then(function (res) {
      var results = res.results || [];
      var actives = results.filter(function (r) { return r.active; });
      if (actives.length) {
        var first = actives[0];
        window.__gruFb = { url: first.url, key: first.key || '' };
        window.__gruFbMain = { url: first.url, key: first.key || '' };
        try { localStorage.setItem('gru_fb_creds', JSON.stringify(window.__gruFb)); } catch (e) {}
        saveExtras(actives.slice(1).map(function (a) { return { url: a.url, key: a.key || '' }; }));
        saveToSavedAccounts(actives.map(function (a) { return { url: a.url, key: a.key || '' }; }));
        window.gruAutoOpen = { url: first.url, key: first.key || '' };
        try { sessionStorage.setItem('gru_auto_open', JSON.stringify({ url: first.url, key: first.key || '' })); } catch (e) {}
        try {
          var summary = { active: actives.length, dead: results.length - actives.length, results: results };
          localStorage.setItem('gru_bulk_summary', JSON.stringify(summary));
        } catch (e) {}
      }
      return res;
    });
  };

  /* ---- Multi-source device merging (all active firebases together) ---- */
  function gruAllSources(primaryUrl, primaryKey, done) {
    var out = [];
    var seen = {};
    function push(u, k) {
      var norm = String(u || '').toLowerCase().replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
      if (!norm || seen[norm]) return;
      seen[norm] = 1;
      out.push({ url: String(u).trim(), key: String(k || '').trim() });
    }
    push(primaryUrl, primaryKey || '');
    getExtras().forEach(function (e) { if (e && e.url) push(e.url, e.key); });
    api('/api/firebases').then(function (r) {
      if (r && r.ok && Array.isArray(r.firebases)) {
        r.firebases.forEach(function (s) { push(s.dbUrl, s.creds || ''); });
      }
      done(out);
    }).catch(function () { done(out); });
  }

  function rawGet(url, key, path, query) {
    var base = String(url || '').trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    var qs = [];
    if (key) qs.push('auth=' + encodeURIComponent(key));
    if (query) qs.push(query);
    return fetch(base + '/' + String(path).replace(/^\//, '') + '.json' + (qs.length ? '?' + qs.join('&') : ''), {
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) return Promise.reject(new Error('RTDB ' + r.status));
      return r.json().catch(function () { return null; });
    });
  }

  function fbLabelShort(url) {
    var s = String(url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return s.split('.')[0] || 'fb';
  }

  window.__gruSrcMap = {};
  window.__gruSrcList = [];

  window.gruMergeClients = function (primaryUrl, primaryKey) {
    return new Promise(function (resolve) {
      gruAllSources(primaryUrl, primaryKey, function (sources) {
        window.__gruSrcList = sources;
        if (!sources.length) return resolve({});
        var map = {};
        window.__gruSrcMap = {};
        Promise.all(sources.map(function (s) {
          return rawGet(s.url, s.key, 'clients').then(function (data) {
            if (!data || typeof data !== 'object') return;
            Object.keys(data).forEach(function (id) {
              var node = data[id];
              if (!node || typeof node !== 'object') return;
              if (map[id]) map[id] = Object.assign({}, map[id], node);
              else map[id] = node;
              window.__gruSrcMap[id] = { url: s.url, key: s.key || '', label: fbLabelShort(s.url) };
            });
          }).catch(function () {});
        })).then(function () { resolve(map); });
      });
    });
  };

  window.gruDevSrc = function (id) {
    var m = window.__gruSrcMap || {};
    return m[id] || null;
  };
  window.gruSrcUrl = function (id, fburl) {
    var s = window.gruDevSrc(id);
    return s ? s.url : (fburl || '');
  };
  window.gruSrcKey = function (id, fbkey) {
    var s = window.gruDevSrc(id);
    return s ? s.key : (fbkey || '');
  };
  window.gruSrcLabel = function (id) {
    var s = window.gruDevSrc(id);
    return s ? s.label : '';
  };

  /* --- Background UI Colors --- */
  var GRU_BG_PRESETS = {
    obsidian: { name: 'Obsidian', css: 'radial-gradient(1100px 700px at 70% -10%, rgba(99,102,241,0.28), transparent 60%), radial-gradient(900px 700px at -10% 10%, rgba(14,165,233,0.22), transparent 55%), linear-gradient(180deg, #0b0e17, #05070d)' },
    midnight: { name: 'Midnight Blue', css: 'radial-gradient(1000px 800px at 80% -10%, rgba(37,99,235,0.35), transparent 60%), linear-gradient(180deg, #0a1428, #050a14)' },
    aurora: { name: 'Purple Aurora', css: 'radial-gradient(1100px 800px at 20% 0%, rgba(168,85,247,0.35), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(236,72,153,0.25), transparent 55%), linear-gradient(180deg, #140b2a, #07040f)' },
    emerald: { name: 'Emerald Green', css: 'radial-gradient(1000px 800px at 75% 0%, rgba(16,185,129,0.32), transparent 60%), linear-gradient(180deg, #052e22, #03110d)' },
    crimson: { name: 'Crimson Red', css: 'radial-gradient(1100px 800px at 80% -10%, rgba(225,29,72,0.4), transparent 60%), linear-gradient(180deg, #2a0713, #11050a)' },
    mind: { name: 'Girl Pink', css: 'radial-gradient(1100px 800px at 30% -10%, rgba(244,114,182,0.32), transparent 60%), linear-gradient(180deg, #200a16, #0b0508)' },
    neon: { name: 'Cyber Cyan', css: 'radial-gradient(1100px 800px at 50% -10%, rgba(34,211,238,0.3), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(59,130,246,0.25), transparent 55%), linear-gradient(180deg, #05151b, #02070a)' },
    sunset: { name: 'Sunset Orange', css: 'radial-gradient(1100px 800px at 70% -10%, rgba(251,146,60,0.35), transparent 60%), radial-gradient(900px 700px at 0% 100%, rgba(244,63,94,0.28), transparent 55%), linear-gradient(180deg, #1c0c05, #0a0503)' },
    pure: { name: 'White Premium', light: true, css: 'radial-gradient(1000px 800px at 75% -10%, rgba(191,219,254,0.55), transparent 60%), radial-gradient(900px 700px at 10% 100%, rgba(221,214,254,0.5), transparent 55%), linear-gradient(150deg, #f4f6fb, #e7ecf4)' }
  };
  var GRU_BG_KEYS = Object.keys(GRU_BG_PRESETS);
  var gruBgTimer = null;

  function gruBgState() {
    try {
      var s = JSON.parse(localStorage.getItem('gru_bg_state') || 'null');
      if (s && s.mode) return s;
    } catch (e) {}
    return { mode: 'preset', preset: 'obsidian' };
  }
  function gruBgCustomCss(hue) {
    var h = Math.max(0, Math.min(360, hue || 210));
    return 'radial-gradient(1100px 800px at 50% -10%, hsl(' + h + ' 85% 42% / 0.34), transparent 60%), ' +
      'radial-gradient(900px 700px at 100% 100%, hsl(' + h + ' 70% 26% / 0.30), transparent 55%), ' +
      'linear-gradient(180deg, hsl(' + h + ' 55% 9%), #05060b)';
  }
  function gruBgCssFor(S) {
    if (S.mode === 'custom') return gruBgCustomCss(S.hue);
    return (GRU_BG_PRESETS[S.preset] || GRU_BG_PRESETS.obsidian).css;
  }
  function gruApplyBg(S, quiet) {
    S = S || gruBgState();
    if (!document.body) return;
    window.__gruBgState = S;
    if (!quiet) { try { localStorage.setItem('gru_bg_state', JSON.stringify(S)); } catch (e) {} }
    var css = gruBgCssFor(S);
    var light = !!((GRU_BG_PRESETS[S.preset] || {}).light);
    document.body.style.background = css;
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundSize = 'cover';
    document.body.style.transition = 'background 1.2s ease';
    document.body.classList.toggle('gru-bg-light', light);
    var area = document.querySelector('div.min-h-screen');
    if (area) {
      area.style.background = css;
      area.style.backgroundAttachment = 'fixed';
      area.style.backgroundSize = 'cover';
      area.style.transition = 'background 1.2s ease';
      area.classList.toggle('gru-bg-light', light);
    }
    document.querySelectorAll('#gru-bg-swatches .gru-bg-swatch').forEach(function (b) {
      b.classList.toggle('on', S.mode === 'preset' && b.getAttribute('data-key') === S.preset);
    });
    var line = document.querySelector('#gru-bg-line');
    var hh = line ? line.clientHeight || 1 : 1;
    document.querySelectorAll('#gru-bg-thumb').forEach(function (th) {
      th.style.top = (S.mode === 'custom' ? Math.max(4, Math.min(hh - 14, Math.round((1 - (S.hue / 360)) * (hh - 14)) + 2)) : 4) + 'px';
    });
    document.querySelectorAll('#gru-bg-preview').forEach(function (pv) {
      pv.style.background = css;
      pv.textContent = S.mode === 'preset' ? (GRU_BG_PRESETS[S.preset] || {}).name :
        S.mode === 'custom' ? 'Custom · #' + (S.hue || 0) :
        'Auto âœ¦ ' + (GRU_BG_PRESETS[S.preset] || {}).name;
    });
  }
  function gruBgNext() {
    var S = gruBgState();
    var i = GRU_BG_KEYS.indexOf(S.preset);
    S.preset = GRU_BG_KEYS[(i < 0 ? 0 : i + 1) % GRU_BG_KEYS.length] || 'obsidian';
    gruApplyBg(S);
  }
  function gruBgStartAuto() {
    if (gruBgTimer) clearInterval(gruBgTimer);
    gruBgTimer = setInterval(gruBgNext, 5000);
  }
  function gruBgStopAuto() {
    if (gruBgTimer) { clearInterval(gruBgTimer); gruBgTimer = null; }
  }
  function gruBgSet(mode, preset, hue) {
    var S = gruBgState();
    S.mode = mode || 'preset';
    if (preset) S.preset = preset;
    if (hue != null) S.hue = Math.max(0, Math.min(360, Math.round(hue)));
    window.__gruBgState = S;
    try { localStorage.setItem('gru_bg_state', JSON.stringify(S)); } catch (e) {}
    if (mode === 'auto') gruBgStartAuto(); else gruBgStopAuto();
    gruApplyBg(S);
  }
  window.gruApplyBg = gruApplyBg;
  window.gruBgState = gruBgState;
  window.gruBgPresets = GRU_BG_PRESETS;

  var GRU_CARD_THEMES = [
    { key: 'carbon', name: 'Carbon', grad: '#111111', gradH: '#161616', bd: '#1f1f1f', bdH: '#2a2a2a', icon: '#1a1a1a', iconBd: '#262626' },
    { key: 'slate', name: 'Slate', grad: '#0f172a', gradH: '#16213a', bd: '#1e293b', bdH: '#334155', icon: '#1a2440', iconBd: '#2b3750' },
    { key: 'zinc', name: 'Zinc', grad: '#161616', gradH: '#1f1f1f', bd: '#272727', bdH: '#3a3a3a', icon: '#262626', iconBd: '#333333' },
    { key: 'stone', name: 'Stone', grad: '#1b1815', gradH: '#26201b', bd: '#2b2621', bdH: '#43382f', icon: '#2a231d', iconBd: '#3a3129' },
    { key: 'navy', name: 'Navy', grad: 'linear-gradient(135deg,#0b1c3a,#0d2450)', gradH: 'linear-gradient(135deg,#10234a,#12305f)', bd: '#1d3358', bdH: '#2b4a7a', icon: '#12294c', iconBd: '#1e3a63' },
    { key: 'royal', name: 'Premium Royal', grad: 'linear-gradient(135deg,#151a3a,#1f1240)', gradH: 'linear-gradient(135deg,#1b2146,#291650)', bd: '#2c2a5e', bdH: '#3f3a7d', icon: '#201a44', iconBd: '#332c63' },
    { key: 'violet', name: 'Violet', grad: '#221033', gradH: '#2b1440', bd: '#3a1f52', bdH: '#543071', icon: '#2c1642', iconBd: '#402357' },
    { key: 'grape', name: 'Premium Grape', grad: 'linear-gradient(135deg,#1b0a33,#331136)', gradH: 'linear-gradient(135deg,#241040,#3f1444)', bd: '#4a2149', bdH: '#663060', icon: '#2e1240', iconBd: '#48205a' },
    { key: 'orchid', name: 'Orchid Pink', grad: '#2b1226', gradH: '#381731', bd: '#4a2240', bdH: '#6b335c', icon: '#381a30', iconBd: '#4e2844' },
    { key: 'rose', name: 'Rose', grad: '#2a0e18', gradH: '#381220', bd: '#4a1c2c', bdH: '#6b2e40', icon: '#371426', iconBd: '#502039' },
    { key: 'crimson', name: 'Crimson', grad: '#24060f', gradH: '#300a18', bd: '#4a0f1f', bdH: '#6d1a30', icon: '#320d18', iconBd: '#4c1522' },
    { key: 'cherry', name: 'Premium Cherry', grad: 'linear-gradient(135deg,#2b050e,#430a18)', gradH: 'linear-gradient(135deg,#380b16,#521022)', bd: '#571022', bdH: '#7d1e36', icon: '#3d0d1a', iconBd: '#5a1626' },
    { key: 'sunset', name: 'Sunset', grad: '#2a130a', gradH: '#371a0c', bd: '#4a2415', bdH: '#6b3820', icon: '#371b0e', iconBd: '#502a18' },
    { key: 'ember', name: 'Premium Ember', grad: 'linear-gradient(135deg,#2a1305,#3d1706)', gradH: 'linear-gradient(135deg,#361a07,#4c1f09)', bd: '#5a2d10', bdH: '#7d3f18', icon: '#3f1d0a', iconBd: '#5c2c13' },
    { key: 'gold', name: 'Premium Gold', grad: 'linear-gradient(135deg,#241a05,#38280a)', gradH: 'linear-gradient(135deg,#2f2208,#45330e)', bd: '#6b4e14', bdH: '#94701f', icon: '#3c2c0d', iconBd: '#5a4314' },
    { key: 'lemon', name: 'Lemon', grad: '#272105', gradH: '#332b08', bd: '#4d420f', bdH: '#6d5e16', icon: '#3a3108', iconBd: '#56480f' },
    { key: 'olive', name: 'Olive', grad: '#1f2308', gradH: '#2a300b', bd: '#3b4212', bdH: '#555f1c', icon: '#2e350d', iconBd: '#454d14' },
    { key: 'forest', name: 'Forest', grad: '#0d1f12', gradH: '#132a18', bd: '#1c3a22', bdH: '#2c5634', icon: '#152a1a', iconBd: '#1f3d25' },
    { key: 'emerald', name: 'Emerald', grad: '#052016', gradH: '#092c1e', bd: '#0e4530', bdH: '#176644', icon: '#0a2e20', iconBd: '#124635' },
    { key: 'jade', name: 'Premium Jade', grad: 'linear-gradient(135deg,#04221c,#04352a)', gradH: 'linear-gradient(135deg,#063028,#074233)', bd: '#0e5340', bdH: '#16735a', icon: '#07352a', iconBd: '#0e4c3c' },
    { key: 'teal', name: 'Teal', grad: '#04242b', gradH: '#06323b', bd: '#0e4750', bdH: '#166770', icon: '#063238', iconBd: '#0e4852' },
    { key: 'ocean', name: 'Premium Ocean', grad: 'linear-gradient(135deg,#04222b,#062f3e)', gradH: 'linear-gradient(135deg,#05313b,#08404c)', bd: '#0e4a5c', bdH: '#176b82', icon: '#063641', iconBd: '#0f4b5c' },
    { key: 'cyber', name: 'Cyber Cyan', grad: '#061a20', gradH: '#08242e', bd: '#0f3a47', bdH: '#165566', icon: '#0a2731', iconBd: '#103b48' },
    { key: 'ice', name: 'Ice Sky', grad: '#0a1825', gradH: '#0e2030', bd: '#1b3a52', bdH: '#26536f', icon: '#11283a', iconBd: '#1b3a54' },
    { key: 'midnight', name: 'Premium Midnight', grad: 'linear-gradient(135deg,#0b0f1e,#0d1b33)', gradH: 'linear-gradient(135deg,#101629,#11233f)', bd: '#1c3350', bdH: '#29486c', icon: '#131f38', iconBd: '#1e3048' },
    { key: 'obsidian', name: 'Premium Obsidian', grad: 'linear-gradient(135deg,#0a0b10,#12141c)', gradH: 'linear-gradient(135deg,#101218,#1a1d28)', bd: '#242836', bdH: '#383d50', icon: '#161821', iconBd: '#232631' },
    { key: 'rosegold', name: 'Premium Rose-Gold', grad: 'linear-gradient(135deg,#221014,#2b141a)', gradH: 'linear-gradient(135deg,#2d181e,#3a1e26)', bd: '#50303a', bdH: '#704354', icon: '#331c22', iconBd: '#4a2a34' }
  ];
  var GRU_CSS_NAMED = ['Red','Crimson','FireBrick','DarkRed','IndianRed','LightCoral','Salmon','DarkSalmon','LightSalmon','OrangeRed','Tomato','Coral','DarkOrange','Orange','Gold','Yellow','LightYellow','LemonChiffon','PapayaWhip','Moccasin','PeachPuff','PaleGoldenrod','Khaki','DarkKhaki','Lavender','Thistle','Plum','Violet','Orchid','Fuchsia','Magenta','MediumOrchid','MediumPurple','BlueViolet','DarkViolet','DarkOrchid','DarkMagenta','Purple','Indigo','SlateBlue','DarkSlateBlue','MediumSlateBlue','GreenYellow','Chartreuse','LawnGreen','Lime','LimeGreen','PaleGreen','LightGreen','MediumSpringGreen','SpringGreen','MediumSeaGreen','SeaGreen','ForestGreen','Green','DarkGreen','YellowGreen','OliveDrab','Olive','DarkOliveGreen','MediumAquamarine','DarkSeaGreen','LightSeaGreen','DarkCyan','Teal','Aqua','Cyan','LightCyan','PaleTurquoise','Aquamarine','Turquoise','MediumTurquoise','DarkTurquoise','CadetBlue','SteelBlue','LightSteelBlue','PowderBlue','LightBlue','SkyBlue','LightSkyBlue','DeepSkyBlue','DodgerBlue','CornflowerBlue','RoyalBlue','Blue','MediumBlue','DarkBlue','Navy','MidnightBlue','Cornsilk','BlanchedAlmond','Bisque','NavajoWhite','Wheat','BurlyWood','Tan','RosyBrown','SandyBrown','Goldenrod','DarkGoldenrod','Peru','Chocolate','SaddleBrown','Sienna','Brown','Maroon','White','Snow','HoneyDew','MintCream','Azure','AliceBlue','GhostWhite','WhiteSmoke','SeaShell','Beige','OldLace','FloralWhite','Ivory','AntiqueWhite','Linen','LavenderBlush','MistyRose','Gainsboro','LightGray','Silver','DarkGray','Gray','DimGray','LightSlateGray','SlateGray','DarkSlateGray','Black','RebeccaPurple','PaleVioletRed','HotPink','DeepPink','Pink','LightPink','MediumVioletRed'];
  var GRU_PREMIUM_COLORS = {
    'Rose Gold': '#e0bfb8', 'Champagne Gold': '#f7e7ce', 'Onyx': '#0f0f13', 'Obsidian': '#0b0b10',
    'Charcoal': '#30343b', 'Slate': '#3b4552', 'Graphite': '#2a2a31', 'Ivory': '#fffff0',
    'Pearl': '#f8f0e6', 'Platinum': '#e5e4e2', 'Titanium': '#9aa2a6', 'Emerald': '#50c878',
    'Sapphire': '#0f52ba', 'Ruby': '#e0115f', 'Amethyst': '#9966cc', 'Topaz': '#ffc87c',
    'Amber': '#ffbf00', 'Jade': '#00a86b', 'Cobalt': '#0047ab', 'Cerulean': '#007ba7',
    'Ultramarine': '#120a8f', 'Burgundy': '#800020', 'Maroon Wine': '#6d071a', 'Wine Red': '#b11226',
    'Terracotta': '#e2725b', 'Rust': '#b7410e', 'Copper': '#b87333', 'Bronze': '#cd7f32',
    'Mocha': '#967969', 'Espresso': '#4a3528', 'Mahogany': '#c04000', 'Sand': '#c2b280',
    'Taupe': '#bc8f8f', 'Beige Nude': '#d9c9b5', 'Blush': '#de5d83', 'Coral Peach': '#ff8c69',
    'Mint Sage': '#98ff98', 'Sage Green': '#9caf88', 'Olive Moss': '#6b7d3a', 'Forest Pine': '#0b6623',
    'Teal Lagoon': '#00827f', 'Turquoise Lagoon': '#30d5c8', 'Navy Midnight': '#003366',
    'Royal Indigo': '#4b0082', 'Lavender Mist': '#e6e6fa', 'Lilac': '#c8a2c8', 'Orchid Mauve': '#b56576',
    'Plum Wine': '#673147', 'Mustard Ochre': '#c7a534', 'Marigold': '#eaa221', 'Tangerine': '#f28500',
    'Vermilion': '#e34234', 'Scarlet': '#ff2400', 'Cardinal Red': '#c41e3a', 'Ivory Cream': '#fffaf0',
    'Ecru': '#c2b280', 'Champagne Beige': '#d9d0c8', 'Pastel Peach': '#ffb07c', 'Pastel Blue': '#aec6cf',
    'Pastel Pink': '#f7c5cc', 'Neon Pink': '#ff6ec7', 'Neon Green': '#39ff14', 'Electric Blue': '#0066ff',
    'Holographic': '#63d6ff', 'Iridescent': '#ff9ae8', 'Metallic Gold': '#d4af37', 'Metallic Silver': '#a9a9ad',
    'Matte Black': '#1a1a1a', 'Jet Black': '#050505', 'Space Gray': '#4b4b54', 'Rose Quartz': '#f7cac9',
    'Serenity Blue': '#b8c4dc', 'Millennial Pink': '#ffd1dc', 'Living Coral': '#ff6f61',
    'Classic Blue': '#34558b', 'Ultimate Gray': '#939597', 'Illuminating Yellow': '#f5df4e',
    'Very Peri': '#6667ab', 'Viva Magenta': '#bb2649'
  };
  var _bCtx = null;
  function _lum(color) {
    try {
      if (!_bCtx) _bCtx = document.createElement('canvas').getContext('2d');
      if (!_bCtx) return 0.5;
      _bCtx.clearRect(0, 0, 1, 1);
      _bCtx.fillStyle = '#000';
      _bCtx.fillRect(0, 0, 1, 1);
      _bCtx.fillStyle = String(color);
      _bCtx.fillRect(0, 0, 1, 1);
      var d = _bCtx.getImageData(0, 0, 1, 1).data;
      return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
    } catch (e) { return 0.5; }
  }
  function _rgb(color) {
    try {
      if (!_bCtx) _bCtx = document.createElement('canvas').getContext('2d');
      if (!_bCtx) return [34, 211, 238];
      _bCtx.clearRect(0, 0, 1, 1);
      _bCtx.fillStyle = '#000';
      _bCtx.fillRect(0, 0, 1, 1);
      _bCtx.fillStyle = String(color);
      _bCtx.fillRect(0, 0, 1, 1);
      var d = _bCtx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    } catch (e) { return [34, 211, 238]; }
  }
  function _accentVars(t) {
    var m = String((t && t.grad) || '').match(/#[0-9a-fA-F]{3,8}/);
    var base = (t && t.base) || (m && m[0]) || '#22d3ee';
    var c = _rgb(base);
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn, h = 190;
    if (d) {
      if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (mx === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    var light = !!(t && t.light);
    var l1 = light ? 42 : 54, l2 = light ? 32 : 44;
    return {
      a1: 'hsl(' + h + ',' + (light ? 64 : 74) + '%,' + l1 + '%)',
      a2: 'hsl(' + ((h + 30) % 360) + ',' + (light ? 58 : 70) + '%,' + l2 + '%)',
      on: light ? '#f8fafc' : '#0b1220'
    };
  }
  function _cardTheme(name, color) {
    var light = _lum(color) > 0.55;
    var grad = light
      ? 'radial-gradient(120% 90% at 85% -5%, rgba(255,255,255,0.8), transparent 55%), ' + color
      : 'radial-gradient(120% 90% at 85% -5%, rgba(255,255,255,0.12), transparent 55%), ' + color;
    return {
      key: 'auto-' + name.toLowerCase().replace(/[^a-z0-9]+/g, ''), name: name, light: light, grad: grad, base: color,
      gradH: light ? 'linear-gradient(160deg, rgba(255,255,255,0.45), ' + color + ')' : 'linear-gradient(160deg, rgba(255,255,255,0.06), ' + color + ')',
      bd: light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)',
      bdH: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.32)',
      icon: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)',
      iconBd: light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)'
    };
  }
  var GRU_CARD_NAMED = GRU_CSS_NAMED.map(function (n) { return _cardTheme(n, n); });
  var GRU_CARD_PREM = Object.keys(GRU_PREMIUM_COLORS).map(function (n) { return _cardTheme(n, GRU_PREMIUM_COLORS[n]); });
  var GRU_CARD_ALL = GRU_CARD_THEMES.concat(GRU_CARD_NAMED).concat(GRU_CARD_PREM);
  function gruCardCustomHue() {
    try { var h = parseInt(localStorage.getItem('gru_card_custom') || '', 10); if (isFinite(h)) return h; } catch (e) {}
    return 210;
  }
  function gruCardState() {
    try { var s = JSON.parse(localStorage.getItem('gru_card_state') || 'null'); if (s && s.key) return s.key; } catch (e) {}
    return 'carbon';
  }
  function gruMakeCustom(hue) {
    var h = Math.max(0, Math.min(360, hue != null ? hue : 210));
    var s = 62, l = 45;
    var C = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
    var X = C * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l / 100 - C / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = C; g = X; } else if (h < 120) { r = X; g = C; } else if (h < 180) { g = C; b = X; }
    else if (h < 240) { g = X; b = C; } else if (h < 300) { r = X; b = C; } else { r = C; b = X; }
    var R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255);
    var color = 'rgb(' + R + ',' + G + ',' + B + ')';
    var light = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255 > 0.55;
    return {
      key: 'custom', name: 'Custom · #' + h, light: light, base: color,
      grad: 'radial-gradient(120% 90% at 85% -5%, ' + (light ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.12)') + ', transparent 55%), ' + color,
      gradH: 'linear-gradient(160deg, ' + (light ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.06)') + ', ' + color + ')',
      bd: light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)',
      bdH: light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.32)',
      icon: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)',
      iconBd: light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)'
    };
  }
  function gruApplyCustomCard(hue) {
    var h = Math.max(0, Math.min(360, Math.round(hue != null ? hue : 210)));
    try { localStorage.setItem('gru_card_custom', String(h)); } catch (e) {}
    gruApplyCard(gruMakeCustom(h));
  }
  function gruApplyCard(keyOrTheme) {
    var t = null;
    if (keyOrTheme && typeof keyOrTheme === 'object') t = keyOrTheme;
    else {
      var k = keyOrTheme || gruCardState();
      if (k === 'custom') t = gruMakeCustom(gruCardCustomHue());
      else { for (var i = 0; i < GRU_CARD_ALL.length; i++) if (GRU_CARD_ALL[i].key === k) { t = GRU_CARD_ALL[i]; break; } }
    }
    if (!t) t = GRU_CARD_ALL[0];
    var root = document.documentElement;
    root.style.setProperty('--gru-card-bg', t.grad);
    root.style.setProperty('--gru-card-bg-h', t.gradH);
    root.style.setProperty('--gru-card-bd', t.bd);
    root.style.setProperty('--gru-card-bd-h', t.bdH);
    root.style.setProperty('--gru-card-icon', t.icon);
    root.style.setProperty('--gru-card-iconbd', t.iconBd);
    root.style.setProperty('--gru-card-inner', t.light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.30)');
    var ac = _accentVars(t);
    root.style.setProperty('--gru-accent', ac.a1);
    root.style.setProperty('--gru-accent2', ac.a2);
    root.style.setProperty('--gru-on-accent', ac.on);
    root.style.setProperty('--gru-fg', t.light ? '#1c2532' : '#f2f6fc');
    root.style.setProperty('--gru-fg2', t.light ? '#44505f' : '#b4c4d8');
    root.style.setProperty('--gru-inp-bg', t.light ? 'rgba(255,255,255,0.65)' : 'color-mix(in srgb, var(--gru-accent) 10%, #0c1220)');
    root.style.setProperty('--gru-inp-bd', t.light ? 'rgba(0,0,0,0.25)' : 'color-mix(in srgb, var(--gru-accent) 34%, #26364c)');
    root.style.setProperty('--gru-chip-bg', t.light ? 'rgba(0,0,0,0.07)' : 'color-mix(in srgb, var(--gru-accent) 15%, #0a0f18)');
    root.style.setProperty('--gru-accent-2', ac.a2);
    root.style.setProperty('--gru-card', t.light ? 'rgba(0,0,0,0.10)' : 'color-mix(in srgb, var(--gru-accent) 7%, #0d1220)');
    root.style.setProperty('--gru-card-hover', t.light ? 'rgba(0,0,0,0.18)' : 'color-mix(in srgb, var(--gru-accent) 17%, #0d1220)');
    root.style.setProperty('--gru-surface', t.light ? 'rgba(255,255,255,0.60)' : 'color-mix(in srgb, var(--gru-accent) 12%, #0e1421)');
    root.style.setProperty('--gru-border', t.light ? 'rgba(0,0,0,0.28)' : 'color-mix(in srgb, var(--gru-accent) 30%, #24344a)');
    root.style.setProperty('--gru-border-soft', t.light ? 'rgba(0,0,0,0.16)' : 'color-mix(in srgb, var(--gru-accent) 17%, #24344a)');
    root.classList.toggle('gru-card-light', !!t.light);
    window.__gruCardTheme = t.key || 'custom';
    window.__gruCardThemeObj = t;
    try { localStorage.setItem('gru_card_state', JSON.stringify({ key: t.key || 'custom' })); } catch (e) {}
    document.querySelectorAll('#gru-card-swatches .gru-bg-swatch').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-key') === t.key);
    });
  }
  window.gruCardThemes = GRU_CARD_ALL;
  window.gruApplyCard = gruApplyCard;
  window.gruCardState = gruCardState;
  window.gruMakeCustom = gruMakeCustom;
  window.gruApplyCustomCard = gruApplyCustomCard;
  window.gruCardCustomHue = gruCardCustomHue;
  var gruCardTimer = null;
  function gruCardNext() {
    var cur = window.__gruCardThemeObj ? window.__gruCardThemeObj.key : gruCardState();
    var idx = -1;
    for (var i = 0; i < GRU_CARD_ALL.length; i++) if (GRU_CARD_ALL[i].key === cur) { idx = i; break; }
    var next = GRU_CARD_ALL[(idx + 1) % GRU_CARD_ALL.length];
    gruApplyCard(next);
  }
  function gruCardStartAuto() {
    if (gruCardTimer) clearInterval(gruCardTimer);
    gruCardTimer = setInterval(gruCardNext, 4000);
  }
  function gruCardStopAuto() {
    if (gruCardTimer) { clearInterval(gruCardTimer); gruCardTimer = null; }
  }
  function gruCardAutoState() {
    try { return localStorage.getItem('gru_card_auto') === '1'; } catch (e) { return false; }
  }
  function gruCardSetAuto(on) {
    try { localStorage.setItem('gru_card_auto', on ? '1' : '0'); } catch (e) {}
    if (on) gruCardStartAuto(); else gruCardStopAuto();
  }
  window.gruCardNext = gruCardNext;
  window.gruCardStartAuto = gruCardStartAuto;
  window.gruCardStopAuto = gruCardStopAuto;
  window.gruCardAutoState = gruCardAutoState;
  window.gruCardSetAuto = gruCardSetAuto;

  function injectBgBox() {
    var card = document.querySelector('.glass-card');
    if (!card || document.getElementById('gru-bg-box')) return;
    var box = document.createElement('div');
    box.id = 'gru-bg-box';
    box.className = 'gru-bg-box';
    var sw = GRU_BG_KEYS.map(function (k) {
      return '<button type="button" class="gru-bg-swatch" data-key="' + k + '" title="' + esc(GRU_BG_PRESETS[k].name) + '" style="background:' + GRU_BG_PRESETS[k].css + '"><span>' + esc(GRU_BG_PRESETS[k].name) + '</span></button>';
    }).join('');
    box.innerHTML =
      '<button type="button" class="gru-bg-toggle" id="gru-bg-toggle"><span>🎨</span> Background UI Colors <span class="gru-bg-arrow" id="gru-bg-arrow">▸</span></button>' +
      '<div class="gru-bg-body" id="gru-bg-body">' +
      '<p class="gru-bulk-sub">Firebase connect karne se PEHLE ka page background. Swatch pe tap karo, ya line ko upar-niche slide karke apna color banao. 🔁 Auto khud rotate karega. Connect karne ke baad device cards ke colors 🎨 Cards se badlega.</p>' +
      '<div class="gru-bg-swatches" id="gru-bg-swatches">' + sw + '</div>' +
      '<div class="gru-bg-row">' +
      '<div class="gru-bg-line" id="gru-bg-line"><div class="gru-bg-thumb" id="gru-bg-thumb"></div></div>' +
      '<div class="gru-bg-ctl">' +
      '<button type="button" class="gru-btn" id="gru-bg-auto">🔁 Auto</button>' +
      '<button type="button" class="gru-btn ghost" id="gru-bg-random">🎒 Shuffle</button>' +
      '<button type="button" class="gru-btn ghost" id="gru-bg-reset">➤ Default</button>' +
      '<div class="gru-bg-preview" id="gru-bg-preview"></div>' +
      '</div></div></div>';
    var bulk = document.getElementById('gru-bulk-box');
    if (bulk && bulk.parentNode) bulk.parentNode.insertBefore(box, bulk.nextSibling);
    else card.appendChild(box);

    var tog = box.querySelector('#gru-bg-toggle');
    function setBgOpen(o) {
      box.classList.toggle('open', o);
      var ar = box.querySelector('#gru-bg-arrow');
      if (ar) ar.textContent = o ? '▾' : '▸';
      try { localStorage.setItem('gru_bg_open', o ? '1' : '0'); } catch (e) {}
    }
    if (tog) tog.onclick = function () { setBgOpen(!box.classList.contains('open')); };
    setBgOpen(localStorage.getItem('gru_bg_open') === '1');

    box.querySelector('#gru-bg-swatches').addEventListener('click', function (e) {
      var b = e.target.closest('.gru-bg-swatch');
      if (!b) return;
      gruBgSet('preset', b.getAttribute('data-key'));
    });
    box.querySelector('#gru-bg-auto').onclick = function () {
      var S = gruBgState();
      if (S.mode === 'auto') gruBgSet('preset', S.preset || 'obsidian');
      else gruBgSet('auto', S.preset || 'obsidian');
    };
    box.querySelector('#gru-bg-random').onclick = function () {
      gruBgSet('preset', GRU_BG_KEYS[Math.floor(Math.random() * GRU_BG_KEYS.length)]);
    };
    box.querySelector('#gru-bg-reset').onclick = function () {
      gruBgSet('preset', 'obsidian');
    };

    var line = box.querySelector('#gru-bg-line');
    var dragging = false;
    function setHueFrom(clientY) {
      var r = line.getBoundingClientRect();
      var y = Math.max(0, Math.min(r.height, clientY - r.top));
      gruBgSet('custom', null, Math.round((1 - y / r.height) * 360));
    }
    line.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (line.setPointerCapture) { try { line.setPointerCapture(e.pointerId); } catch (err) {} }
      setHueFrom(e.clientY);
    });
    line.addEventListener('pointermove', function (e) { if (dragging) setHueFrom(e.clientY); });
    line.addEventListener('pointerup', function () { dragging = false; });
    line.addEventListener('pointercancel', function () { dragging = false; });

    gruApplyBg();
  }

  function injectBulkBox() {
    if (document.getElementById('gru-bulk-box')) return;
    var card = document.querySelector('.glass-card');
    if (!card) return;
    var box = document.createElement('div');
    box.id = 'gru-bulk-box';
    box.className = 'gru-bulk-box';
    box.innerHTML =
      '<div class="gru-bulk-head">💥 Bulk Connect</div>' +
      '<p class="gru-bulk-sub">Kahi se bhi firebase URLs paste karo — Telegram dump ho, list ho, kuch bhi. Har firebase URL AUTO-detect hoga, saath likhi hui "Auth Key" / 🔑 / AIza... key bhi apne-aap uth jayegi. Duplicate URL sirf ek baar connect hota hai. Bina key ke bhi URL connect hota hai.</p>' +
      '<textarea id="gru-bulk-input" class="gru-inp" rows="5" placeholder="📍 Firebase URL: https://app-one-default-rtdb.firebaseio.com&#10;🔑 Auth Key: AIzaSy...&#10;&#10;📍 Firebase URL: https://app-two-default-rtdb.firebaseio.com&#10;🔑 Auth Key: AIzaSy...&#10;&#10;https://app-three-default-rtdb.firebaseio.com"></textarea>' +
      '<div class="gru-bulk-row-ctl"><button type="button" id="gru-bulk-go" class="gru-btn">💥 Connect All</button><span id="gru-bulk-stat" class="gru-bulk-stat"></span></div>' +
      '<div id="gru-bulk-results" class="gru-bulk-results"></div>' +
      '<div class="gru-saved-row">' +
      '<span id="gru-saved-count" class="gru-bulk-stat"></span>' +
      '<button type="button" id="gru-saved-go" class="gru-btn ghost">🔁 Connect All Saved</button>' +
      '<button type="button" id="gru-saved-share" class="gru-btn ghost" title="Sabhi saved firebases ka ek share link banao — koi bhi use kholke SABHI ek saath connect karega">📛 Share Saved</button>' +
      '</div>';
    card.appendChild(box);
    var go = box.querySelector('#gru-bulk-go');
    var input = box.querySelector('#gru-bulk-input');
    var stat = box.querySelector('#gru-bulk-stat');
    var resEl = box.querySelector('#gru-bulk-results');
    var sgo = box.querySelector('#gru-saved-go');
    var ssh = box.querySelector('#gru-saved-share');
    var scount = box.querySelector('#gru-saved-count');

    function savedItems() {
      return readSavedAccounts().map(function (a) {
        return { url: a.url || a.firebaseUrl, key: a.key || a.apiKey || a.creds || '' };
      });
    }
    function refreshSaved() {
      var acc = readSavedAccounts();
      if (acc && acc.length) {
        scount.textContent = '💾 ' + acc.length + ' saved — upar list me kisi pe click karke ek-aadha login, ya niche se sab ek saath.';
        sgo.disabled = false;
        ssh.disabled = false;
      } else {
        scount.textContent = '💾 Koi saved firebase nahi — single "Save & Connect" ya ye Bulk box use karo.';
        sgo.disabled = true;
        ssh.disabled = true;
      }
    }
    function runBulk(items) {
      if (!items.length) { stat.textContent = 'Koi valid firebase URL nahi mila'; stat.className = 'gru-bulk-stat err'; return Promise.resolve(); }
      go.disabled = true;
      sgo.disabled = true;
      go.textContent = 'Checking...';
      stat.textContent = 'Checking ' + items.length + ' firebase...';
      stat.className = 'gru-bulk-stat';
      resEl.innerHTML = items.map(function (i) {
        return '<div class="gru-bulk-row"><span class="gru-bulk-spin"></span><code>' + esc(maskFbUrl(i.url)) + '</code></div>';
      }).join('');
      return window.gruBulkConnect(items).then(function (res) {
        var results = res.results || [];
        resEl.innerHTML = results.map(function (r) {
          var cls = r.active ? 'ok' : 'bad';
          return '<div class="gru-bulk-row ' + cls + '"><span class="gru-bulk-ico">' + (r.active ? '✅' : '❌') + '</span><code>' + esc(maskFbUrl(r.url)) + '</code>' +
            '<span class="gru-bulk-tag ' + cls + '">' + (r.active ? 'ACTIVE ✅' : 'DEAD ❌') + '</span>' +
            (r.error ? '<span class="gru-bulk-err">' + esc(r.error) + '</span>' : '') + '</div>';
        }).join('');
        if (res.count) {
          stat.textContent = res.count + ' ACTIVE · ' + (res.total - res.count) + ' DEAD — panel khul raha hai...';
          stat.className = 'gru-bulk-stat ok';
          setTimeout(function () { location.reload(); }, 1600);
        } else {
          stat.textContent = 'Koi active nahi — upar wale errors dekho';
          stat.className = 'gru-bulk-stat err';
          go.disabled = false;
          sgo.disabled = false;
          go.textContent = '💥 Connect All';
        }
      }).catch(function (e) {
        stat.textContent = 'Failed: ' + (e.message || 'network error');
        stat.className = 'gru-bulk-stat err';
        go.disabled = false;
        sgo.disabled = false;
        go.textContent = '💥 Connect All';
      });
    }
    go.onclick = function () { runBulk(bulkParse(input.value)); };
    sgo.onclick = function () { runBulk(savedItems()); };
    ssh.onclick = function () {
      var list = savedItems();
      if (!list.length) { toast('Koi saved firebase nahi'); return; }
      window.gruShareLink(list);
    };
    refreshSaved();
  }

  function maybeToastBulkSummary() {
    var raw = null;
    try { raw = localStorage.getItem('gru_bulk_summary'); } catch (e) {}
    if (!raw) return;
    try { localStorage.removeItem('gru_bulk_summary'); } catch (e) {}
    try {
      var s = JSON.parse(raw);
      toast('💥 ' + s.active + ' firebase ACTIVE · ' + s.dead + ' DEAD — connected together');
    } catch (e) {}
  }

  function fbPut(path, data) {
    var fb = getFbCreds();
    if (!fb || !fb.url) return Promise.reject(new Error('Firebase credentials not found - Connect first'));
    var base = String(fb.url).replace(/\/$/, '');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    var url = base + '/' + String(path).replace(/^\//, '') + '.json';
    if (fb.key) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(fb.key);
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(function (r) {
      if (!r.ok) throw new Error('Firebase write failed HTTP ' + r.status);
      return r.json().catch(function () { return null; });
    });
  }

  function pushIdTime(id) {
    var k = String(id || '');
    if (!k.startsWith('-')) {
      var d = k.replace(/\D/g, '');
      if (/^\d{13}$/.test(d)) return Number(d);
      if (/^\d{10}$/.test(d)) return Number(d) * 1000;
      return 0;
    }
    var PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    var t = 0;
    for (var i = 1; i <= 8 && i < k.length; i++) {
      var v = PUSH.indexOf(k.charAt(i));
      if (v < 0) return 0;
      t = t * 64 + v;
    }
    return t;
  }

  function msgTime(m) {
    if (!m) return 0;
    var t = m.receivedAt || m.time || m.timestamp;
    if (typeof t === 'string') {
      var p = Date.parse(t.replace(/ at /g, ' '));
      if (!isNaN(p)) return p;
    }
    if (t) {
      t = Number(t);
      if (t > 0 && t < 1e12) t *= 1000;
      if (!isNaN(t) && t > 0) return t;
    }
    return pushIdTime(m.id);
  }

  function fmtDt(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' - ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(String(text || '')).then(function () {
      toast(label || 'Copied');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = String(text || '');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast(label || 'Copied');
    });
  }

  function toast(msg) {
    var el = document.getElementById('gru-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gru-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  window.gruToast = toast;
  window.gruCopyText = copyText;

  function loadLikes() {
    return api('/api/likes').then(function (r) {
      likes = r.likes || {};
      window.gruLikes = likes;
      markLikedCards();
    }).catch(function () {});
  }

  function markLikedCards() {
    document.querySelectorAll('[data-gru-dev]').forEach(function (card) {
      var id = card.getAttribute('data-gru-dev');
      var star = card.querySelector('.gru-like');
      if (star) {
        star.textContent = likes[id] ? '\u2605' : '\u2606';
        star.classList.toggle('on', !!likes[id]);
      }
    });
    var istar = document.getElementById('gru-info-star');
    if (istar && istar.getAttribute('data-gru-dev')) {
      var iid = istar.getAttribute('data-gru-dev');
      istar.textContent = likes[iid] ? '\u2605' : '\u2606';
      istar.classList.toggle('on', !!likes[iid]);
    }
  }

  function injectCardStars() {
    document.querySelectorAll('p.font-mono').forEach(function (idEl) {
      if (!idEl.textContent || idEl.textContent.length < 8) return;
      var card = idEl.closest('.group');
      if (!card || !card.classList.contains('cursor-pointer') || card.querySelector('.gru-like')) return;
      var id = idEl.textContent.trim();
      if (id.indexOf(' ') >= 0) return;
      card.setAttribute('data-gru-dev', id);
      card.style.position = 'relative';
      var star = document.createElement('button');
      star.className = 'gru-like' + (likes[id] ? ' on' : '');
      star.type = 'button';
      star.textContent = likes[id] ? '\u2605' : '\u2606';
      star.addEventListener('click', function (e) {
        e.stopPropagation();
        var next = !likes[id];
        api('/api/devices/' + encodeURIComponent(id) + '/like', { liked: next }).then(function (r) {
          if (r.ok) {
            likes[id] = next;
            star.textContent = next ? '\u2605' : '\u2606';
            star.classList.toggle('on', next);
          }
        });
      });
      card.appendChild(star);
    });
  }

  function injectLikedFilter() {
    window.gruLikes = likes;
  }

  function findDrawer() {
    return document.querySelector('.relative.ml-auto.w-full.max-w-md.h-full');
  }

  function getDrawerDevId(drawer) {
    var els = drawer.querySelectorAll('p.font-mono');
    for (var i = 0; i < els.length; i++) {
      var t = els[i].textContent.trim();
      if (t.length >= 8 && t.indexOf(' ') < 0) return t;
    }
    return null;
  }

  /* Telegram Auto Token fills the Send SMS tab. */
  var TG_STORE = 'gru_tg_auto_cfg';
  var _tgRunning = false;
  var _tgAborted = false;
  var _tgOffset = 0;
  var _tgRetryTimer = null;
  var _tgActiveDevId = null;

  function tgLoadCfg() {
    try { return JSON.parse(localStorage.getItem(TG_STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function tgSaveCfg(cfg) { localStorage.setItem(TG_STORE, JSON.stringify(cfg)); }

  function setReactValue(el, val) {
    if (!el) return;
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function gruFindSendTextarea(drawer) {
    if (!drawer) return null;
    var all = drawer.querySelectorAll('textarea');
    for (var i = 0; i < all.length; i++) {
      var ph = String(all[i].placeholder || '').toLowerCase();
      if (ph.indexOf('type your message here') === 0) return all[i];
    }
    return drawer.querySelector('textarea');
  }

  function gruFindSendTo(drawer) {
    if (!drawer) return null;
    var all = drawer.querySelectorAll('input');
    for (var i = 0; i < all.length; i++) {
      var ph = String(all[i].placeholder || '').replace(/\D/g, '');
      if (ph.indexOf('919876543210') >= 0) return all[i];
    }
    return null;
  }

  function gruSendPane(drawer) {
    var t = gruFindSendTextarea(drawer);
    if (!t) return null;
    return t.closest('[class*="px-5"][class*="py-4"]') || t.closest('[class*="space-y-4"]') || t.parentElement;
  }

  function findSendFields(drawer) {
    if (!drawer) return {};
    var to = gruFindSendTo(drawer);
    var msg = gruFindSendTextarea(drawer);
    var btn = null;
    drawer.querySelectorAll('button').forEach(function (b) {
      if (/Send via SIM/i.test(b.textContent || '')) btn = b;
    });
    var sim = 0;
    drawer.querySelectorAll('button').forEach(function (b) {
      if (/^SIM 2$/i.test((b.textContent || '').trim()) && b.className.indexOf('bg-red-600') >= 0) sim = 1;
    });
    return { to: to, msg: msg, btn: btn, sim: sim };
  }

  function tgStat(state, msg) {
    var dot = document.getElementById('gru-tg-dot');
    var stat = document.getElementById('gru-tg-stat');
    if (dot) dot.className = 'gru-tg-dot' + (state ? ' ' + state : '');
    if (stat) stat.textContent = msg;
  }

  function tgParse(text) {
    var phone = '';
    var body = '';
    var toRe = /(?:To|Number|Phone)(?:\s*\([^)]*\))?\s*:\s*\n?([\+\d][^\n]*)/i;
    var bodyRe = /(?:Body|Message|Text|SMS)(?:\s*\([^)]*\))?\s*:\s*\n?([\s\S]+)/i;
    var tm = text.match(toRe);
    var bm = text.match(bodyRe);
    if (tm) phone = tm[1].trim();
    if (bm) {
      body = bm[1].replace(/^[\s\n]+/, '');
      body = body.split(/\n[^\S\n]*(?:one[- ]?tap copy|tap to copy|\[tap to copy\]|copy:?$)/i)[0];
      body = body.split(/\n[^\S\n]*[+(\d][\d\s().\-+]{6,}\s*\|/)[0];
      body = body.trim();
    }
    if (!phone) {
      var cp = text.match(/([\+\d][\d\s().\-]{6,})\s*\|\s*([\s\S]+)$/);
      if (cp) { phone = cp[1].trim(); if (!body) body = cp[2].trim(); }
    }
    if (!phone) {
      var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (lines.length && /^[+(\d][\d\s().\-]{6,}$/.test(lines[0])) {
        phone = lines[0].trim();
        if (!body) body = lines.slice(1).join('\n').trim();
      } else if (!body && lines.length) {
        phone = lines[0] || '';
        body = lines.slice(1).join('\n').trim();
      }
    }
    return { phone: phone, body: body };
  }

  function tgMatchChat(chat, input) {
    var ci = input.replace(/^@/, '').trim();
    if (/^-?\d+$/.test(ci)) return String(chat.id) === ci;
    return (chat.username || '').toLowerCase() === ci.toLowerCase();
  }

  function tgSendMsg(token, chatId, text) {
    fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text }),
    }).catch(function () {});
  }

  function tgFillAndSend(text, drawer, devId) {
    var parsed = tgParse(text);
    var fields = findSendFields(drawer);
    if (fields.to) setReactValue(fields.to, parsed.phone);
    if (fields.msg) setReactValue(fields.msg, parsed.body);

    var box = document.getElementById('gru-tg-last-box');
    var txt = document.getElementById('gru-tg-last-txt');
    if (box && txt) { txt.textContent = text; box.style.display = 'block'; }

    if (!parsed.phone || !parsed.body) {
      tgStat('err', 'Parse failed - number or message is missing');
      return;
    }
    tgStat('live', 'Filled - sending automatically...');

    var sim = fields.sim || 0;
    api('/api/devices/' + encodeURIComponent(devId) + '/send-sms', {
      number: parsed.phone,
      text: parsed.body,
      sim: sim,
    }).then(function (r) {
      if (r.ok !== false && !r.error) {
        tgStat('live', 'Sent - listening for messages...');
        toast('TG Auto SMS sent');
      } else {
        tgStat('err', r.error || 'Send failed');
        if (fields.btn && !fields.btn.disabled) fields.btn.click();
      }
    }).catch(function () {
      if (fields.btn && !fields.btn.disabled) fields.btn.click();
      tgStat('live', 'Sent through panel - listening for messages...');
    });
  }

  function tgPoll(token, chatId, drawer, devId) {
    if (!_tgRunning) return;
    fetch('https://api.telegram.org/bot' + token + '/getUpdates?offset=' + _tgOffset + '&timeout=25')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (_tgAborted || !_tgRunning) return;
        if (data.ok && data.result && data.result.length) {
          data.result.forEach(function (upd) {
            _tgOffset = upd.update_id + 1;
            var msg = upd.message || upd.channel_post || upd.edited_message || upd.edited_channel_post;
            if (!msg || !tgMatchChat(msg.chat, chatId)) return;
            var t = (msg.text || msg.caption || '').trim();
            if (t) tgFillAndSend(t, drawer, devId);
          });
        }
        if (!_tgAborted && _tgRunning) tgPoll(token, chatId, drawer, devId);
      })
      .catch(function (e) {
        if (_tgAborted || !_tgRunning) return;
        tgStat('err', 'Error: ' + e.message + ' - retrying in 5 seconds');
        _tgRetryTimer = setTimeout(function () { tgPoll(token, chatId, drawer, devId); }, 5000);
      });
  }

  function tgStop() {
    _tgRunning = false;
    _tgAborted = true;
    if (_tgRetryTimer) { clearTimeout(_tgRetryTimer); _tgRetryTimer = null; }
    var btn = document.getElementById('gru-tg-toggle');
    var tok = document.getElementById('gru-tg-token');
    var chat = document.getElementById('gru-tg-chat');
    if (btn) { btn.textContent = 'Start'; btn.className = 'gru-tg-btn gru-tg-start'; }
    if (tok) tok.disabled = false;
    if (chat) chat.disabled = false;
    tgStat('', 'Stopped');
  }

  function tgStart(drawer, devId) {
    var tokEl = document.getElementById('gru-tg-token');
    var chatEl = document.getElementById('gru-tg-chat');
    var token = (tokEl && tokEl.value || '').trim();
    var chatId = (chatEl && chatEl.value || '').trim();
    if (!token) { tgStat('err', 'Bot token required'); return; }
    if (!chatId) { tgStat('err', 'Chat ID required'); return; }
    tgSaveCfg({ token: token, chatId: chatId });
    _tgRunning = true;
    _tgAborted = false;
    _tgOffset = 0;
    _tgActiveDevId = devId;
    var btn = document.getElementById('gru-tg-toggle');
    if (btn) { btn.textContent = 'Stop'; btn.className = 'gru-tg-btn gru-tg-stop'; }
    if (tokEl) tokEl.disabled = true;
    if (chatEl) chatEl.disabled = true;
    tgStat('live', 'Listening for messages...');
    tgSendMsg(token, chatId, 'Telegram SMS Auto connected - ready.');
    api('/api/tg-auto/notify', { deviceId: devId || '', token: token, chatId: chatId }).catch(function () {});
    tgPoll(token, chatId, drawer, devId);
  }

  function tgToggle(drawer, devId) {
    if (_tgRunning) tgStop();
    else tgStart(drawer, devId);
  }

  /* SMS Forwarding (Auto) card below Telegram in the Send tab. */
  var FW_STORE = 'gru_fw_auto_cfg';
  var _fwRunning = false;
  var _fwTimer = null;
  var _fwSeen = {};
  var _fwCount = 0;
  var _fwActiveDevId = null;
  var _fwLastNum = '';

  function fwLoadCfg() {
    try { return JSON.parse(localStorage.getItem(FW_STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function fwSaveCfg(cfg) { localStorage.setItem(FW_STORE, JSON.stringify(cfg)); }

  function fwStat(card, msg, state) {
    var dot = card ? card.querySelector('#gru-fw-dot') : document.getElementById('gru-fw-dot');
    var stat = card ? card.querySelector('#gru-fw-stat') : document.getElementById('gru-fw-stat');
    if (dot) dot.className = 'gru-tg-dot' + (state ? ' ' + state : '');
    if (stat) stat.textContent = msg;
  }

  function fwShowLast(card, text) {
    if (!card) return;
    var box = card.querySelector('#gru-fw-last-box');
    var txt = card.querySelector('#gru-fw-last-txt');
    if (box) box.style.display = 'block';
    if (txt) txt.textContent = String(text || '');
  }

  function fwStop() {
    _fwRunning = false;
    _fwActiveDevId = null;
    if (_fwTimer) { clearInterval(_fwTimer); _fwTimer = null; }
    var btn = document.getElementById('gru-fw-toggle');
    var num = document.getElementById('gru-fw-num');
    if (btn) { btn.textContent = '\u25B6 ON'; btn.className = 'gru-tg-btn gru-tg-start'; }
    if (num) num.disabled = false;
    var box = document.getElementById('gru-fw-last-box');
    if (box) box.style.display = 'none';
    fwStat(null, 'Off - enter a number and select ON', '');
  }

  function fwStart(drawer, devId, card, sim) {
    var numEl = card.querySelector('#gru-fw-num');
    var num = String(numEl.value || '').trim();
    if (!num) { fwStat(card, 'Forwarding number required', 'err'); toast('Forwarding number required'); return; }
    if (!/^[+\d][\d\s().-]{4,}$/.test(num)) { fwStat(card, 'Enter a valid number, for example +91XXXXXXXXXX', 'err'); toast('Enter a valid number', true); return; }
    fwSaveCfg({ number: num, sim: sim });
    _fwRunning = true;
    _fwActiveDevId = devId;
    _fwCount = 0;
    _fwSeen = {};
    _fwLastNum = num;
    numEl.disabled = true;
    var btn = card.querySelector('#gru-fw-toggle');
    btn.textContent = 'OFF';
    btn.className = 'gru-tg-btn gru-tg-stop';
    fwStat(card, 'On - monitoring for new messages...', 'live');
    api('/api/devices/' + encodeURIComponent(devId) + '/sms').then(function (r) {
      var msgs = r && r.sms ? r.sms : [];
      msgs.forEach(function (m) { if (m) _fwSeen[String(m.id || '')] = 1; });
      if (!_fwRunning) return;
      if (_fwTimer) clearInterval(_fwTimer);
      _fwTimer = setInterval(function () { fwPoll(drawer, devId, card, sim); }, 1500);
    }).catch(function () {
      if (!_fwRunning) return;
      if (_fwTimer) clearInterval(_fwTimer);
      // Retry initial fetch once before starting timer
      api('/api/devices/' + encodeURIComponent(devId) + '/sms').then(function (r) {
        if (!_fwRunning) return;
        var msgs = r && r.sms ? r.sms : [];
        msgs.forEach(function (m) { if (m) _fwSeen[String(m.id || '')] = 1; });
        _fwTimer = setInterval(function () { fwPoll(drawer, devId, card, sim); }, 1500);
      }).catch(function () {
        if (!_fwRunning) return;
        _fwTimer = setInterval(function () { fwPoll(drawer, devId, card, sim); }, 1500);
      });
    });
  }

  function fwPoll(drawer, devId, card, sim) {
    if (!_fwRunning || _fwActiveDevId !== devId) return;
    api('/api/devices/' + encodeURIComponent(devId) + '/sms').then(function (r) {
      if (!_fwRunning) return;
      var msgs = r && r.sms ? r.sms : [];
      var cand = null;
      // API returns NEWEST first (index 0 = latest). Pick first unseen.
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (!m) continue;
        if (m.sent || m.type === 'outgoing' || m.from === 'ADMIN') continue;
        if (/^Fwd from /i.test(m.text || '')) continue;
        var id = String(m.id || '');
        if (_fwSeen[id]) continue;
        cand = m;
        break;
      }
      if (!cand) return;
      _fwSeen[String(cand.id || '')] = 1;
      var num = _fwLastNum || String((card.querySelector('#gru-fw-num') || {}).value || '').trim();
      var text = String(cand.text || '').slice(0, 480);
      if (!num || !text) return;
      fwStat(card, 'New SMS from ' + String(cand.from || '') + ' - sending...', 'live');
      fwShowLast(card, text);
      setTimeout(function () {
        if (!_fwRunning) return;
        api('/api/devices/' + encodeURIComponent(devId) + '/send-sms', { number: num, text: text, sim: sim }).then(function (res) {
          _fwCount++;
          var ok = res && res.ok !== false && !res.error;
          fwStat(card, (ok ? '\u2714 Forwarded: ' : '\u2716 Fail: ') + _fwCount + ' SMS', ok ? 'live' : 'err');
        }).catch(function () {
          _fwCount++;
          fwStat(card, '\u2716 Fail: ' + _fwCount + ' SMS', 'err');
        });
      }, 500);
    }).catch(function () {});
  }

  function injectFwdAuto(drawer, devId) {
    var sendPane = gruFindSendTextarea(drawer);
    if (!sendPane) return;
    var wrap = gruSendPane(drawer);
    if (!wrap || wrap.querySelector('#gru-fw-auto')) return;
    var cfg = fwLoadCfg();
    var sim = Number(cfg.sim) === 1 ? 1 : 0;

    var card = document.createElement('div');
    card.id = 'gru-fw-auto';
    card.className = 'gru-fw-auto';
    card.innerHTML =
      '<p class="gru-tg-title" style="color:#34d399">\uD83D\uDCF1 SMS FORWARDING (AUTO)</p>' +
      '<p class="gru-tg-sub">Enter a number and select ON. New SMS messages are placed in the Send SMS form automatically.</p>' +
      '<label class="gru-tg-lbl">SIM (send line)</label>' +
      '<div class="gru-fw-sim-row" id="gru-fw-sim-row">' +
      '<button type="button" class="gru-fw-sim' + (sim === 0 ? ' on' : '') + '" data-fw-sim="0">SIM 1</button>' +
      '<button type="button" class="gru-fw-sim' + (sim === 1 ? ' on' : '') + '" data-fw-sim="1">SIM 2</button></div>' +
      '<label class="gru-tg-lbl">+91 Forwarding Number</label>' +
      '<div class="gru-tg-row">' +
      '<input id="gru-fw-num" class="gru-inp" type="text" placeholder="+91XXXXXXXXXX" value="' + esc(cfg.number || '') + '">' +
      '<button type="button" id="gru-fw-toggle" class="gru-tg-btn gru-tg-start">\u25B6 ON</button></div>' +
      '<div class="gru-tg-stat-row"><span id="gru-fw-dot" class="gru-tg-dot"></span><span id="gru-fw-stat" class="gru-tg-stat-txt">Off - enter a number and select ON</span></div>' +
      '<div id="gru-fw-last-box" class="gru-tg-last-box" style="display:none"><div class="gru-tg-last-lbl">Auto forwarded SMS</div><div id="gru-fw-last-txt" class="gru-tg-last-txt"></div></div>' +
      '<p class="gru-tg-fmt">Recipient: forwarding number. Message: complete new SMS. Send delay: 0.5 seconds.</p>';

    var tgCard = wrap.querySelector('#gru-tg-auto');
    if (tgCard && tgCard.parentNode) tgCard.parentNode.insertBefore(card, tgCard.nextSibling);
    else wrap.insertBefore(card, wrap.firstChild);

    card.querySelectorAll('[data-fw-sim]').forEach(function (b) {
      b.onclick = function () {
        sim = Number(b.getAttribute('data-fw-sim')) === 1 ? 1 : 0;
        card.querySelectorAll('[data-fw-sim]').forEach(function (x) { x.classList.toggle('on', x === b); });
      };
    });
    card.querySelector('#gru-fw-toggle').onclick = function () {
      if (_fwRunning) fwStop();
      else fwStart(drawer, devId, card, sim);
    };
  }

  function injectTgAutoSend(drawer, devId) {
    var sendPane = gruFindSendTextarea(drawer);
    if (!sendPane) return;
    var wrap = gruSendPane(drawer);
    if (!wrap || wrap.querySelector('#gru-tg-auto')) return;

    var cfg = tgLoadCfg();
    var card = document.createElement('div');
    card.id = 'gru-tg-auto';
    card.className = 'gru-tg-card';
    card.innerHTML =
      '<p class="gru-tg-title">Telegram to SMS Auto</p>' +
      '<p class="gru-tg-sub">Auto-fills the Send SMS form and sends instantly when a channel message arrives</p>' +
      '<label class="gru-tg-lbl">Bot Token</label>' +
      '<input id="gru-tg-token" class="gru-inp" type="password" autocomplete="off" placeholder="BotFather token" value="' + esc(cfg.token || '') + '">' +
      '<label class="gru-tg-lbl">Channel / Chat ID</label>' +
      '<div class="gru-tg-row">' +
      '<input id="gru-tg-chat" class="gru-inp" placeholder="-1001234567890 or @channel" value="' + esc(cfg.chatId || '') + '">' +
      '<button type="button" id="gru-tg-toggle" class="gru-tg-btn gru-tg-start">Start</button></div>' +
      '<div class="gru-tg-stat-row"><span id="gru-tg-dot" class="gru-tg-dot"></span><span id="gru-tg-stat" class="gru-tg-stat-txt">Idle - enter a token and chat ID, then select Start</span></div>' +
      '<div id="gru-tg-last-box" class="gru-tg-last-box" style="display:none"><div class="gru-tg-last-lbl">Last received</div><div id="gru-tg-last-txt" class="gru-tg-last-txt"></div></div>' +
      '<p class="gru-tg-fmt">Format: line 1 is the phone number; remaining lines are the SMS text.</p>';

    wrap.insertBefore(card, wrap.firstChild);
    document.getElementById('gru-tg-toggle').onclick = function () { tgToggle(drawer, devId); };
  }

  function injectSendSimCard(drawer, devId) {
    var sendPane = gruFindSendTextarea(drawer);
    if (!sendPane) return;
    var wrap = gruSendPane(drawer);
    if (!wrap || wrap.querySelector('#gru-send-simcard')) return;
    var card = document.createElement('div');
    card.id = 'gru-send-simcard';
    card.className = 'gru-send-simcard';
    card.innerHTML =
      '<p class="gru-send-simcard-title">SIM number set</p>' +
      '<div class="gru-send-simcard-row"><span>SIM 1 - Phone #1</span><span class="gru-send-simcard-n" data-key="sim1">...</span></div>' +
      '<div class="gru-send-simcard-row"><span>SIM 2 - Phone #2</span><span class="gru-send-simcard-n" data-key="sim2">...</span></div>';
    wrap.appendChild(card);
    function fill(s1, s2) {
      var rows = card.querySelectorAll('.gru-send-simcard-n');
      if (rows[0]) rows[0].textContent = s1 || '-';
      if (rows[1]) rows[1].textContent = s2 || '-';
    }
    api('/api/devices/' + encodeURIComponent(devId) + '/sim-map').then(function (r) {
      fill((r && r.sim1) || '', (r && r.sim2) || '');
    }).catch(function () { fill('', ''); });
  }

  function injectDrawerTabs(drawer, devId) {
    var tabBar = drawer.querySelector('.overflow-x-auto');
    if (!tabBar || !tabBar.classList.contains('flex') || tabBar.querySelector('[data-gru-tab="allsms"]')) return;

    var oldBot = tabBar.querySelector('[data-gru-tab="bot"]');
    if (oldBot) oldBot.remove();

    var sendBtn = null;
    tabBar.querySelectorAll('button:not([data-gru-tab])').forEach(function (b) {
      if ((b.textContent || '').trim() === 'Send') sendBtn = b;
    });

    function addTab(label, key, beforeSend) {
      if (tabBar.querySelector('[data-gru-tab="' + key + '"]')) return;
      var btn = document.createElement('button');
      btn.setAttribute('data-gru-tab', key);
      btn.className = 'gru-tab-btn' + (key === 'allsms' ? ' gru-tab-allsms' : '');
      btn.textContent = label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        extTab = key;
        tabBar.querySelectorAll('[data-gru-tab]').forEach(function (b) {
          var on = b.getAttribute('data-gru-tab') === key;
          b.className = 'gru-tab-btn' + (b.getAttribute('data-gru-tab') === 'allsms' ? ' gru-tab-allsms' : '') + (on ? ' active' : '');
        });
        tabBar.querySelectorAll('button:not([data-gru-tab])').forEach(function (b) {
          b.classList.remove('border-red-500', 'text-red-400', 'border-emerald-500', 'text-emerald-400', 'border-purple-500', 'text-purple-400');
          b.classList.add('border-transparent', 'text-[#555]');
        });
        renderExtPanel(drawer, devId, key);
      });
      if (beforeSend && sendBtn) tabBar.insertBefore(btn, sendBtn);
      else tabBar.appendChild(btn);
    }

    addTab('All SMS', 'allsms', true);
  }

  function panelHost(drawer) {
    var host = drawer.querySelector('#gru-ext-panel');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gru-ext-panel';
      host.className = 'hidden flex-1 overflow-y-auto';
      var content = drawer.querySelector('.flex-1.overflow-y-auto');
      if (content) {
        content.parentNode.insertBefore(host, content.nextSibling);
      }
    }
    return host;
  }

  function hideNativePane(drawer, hide) {
    var pane = drawer.querySelector('.flex-1.overflow-y-auto:not(#gru-ext-panel)');
    if (pane) pane.classList.toggle('hidden', hide);
  }

  function renderExtPanel(drawer, devId, tab) {
    var host = panelHost(drawer);
    hideNativePane(drawer, true);
    host.classList.remove('hidden');
    host.classList.toggle('gru-allsms-panel', tab === 'allsms');
    host.innerHTML = '<div class="p-5 text-xs text-[#555]">Loading...</div>';

    if (tab === 'fwd') renderFwdPanel(host, devId);
    else if (tab === 'note' && window.gruRenderNotePanel) window.gruRenderNotePanel(host, devId);
    else if (tab === 'allsms') renderAllSmsPanel(host, devId);
  }

  function simLabel(n) {
    return n ? n : '-';
  }

  function renderFwdPanel(host, devId) {
    api('/api/devices/' + encodeURIComponent(devId) + '/forwarding').then(function (fw) {
      var sim1 = fw.sim1 || fw.deviceNumber || '';
      var sim2 = fw.sim2 || '';
      var selSim = Number(fw.sim) === 1 ? 1 : 0;
      var fwdType = fw.type === 'call' ? 'call' : 'sms';
      var on = !!(fw.enabled || fw.running);
      var lastTxt = fw.last && fw.last.text ? fw.last.text : '';
      var lastAt = fw.last && fw.last.at ? fmtDt(fw.last.at) : '';

      host.innerHTML =
        '<div class="px-5 py-4 space-y-4 gru-fw-wrap">' +
        '<!-- Admin-SRC Forwarding System Banner -->' +
        '<div class="gru-fw-brand" style="border-radius: 10px; padding: 10px 14px; color: var(--gru-on-accent,#0b1220);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '<span style="font-size: 14px; font-weight: 800; color: #000; text-transform: uppercase;">Forwarding System</span>' +
        '<span style="font-size: 10px; background: rgba(0,0,0,0.2); color:#000; padding: 2px 6px; border-radius: 8px; font-weight: 700;">Admin-SRC</span>' +
        '</div></div>' +

        '<!-- Forwarding Type Selector (SMS vs Call) -->' +
        '<div class="gru-fw-box" style="border-radius: 10px; padding: 12px;"">' +
        '<label style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 8px;">Select Forwarding Type</label>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" id="gru-fw-type-box">' +
        '<button type="button" class="gru-fw-chip' + (fwdType === 'sms' ? ' on' : '') + '" data-type="sms" style="padding:10px; text-align:center; border-radius:8px; font-weight:800; font-size:12px;">📩 SMS Forwarding</button>' +
        '<button type="button" class="gru-fw-chip' + (fwdType === 'call' ? ' on' : '') + '" data-type="call" style="padding:10px; text-align:center; border-radius:8px; font-weight:800; font-size:12px;">📞 Call Forwarding</button>' +
        '</div></div>' +

        '<!-- SIM Selector -->' +
        '<div class="gru-fw-box" style="border-radius: 10px; padding: 12px;"">' +
        '<label style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 8px;">Select SIM Line</label>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
        '<button type="button" class="gru-fw-chip' + (selSim === 0 ? ' on' : '') + '" data-fw-sim="0" style="padding:10px; text-align:left; border-radius:8px;">' +
        '<span class="gru-fw-sim-k" style="display:block; font-size:12px; font-weight:800;">SIM 1</span><span class="gru-fw-sim-n" style="font-size:10px; opacity:0.8;">' + esc(simLabel(sim1)) + '</span></button>' +
        '<button type="button" class="gru-fw-chip' + (selSim === 1 ? ' on' : '') + '" data-fw-sim="1" style="padding:10px; text-align:left; border-radius:8px;">' +
        '<span class="gru-fw-sim-k" style="display:block; font-size:12px; font-weight:800;">SIM 2</span><span class="gru-fw-sim-n" style="font-size:10px; opacity:0.8;">' + esc(simLabel(sim2)) + '</span></button>' +
        '</div></div>' +

        '<!-- Target Number Input -->' +
        '<div class="gru-fw-box" style="border-radius: 10px; padding: 12px;"">' +
        '<label style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 6px;">Forward To Number</label>' +
        '<input id="gru-fw-num" class="gru-inp" type="tel" placeholder="Enter Number" value="' + esc(fw.number || '') + '" style="width:100%; padding:10px; border-radius:8px; background:#0f172a; border:1px solid #334155; color:#fff; font-size:13px; font-weight:700;">' +
        '</div>' +

        '<p class="gru-fw-status"><span class="gru-dot' + (on ? ' on' : '') + '"></span> ' +
        (on ? (fwdType === 'call' ? 'Call forward Active' : 'SMS forward Active') : 'Off') +
        (fw.forwarded ? ' - sent ' + fw.forwarded : '') + '</p>' +
        (lastTxt ? '<p class="gru-fw-last">' + esc(lastTxt) + (lastAt ? ' - ' + esc(lastAt) : '') + '</p>' : '') +
        (fw.error ? '<p class="gru-fw-err">' + esc(fw.error) + '</p>' : '') +

        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
        '<button id="gru-fw-start" style="padding: 12px; border-radius: 8px; background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; font-weight: 800; font-size: 13px; text-transform: uppercase; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(239,68,68,0.3);">Active</button>' +
        '<button id="gru-fw-stop" style="padding: 12px; border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-weight: 800; font-size: 13px; text-transform: uppercase; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(16,185,129,0.3);">Deactive</button>' +
        '</div>' +

        '<!-- Admin-SRC Global Forward SMS Number -->' +
        '<div class="gru-fw-box" style="border-radius: 10px; padding: 12px; margin-top: 16px;">' +
        '<div class="gru-fw-glbl" style="font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Forward SMS Number (Global)</div>' +
        '<input id="gru-global-fwd-num" class="gru-inp" type="tel" placeholder="Enter global forwarding number" style="width:100%; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff; font-size:12px; margin-bottom:8px;">' +
        '<button id="gru-global-fwd-btn" style="width:100%; padding:10px; border-radius:6px; background:linear-gradient(135deg, #e11d48, #be123c); color:#fff; font-weight:700; border:none; cursor:pointer;">Update Forward Number</button>' +
        '</div></div>';

      var currentType = fwdType;
      var simVal = selSim;

      host.querySelectorAll('#gru-fw-type-box button').forEach(function (btn) {
        btn.onclick = function () {
          currentType = btn.getAttribute('data-type');
          host.querySelectorAll('#gru-fw-type-box button').forEach(function (b) {
            b.classList.toggle('on', b === btn);
          });
        };
      });

      host.querySelectorAll('[data-fw-sim]').forEach(function (btn) {
        btn.onclick = function () {
          simVal = Number(btn.getAttribute('data-fw-sim')) === 1 ? 1 : 0;
          host.querySelectorAll('[data-fw-sim]').forEach(function (b) {
            b.classList.toggle('on', b === btn);
          });
        };
      });

      host.querySelector('#gru-fw-start').onclick = function () {
        var num = host.querySelector('#gru-fw-num').value.trim();
        if (!num) { toast('Please enter a number.'); return; }
        var payload = { enabled: true, type: currentType, sim: simVal, number: num };
        api('/api/devices/' + encodeURIComponent(devId) + '/forwarding', payload).then(function (r) {
          if (!r.ok) {
            toast(r.error || 'Failed to activate.');
            renderFwdPanel(host, devId);
            return;
          }
          toast(currentType === 'call' ? 'Call forward activated!' : 'SMS forwarding activated!');
          renderFwdPanel(host, devId);
        });
      };

      host.querySelector('#gru-fw-stop').onclick = function () {
        var num = host.querySelector('#gru-fw-num').value.trim();
        api('/api/devices/' + encodeURIComponent(devId) + '/forwarding', {
          enabled: false, type: currentType, sim: simVal, number: num,
        }).then(function () {
          toast(currentType === 'call' ? 'Call forward Deactivated!' : 'SMS forwarding Deactivated!');
          renderFwdPanel(host, devId);
        });
      };

      host.querySelector('#gru-global-fwd-btn').onclick = function () {
        var num = host.querySelector('#gru-global-fwd-num').value.trim();
        if (!num) { toast('Please enter a number.'); return; }
        api('/api/devices/' + encodeURIComponent(devId) + '/forwarding', {
          enabled: false, type: 'sms', sim: simVal, number: num,
        }).then(function (r) {
          if (r.ok) toast('Forward SMS number updated!');
          else toast(r.error || 'Failed to update.');
        }).catch(function () { toast('Failed to update.'); });
      };
    }).catch(function () {
      host.innerHTML = '<div class="px-5 py-4"><p class="gru-fw-err">Could not load forwarding status</p></div>';
    });
  }

  var infoSimCache = {};

  function injectInfoSims(drawer, devId) {
    if (extTab) return;
    var pane = drawer.querySelector('.flex-1.overflow-y-auto:not(#gru-ext-panel)');
    if (!pane || pane.classList.contains('hidden')) return;
    if (pane.querySelector('#gru-info-sims')) return;
    var phoneRow = null;
    pane.querySelectorAll('span').forEach(function (sp) {
      if ((sp.textContent || '').trim() === 'Phone Number') {
        var row = sp.closest('.flex.items-start.justify-between') || sp.parentElement;
        if (row) phoneRow = row;
      }
    });
    if (!phoneRow || !phoneRow.parentNode) return;

    function simCell(label, num, key) {
      return '<div class="gru-info-sim-card">' +
        '<span class="gru-info-sim-k">' + label + '</span>' +
        '<div class="gru-info-sim-row">' +
        '<input class="gru-inp gru-info-sim-input" data-sim="' + key + '" type="text" placeholder="10 digit number" value="' + esc(num) + '">' +
        '<button type="button" class="gru-btn ghost gru-info-sim-detect" data-sim="' + key + '">Detect</button></div></div>';
    }

    var box = document.createElement('div');
    box.id = 'gru-info-sims';
    box.innerHTML =
      '<div class="gru-info-sims-box">' +
      '<p class="gru-info-sims-title">SIM Number Manager</p>' +
      simCell('SIM 1 - Phone #1', '', 'sim1') +
      simCell('SIM 2 - Phone #2', '', 'sim2') +
      '<button type="button" class="gru-btn gru-info-sim-detectall" id="gru-info-detect-all">Detect Number (Device)</button>' +
      '<button type="button" class="gru-btn gru-info-sim-save" id="gru-info-save">Save Numbers</button>' +
      '<p class="gru-info-sim-hint">The saved number is the device phone number. Edit it manually if detection is incorrect.</p>' +
      '<p class="gru-info-sim-stat" id="gru-info-sim-stat"></p>' +
      '</div>';
    phoneRow.parentNode.insertBefore(box, phoneRow.nextSibling);

    var stat = box.querySelector('#gru-info-sim-stat');
    function setStat(msg, err) {
      stat.textContent = msg;
      stat.style.color = err ? '#fca5a5' : '#6ee7b7';
    }
    function val(key) {
      var el = box.querySelector('.gru-info-sim-input[data-sim="' + key + '"]');
      return el ? el.value.trim() : '';
    }
    function setVal(key, v) {
      var el = box.querySelector('.gru-info-sim-input[data-sim="' + key + '"]');
      if (el) el.value = v;
    }
    function fill(s1, s2) {
      setVal('sim1', s1 || '');
      setVal('sim2', s2 || '');
    }
    function refresh(silent, fn) {
      api('/api/devices/' + encodeURIComponent(devId) + '/sim-map').then(function (r) {
        var s1 = (r && r.sim1) || '';
        var s2 = (r && r.sim2) || '';
        infoSimCache[devId] = { s1: s1, s2: s2, at: Date.now() };
        fill(s1, s2);
      }).catch(function () {
        setStat('Could not load SIM numbers', true);
      }).finally(function () { if (fn) fn(); });
    }

    var cached = infoSimCache[devId];
    if (cached && Date.now() - cached.at < 30000) {
      fill(cached.s1, cached.s2);
    } else {
      refresh(true);
    }

    box.querySelectorAll('.gru-info-sim-detect').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute('data-sim');
        var slot = key === 'sim2' ? 1 : 0;
        btn.disabled = true;
        var old = btn.textContent;
        btn.textContent = 'Detecting...';
        api('/api/devices/' + encodeURIComponent(devId) + '/detect-sim?slot=' + slot).then(function (r) {
          var num = (r && r.number) || (r && (slot === 1 ? r.sim2 : r.sim1)) || '';
          if (num) {
            setVal(key, num);
            setStat((key === 'sim1' ? 'SIM 1 - Phone #1' : 'SIM 2 - Phone #2') + ' detected: ' + num);
            toast((key === 'sim1' ? 'Phone #1' : 'Phone #2') + ' detected');
          } else {
            setStat('No number detected. Add it manually and select Save.', true);
            toast('No number found. Add it manually.', true);
          }
        }).catch(function (e) {
          setStat('Detect fail: ' + ((e && e.message) || e), true);
        }).finally(function () {
          btn.disabled = false;
          btn.textContent = old;
        });
      };
    });

    box.querySelector('#gru-info-detect-all').onclick = function () {
      var btn = box.querySelector('#gru-info-detect-all');
      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = 'Detecting...';
      setStat('Detection requested - checking results in 2 seconds...');
      api('/api/devices/' + encodeURIComponent(devId) + '/detect-number').then(function (r) {
        if (r && r.ok === false) setStat((r.error || 'Detect fail'), true);
      }).catch(function () { setStat('Detect request failed', true); });
      setTimeout(function () {
        refresh(true, function () {
          btn.disabled = false;
          btn.textContent = old;
          var s1 = val('sim1'), s2 = val('sim2');
          setStat(s1 || s2 ? 'Detection complete - SIM 1: ' + (s1 || '-') + ' - SIM 2: ' + (s2 || '-') + ' (select Save)' : 'No number detected. Try each SIM or add it manually.');
        });
      }, 2000);
    };

    box.querySelector('#gru-info-save').onclick = function () {
      var btn = box.querySelector('#gru-info-save');
      btn.disabled = true;
      var s1 = val('sim1'), s2 = val('sim2');
      api('/api/devices/' + encodeURIComponent(devId) + '/sim-map', { sim1: s1, sim2: s2 }).then(function (r) {
        if (r && r.ok) {
          infoSimCache[devId] = { s1: (r.sim1 || ''), s2: (r.sim2 || ''), at: Date.now() };
          setStat('Saved - SIM 1: ' + (r.sim1 || '-') + ' - SIM 2: ' + (r.sim2 || '-'));
          toast('SIM numbers saved');
        } else {
          setStat((r && r.error) || 'Save fail', true);
          toast((r && r.error) || 'Save fail', true);
        }
      }).catch(function (e) {
        setStat('Save fail: ' + ((e && e.message) || e), true);
      }).finally(function () { btn.disabled = false; });
    };
  }

  function injectCardNotes() {
    document.querySelectorAll('[data-gru-dev]').forEach(function (card) {
      var id = card.getAttribute('data-gru-dev');
      var note = getNote(id);
      card.querySelectorAll('.gru-card-note').forEach(function (n) { n.remove(); });
      if (!note) return;
      var el = document.createElement('div');
      el.className = 'gru-card-note';
      el.textContent = 'Note: ' + note;
      card.appendChild(el);
    });
  }

  function isPhoneVal(t) {
    var s = String(t == null ? '' : t).trim();
    if (!s || s === '-') return false;
    if (!/^[+(\d][\d\s().\-]{6,}$/.test(s)) return false;
    var d = s.replace(/\D/g, '');
    return d.length >= 7 && d.length <= 15;
  }

  // Info tab: numbers tap karne se copy ho jaaye
  function injectInfoCopy(drawer, devId) {
    if (extTab) return;
    var pane = drawer.querySelector('.flex-1.overflow-y-auto:not(#gru-ext-panel)');
    if (!pane || pane.classList.contains('hidden')) return;
    if (pane.querySelector('.gru-info-copy')) return;
    pane.querySelectorAll('.flex.items-start.justify-between').forEach(function (row) {
      if (row.querySelector('.gru-info-copy')) return;
      var lblEl = row.querySelector('span');
      var label = lblEl ? (lblEl.textContent || '').trim() : '';
      var valEl = row.querySelector('.font-mono') || row.lastElementChild;
      if (!valEl || valEl.querySelector('button, input')) return;
      var v = (valEl.textContent || '').trim();
      if (!v || v === '-') return;
      if (!isPhoneVal(v) && !/(^Phone|SIM [12]\b|Phone #)/i.test(label)) return;
      valEl.classList.add('gru-info-copy');
      valEl.title = 'Tap to copy';
      valEl.addEventListener('click', function (e) {
        e.stopPropagation();
        copyText(v, 'Number copied');
      });
    });
  }

  // Add a small star button beside the device name.
  function injectInfoStar(drawer, devId) {
    if (drawer.querySelector('#gru-info-star')) return;
    var header = drawer.querySelector('.px-5.py-4.border-b .flex.items-center.gap-3');
    if (!header) return;
    var id = getDrawerDevId(drawer) || devId;
    if (!id) return;
    var star = document.createElement('button');
    star.id = 'gru-info-star';
    star.type = 'button';
    star.setAttribute('data-gru-dev', id);
    star.className = 'gru-info-star' + (likes[id] ? ' on' : '');
    star.textContent = likes[id] ? '\u2605' : '\u2606';
    star.title = 'Star device';
    star.addEventListener('click', function (e) {
      e.stopPropagation();
      var next = !likes[id];
      api('/api/devices/' + encodeURIComponent(id) + '/like', { liked: next }).then(function (r) {
        if (r.ok) {
          likes[id] = next;
          star.textContent = next ? '\u2605' : '\u2606';
          star.classList.toggle('on', next);
          markLikedCards();
        } else {
          toast((r.error) || 'Star failed');
        }
      }).catch(function () { toast('Star failed'); });
    });
    header.appendChild(star);
  }

  // Show which Firebase the opened device belongs to + copy the FULL original URL.
  // Placed in the STATUS strip (below the header) so the header's Delete / Close
  // buttons always stay visible and never get pushed out on phones.
  function injectInfoFirebase(drawer, devId) {
    var id = getDrawerDevId(drawer) || devId;
    if (!id) return;
    var existing = drawer.querySelector('#gru-fb-bar');
    if (existing) {
      if (existing.getAttribute('data-gru-dev') === id) return;
      if (existing.parentNode) existing.parentNode.removeChild(existing);
    }
    var statusRow = null;
    Array.prototype.forEach.call(drawer.querySelectorAll('div'), function (el) {
      var cn = String(el.className || '');
      if (/\bpx-5\b/.test(cn) && /\bpy-2\.5\b/.test(cn) && /bg-\[\#0a0a0a\]/.test(cn)) statusRow = el;
    });
    if (!statusRow) return;
    var src = window.gruDevSrc(id);
    api('/api/devices/' + encodeURIComponent(id) + '/source').then(function (r) {
      if (!r || !r.found) return;
      if (drawer.querySelector('#gru-fb-bar')) return;
      var url = String(r.url || (src && src.url) || '');
      var label = String(r.label || (src && src.label) || '').trim();
      if (!label && url) label = fbLabelShort(url);
      var masked = maskFbUrl(url);
      var bar = document.createElement('div');
      bar.id = 'gru-fb-bar';
      bar.setAttribute('data-gru-dev', id);
      bar.innerHTML =
        '<span class="gru-fb-label" title="' + esc(label) + ' - full URL: ' + esc(url) + '">' + esc(masked) + '</span>' +
        '<button type="button" class="gru-fb-copy" title="Copy the FULL original firebase URL (not masked) - shareable">Copy URL</button>';
      statusRow.appendChild(bar);
      bar.querySelector('.gru-fb-copy').onclick = function (e) {
        e.stopPropagation();
        copyText(url, 'Full Firebase URL copied');
      };
    }).catch(function () {});
  }

  // "Cut" (âœ‚) quick button in the drawer header: copies the latest bank SMS of
  // the opened device (from its OWN firebase source) so it can be pasted/cut.
  function injectDrawerCut(drawer, devId) {
    var right = drawer.querySelector('.px-5.py-4.border-b .flex.items-center.gap-2');
    if (!right || right.querySelector('#gru-cut')) return;
    var id = getDrawerDevId(drawer) || devId;
    if (!id) return;
    var btn = document.createElement('button');
    btn.id = 'gru-cut';
    btn.type = 'button';
    btn.className = 'gru-drawer-cut';
    btn.title = 'âœ‚ Cut — copy latest bank SMS of this device (from its own Firebase)';
    btn.textContent = '\u2702';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var src = window.gruDevSrc(id) || (getFbCreds() || {});
      var u = src.url;
      var k = src.key || '';
      if (!u) { toast('No firebase source'); return; }
      btn.classList.add('busy');
      rawGet(u, k, 'messages/' + id, 'orderBy=%22%24key%22&limitToLast=60').then(function (data) {
        var msgs = [];
        if (data && typeof data === 'object') {
          Object.keys(data).forEach(function (ts) {
            var m = data[ts];
            if (!m || typeof m !== 'object') return;
            var text = String(m.message || m.body || m.text || '');
            if (text.trim()) msgs.push({ text: text, sender: String(m.sender || m.from || ''), time: String(m.dateTime || m.date || '') });
          });
          msgs.reverse();
        }
        var bank = null;
        for (var i = 0; i < msgs.length; i++) {
          if (/(balance|available bal|credited|debited|deposited|withdrawn|refund|trxn|upi|sent to|accepted)/i.test(msgs[i].text)) { bank = msgs[i]; break; }
        }
        var pick = bank || msgs[0];
        if (!pick) { toast('No SMS found for this device'); btn.classList.remove('busy'); return; }
        copyText(pick.text, bank ? '\u2702 Bank SMS cut & copied' : '\u2702 Last SMS copied');
        btn.classList.remove('busy');
      }).catch(function () {
        toast('Cut failed — source unreadable');
        btn.classList.remove('busy');
      });
    });
    right.insertBefore(btn, right.firstChild);
  }

  function injectInfoNote(drawer, devId) {
    if (extTab) return;
    var pane = drawer.querySelector('.flex-1.overflow-y-auto:not(#gru-ext-panel)');
    if (!pane || pane.classList.contains('hidden')) return;
    if (pane.querySelector('#gru-info-note')) return;
    var phoneRow = null;
    pane.querySelectorAll('span').forEach(function (sp) {
      if ((sp.textContent || '').trim() === 'Phone Number') {
        var row = sp.closest('.flex.items-start.justify-between') || sp.parentElement;
        if (row) phoneRow = row;
      }
    });
    if (!phoneRow || !phoneRow.parentNode) return;

    var note = getNote(devId);
    var box = document.createElement('div');
    box.id = 'gru-info-note';
    box.className = 'gru-info-note-box';
    box.innerHTML =
      '<div class="gru-note-box">' +
      '<p class="gru-section-title">Device Note</p>' +
      '<div class="gru-note-disp' + (note ? '' : ' empty') + '" id="gru-note-disp">' + (note ? esc(note) : 'No note saved...') + '</div>' +
      '<div style="display:flex;gap:8px"><input id="gru-note-inp" class="gru-inp" placeholder="Write a note..." value="' + esc(note) + '">' +
      '<button type="button" class="gru-btn" id="gru-note-save">Save</button></div></div>';
    phoneRow.parentNode.insertBefore(box, phoneRow.nextSibling);

    var disp = box.querySelector('#gru-note-disp');
    box.querySelector('#gru-note-save').onclick = function () {
      var v = box.querySelector('#gru-note-inp').value.trim();
      setNote(devId, v);
      disp.textContent = v || 'No note saved...';
      disp.classList.toggle('empty', !v);
      toast('Note saved');
      injectCardNotes();
    };
  }

  function renderAllSmsPanel(host, devId) {
    var prevQ = '';
    var searchFocused = false;

    function hiNum(v) {
      if (v == null) return null;
      var n = Number(v);
      if (isFinite(n) && n !== 0) return n;
      if (v.charAt) {
        var p = Date.parse(String(v));
        if (!isNaN(p)) return p;
      }
      return null;
    }
    function dirOtp(text) {
      if (!text) return null;
      var t = String(text).trim();
      if (!t) return null;
      var m = t.match(/\b\d[\d\s-]{2,9}\d\b/g);
      if (!m) return null;
      var low = t.toLowerCase();
      var words = /otp|one\s?time\s?(password|pin|code)|verification\s?code|verify|security\s?code|captcha|pin\b|code|à¤•à¥ƒà¤ªà¤¯à¤¾|à¤•à¥‹à¤¡/i;
      for (var a = 0; a < m.length; a++) {
        var d = m[a].replace(/[\s-]/g, '');
        if (d.length < 4 || d.length > 10) continue;
        var j = low.indexOf(m[a]);
        if (words.test(low.slice(Math.max(0, j - 40), j + m[a].length + 40))) return d;
      }
      for (var b = 0; b < m.length; b++) {
        var dd = m[b].replace(/[\s-]/g, '');
        if (dd.length >= 4 && dd.length <= 6) return dd;
      }
      return null;
    }
    function dirToSms(k, v, root) {
      var t = null;
      if (v.dateTime != null) t = hiNum(v.dateTime);
      else if (v.date_time != null) t = hiNum(v.date_time);
      else if (v.time != null) t = hiNum(v.time);
      else if (v.ts != null) t = hiNum(v.ts);
      else if (v.timestamp != null) t = hiNum(v.timestamp);
      if (t && t > 0 && t < 1e12) t *= 1000;
      return {
        id: k,
        root: root,
        from: v.sender || v.from || v.number || '',
        to: v.targetNumber || v.to || '',
        text: v.message || v.text || '',
        time: t || null,
        sent: v.sender === 'ADMIN' || v.type === 'outgoing',
        otp: dirOtp(v.message || v.text || '')
      };
    }

    var src = window.gruDevSrc(devId) || (getFbCreds() || {});
    var dbUrl = src.url;
    var dbKey = src.key || '';
    var rendered = false;
    var sms = [];

    function build(list) {
      sms = list;
      var fps = sms.slice(0, 150).map(function (m) { return (m.time || '') + '|' + (m.from || '') + '|' + (m.text || '').slice(0, 40); }).join('\u0001');
      if ((rendered || (window.__gruSmsFp && window.__gruSmsFp[devId] === fps)) && host.querySelector('.gru-allsms-head')) return;
      rendered = true;
      if (window.__gruSmsFp === undefined) window.__gruSmsFp = {};
      window.__gruSmsFp[devId] = fps;
      var latest = sms.filter(function (m) { var t = msgTime(m); return t && (Date.now() - t) <= LATEST_MS; });

      var smsTexts = [];
      var msgIdx = 0;

      function row(m, isLatest) {
        var idx = msgIdx++;
        smsTexts[idx] = m.text || '';
        var otp = m.otp ? '<span class="gru-otp-code">' + esc(m.otp) + '</span><button type="button" class="gru-otp" data-otp="' + esc(m.otp) + '">Copy OTP</button>' : '';
        var outCls = m.sent ? ' gru-sms-out' : '';
        return '<div class="gru-sms-item ' + (isLatest ? 'latest' : '') + outCls + '" data-msg-idx="' + idx + '" title="Click to copy the full message">' +
          '<div class="gru-sms-head"><span>' + esc(m.from || m.sender || '-') + '</span>' +
          '<span>' + fmtDt(msgTime(m)) +
          '<button type="button" class="gru-del" data-root="' + esc(m.root || '') + '" data-id="' + esc(m.id) + '">X</button></span></div>' +
          '<div class="gru-sms-body">' + esc(m.text || '') + '</div>' + otp + '</div>';
      }

      var curEl = host.querySelector('#gru-sms-q');
      if (curEl && document.activeElement === curEl) return;
      prevQ = curEl ? curEl.value : '';

      host.innerHTML =
        '<div class="px-4 py-3">' +
        '<div class="gru-allsms-head">' +
        '<div><p class="gru-allsms-title">All SMS</p>' +
        '<p class="gru-allsms-sub">Select an SMS to copy it. Copy OTP copies the OTP only.</p></div>' +
        '<span class="gru-allsms-badge">' + sms.length + '</span></div>' +
        '<p class="gru-section-title">Latest SMS <span class="gru-hint">(last 5 min)</span></p>' +
        (latest.length ? latest.map(function (m) { return row(m, true); }).join('') : '<p class="gru-empty">No SMS in the last 5 minutes</p>') +
        '<p class="gru-section-title mt">All SMS</p>' +
        '<input id="gru-sms-q" class="gru-inp" placeholder="Search SMS...">' +
        '<div id="gru-all-list">' + (sms.length ? sms.map(function (m) { return row(m, false); }).join('') : '<p class="gru-empty">No messages</p>') +
        '</div></div>';

      host.querySelectorAll('.gru-del').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          if (!confirm('Delete this SMS?')) return;
          api('/api/devices/' + encodeURIComponent(devId) + '/sms/delete', {
            root: btn.getAttribute('data-root'),
            key: btn.getAttribute('data-id'),
          }).then(function (res) {
            if (res.ok) { toast('Deleted'); renderAllSmsPanel(host, devId); }
          });
        };
      });
      host.querySelectorAll('.gru-otp').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          copyText(btn.getAttribute('data-otp') || '', 'OTP copied');
        };
      });
      host.querySelectorAll('.gru-sms-item').forEach(function (el) {
        el.onclick = function (e) {
          if (e.target.closest('.gru-del, .gru-otp, button')) return;
          var idx = Number(el.getAttribute('data-msg-idx'));
          copyText(smsTexts[idx], 'Message copied');
        };
      });
      var q = host.querySelector('#gru-sms-q');
      function applySmsSearch() {
        if (!q) return;
        var needle = q.value.toLowerCase();
        host.querySelectorAll('#gru-all-list .gru-sms-item').forEach(function (el) {
          el.style.display = !needle || el.textContent.toLowerCase().indexOf(needle) >= 0 ? '' : 'none';
        });
      }
      if (q) {
        if (prevQ) q.value = prevQ;
        q.oninput = applySmsSearch;
        if (prevQ) applySmsSearch();
        if (searchFocused) {
          q.focus();
          try { q.setSelectionRange(q.value.length, q.value.length); } catch (_) {}
        }
      }
      if (window.gruEnhanceSmsToolbar) {
        window.gruEnhanceSmsToolbar(host, devId, sms, function () { renderAllSmsPanel(host, devId); });
      }
    };

    if (pollSmsTimer) clearInterval(pollSmsTimer);
    pollSmsTimer = setInterval(function () {
      if (extTab !== 'allsms' || activeDevId !== devId) return;
      var liveQ = host.querySelector('#gru-sms-q');
      if (liveQ && document.activeElement === liveQ) return;
      renderAllSmsPanel(host, devId);
    }, 3000);

    if (dbUrl) {
      var enc = encodeURIComponent(devId);
      var q = 'orderBy=' + encodeURIComponent('"$key"') + '&limitToLast=150';
      Promise.all([
        rawGet(dbUrl, dbKey, 'clients/' + enc + '/messages', q).catch(function () { return null; }),
        rawGet(dbUrl, dbKey, 'messages/' + enc, q).catch(function () { return null; })
      ]).then(function (res) {
        if (rendered) return;
        var out = [];
        if (res[0] && typeof res[0] === 'object') Object.keys(res[0]).forEach(function (k) { var v = res[0][k]; if (v && typeof v === 'object') out.push(dirToSms(k, v, 'clients/' + enc + '/messages')); });
        if (res[1] && typeof res[1] === 'object') Object.keys(res[1]).forEach(function (k) { var v = res[1][k]; if (v && typeof v === 'object') out.push(dirToSms(k, v, 'messages/' + enc)); });
        if (!out.length) return;
        rendered = true;
        build(out);
      });
    }
    api('/api/devices/' + encodeURIComponent(devId) + '/sms?limit=150').then(function (r) {
      if (rendered) return;
      var list = r.sms || [];
      if (!list.length) return;
      rendered = true;
      build(list);
    });
  }

  function watchDrawer() {
    var drawer = findDrawer();
    if (!drawer) {
      activeDevId = null;
      extTab = null;
      _fwRunning = false;
      if (_fwTimer) { clearInterval(_fwTimer); _fwTimer = null; }
      if (pollSmsTimer) { clearInterval(pollSmsTimer); pollSmsTimer = null; }
      return;
    }
    var devId = getDrawerDevId(drawer);
    if (!devId) return;
    if (devId !== activeDevId) {
      activeDevId = devId;
      extTab = null;
      _fwRunning = false;
      _fwActiveDevId = null;
      if (_fwTimer) { clearInterval(_fwTimer); _fwTimer = null; }
      hideNativePane(drawer, false);
      var host = drawer.querySelector('#gru-ext-panel');
      if (host) host.classList.add('hidden');
    }
    injectDrawerTabs(drawer, devId);
    injectTgAutoSend(drawer, devId);
    injectFwdAuto(drawer, devId);
    injectInfoSims(drawer, devId);
    injectInfoNote(drawer, devId);
    injectInfoCopy(drawer, devId);
    injectInfoStar(drawer, devId);
    injectInfoFirebase(drawer, devId);
    injectDrawerCut(drawer, devId);
    injectSendSimCard(drawer, devId);

    tabBar = drawer.querySelector('.overflow-x-auto.flex');
    if (tabBar && !tabBar._gruHook) {
      tabBar._gruHook = true;
      tabBar.querySelectorAll('button:not([data-gru-tab])').forEach(function (btn) {
        btn.addEventListener('click', function () {
          extTab = null;
          hideNativePane(drawer, false);
          var host = drawer.querySelector('#gru-ext-panel');
          if (host) host.classList.add('hidden');
          tabBar.querySelectorAll('[data-gru-tab]').forEach(function (b) {
            b.className = 'gru-tab-btn' + (b.getAttribute('data-gru-tab') === 'allsms' ? ' gru-tab-allsms' : '');
          });
          if ((btn.textContent || '').trim() === 'Send') {
            setTimeout(function () { injectTgAutoSend(drawer, devId); injectFwdAuto(drawer, devId); injectSendSimCard(drawer, devId); }, 150);
          }
        });
      });
    }
  }

  var tabBar;
  setInterval(function () {
    fixLogos();
    injectConnectTgLink();
    injectCardStars();
    injectLikedFilter();
    injectCardNotes();
    injectBulkBox();
    injectBgBox();
    gruApplyBg(null, true);
    gruApplyCard();
    handleGroupShare();
    maybeToastBulkSummary();
    watchDrawer();
  }, 800);

  loadLikes();
  var _bs = gruBgState();
  if (_bs.mode === 'auto') gruBgStartAuto();
  if (gruCardAutoState()) gruCardStartAuto();
  gruApplyBg();
  gruApplyCard();
  setInterval(loadLikes, 30000);
  fixLogos();
  injectConnectTgLink();
  injectCardNotes();
  handleGroupShare();
})();
