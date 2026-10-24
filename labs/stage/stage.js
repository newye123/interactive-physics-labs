/* 课堂舞台 · 编排器 + 剧情引擎（实验室的附加层）
   —— 编排器：计时 / 举手 / 抽人 / 小组计分 / 课堂数据（不依赖剧情，挂上就能用）
   —— 剧情：数据来自 window.CL_MISSIONS（missions/*.js）；URL 带 ?m=11-4 自动载入
   —— 实验室接口（存在才用）：window.__cl.snapshot() + window 上的 'lab-event' 事件
   老师改台词：直接改 missions/*.js 里的字符串，保存刷新即可。 */
(function () {
  'use strict';
  var REG = window.CL_MISSIONS || {};

  /* ================= 状态 ================= */
  var S = {
    mission: null, idx: -1, open: false, done: false,
    cardState: [], snaps: [],
    timer: { iv: null, remain: 0, dur: 0 },
    hands: { few: 0, half: 0, many: 0 },
    scores: [0, 0, 0, 0],
    roll: { last: 0, busy: false },
    metrics: { timers: 0, rolls: 0, cmds: 0, hands: 0, events: {} },
    callCard: null, callBeat: 0, ac: null
  };

  /* ================= 小工具 ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmt(v, d) { v = +v || 0; return v.toFixed(d == null ? 3 : d); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function stopEv(e) { e.preventDefault(); e.stopPropagation(); }

  /* ================= 注入 DOM ================= */
  var bar, ribbon, callOv;

  function inject() {
    var score = '';
    for (var g = 0; g < 4; g++) {
      score += '<button class="stg-btn stg-score" data-act="score" data-g="' + g + '">' + (g + 1) +
        '组<b class="n">0</b></button>' +
        '<button class="stg-btn mini" data-act="score-minus" data-g="' + g + '">−</button>';
    }
    bar = el([
      '<div id="stageBar">',
      '  <div class="stg-group">',
      '    <button class="stg-btn" data-act="story" id="stgStoryBtn">🎬 剧情</button>',
      '    <span class="stg-mission" id="stgMissionTitle"></span>',
      '    <span class="stg-dim" id="stgMissionStep"></span>',
      '    <div class="stg-pop" id="stgMenu"></div>',
      '  </div>',
      '  <div class="stg-group">',
      '    <span class="stg-label">⏱ 计时</span>',
      '    <button class="stg-btn" data-act="timer" data-sec="10">10s</button>',
      '    <button class="stg-btn" data-act="timer" data-sec="20">20s</button>',
      '    <button class="stg-btn" data-act="timer" data-sec="60">60s</button>',
      '    <button class="stg-btn" data-act="timer" data-sec="120">2min</button>',
      '    <button class="stg-btn mini" data-act="timer-stop">■</button>',
      '    <span class="stg-num" id="stgTimer">—</span>',
      '  </div>',
      '  <div class="stg-group" id="stgHandsGroup">',
      '    <span class="stg-label">✋ 举手</span>',
      '    <button class="stg-btn" data-act="hand" data-opt="few">少</button>',
      '    <button class="stg-btn" data-act="hand" data-opt="half">半</button>',
      '    <button class="stg-btn" data-act="hand" data-opt="many">多</button>',
      '    <span class="stg-dim" id="stgHands">0 / 0 / 0</span>',
      '    <button class="stg-btn mini" data-act="hand-reset">↺</button>',
      '  </div>',
      '  <div class="stg-group">',
      '    <span class="stg-label">🎲 抽</span>',
      '    <input class="stg-input" id="stgRollMin" inputmode="numeric">',
      '    <span class="stg-dim">–</span>',
      '    <input class="stg-input" id="stgRollMax" inputmode="numeric">',
      '    <button class="stg-btn" data-act="roll">抽人</button>',
      '    <span class="stg-num" id="stgRollVal">—</span>',
      '  </div>',
      '  <div class="stg-group">',
      '    <span class="stg-label">🏁 小组</span>',
      score,
      '    <button class="stg-btn mini" data-act="score-reset">↺</button>',
      '  </div>',
      '  <div class="stg-group">',
      '    <button class="stg-btn" data-act="sum">Σ 课堂数据</button>',
      '    <div class="stg-pop right" id="stgSumPop"></div>',
      '  </div>',
      '</div>'
    ].join('\n'));
    ribbon = el([
      '<div id="stageRibbon">',
      '  <div class="stg-rib-main">',
      '    <div class="stg-rib-head">',
      '      <span class="stg-chip" id="stgRibChip">任务</span>',
      '      <span class="stg-rib-title" id="stgRibTitle"></span>',
      '    </div>',
      '    <div id="stgRibBody"></div>',
      '  </div>',
      '  <div class="stg-rib-side">',
      '    <span class="stg-step" id="stgRibStep"></span>',
      '    <button class="stg-btn mini" data-act="card-prev" id="stgBtnPrev">←</button>',
      '    <button class="stg-btn sm" data-act="card-next" id="stgBtnNext">下一步 →</button>',
      '    <button class="stg-btn mini" data-act="card-collapse">收起 Esc</button>',
      '  </div>',
      '</div>'
    ].join('\n'));
    callOv = el([
      '<div id="callOverlay">',
      '  <div class="stg-call-card">',
      '    <div class="stg-call-head">',
      '      <div class="stg-avatar" id="callAvatar">王</div>',
      '      <div><div class="stg-call-who" id="callWho">来电</div>',
      '      <div class="stg-call-tag" id="callTag"></div></div>',
      '    </div>',
      '    <div class="stg-call-text" id="callText"></div>',
      '    <div class="stg-call-foot">',
      '      <div class="stg-dots" id="callDots"></div>',
      '      <div style="display:flex;gap:10px">',
      '        <button class="stg-btn ghost" data-act="call-skip">跳过这张</button>',
      '        <button class="stg-btn big" data-act="call-next" id="callBtnNext">继续 →</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n'));
    var tb = $('#topbar');
    if (tb) tb.insertAdjacentElement('afterend', ribbon);
    else document.body.insertBefore(ribbon, document.body.firstChild);
    var hint = $('#hintbar');
    if (hint) document.body.insertBefore(bar, hint);
    else document.body.appendChild(bar);
    document.body.appendChild(callOv);
  }

  /* ================= 编排器：计时 ================= */
  function ensureAC() {
    try {
      if (!S.ac) S.ac = new (window.AudioContext || window.webkitAudioContext)();
      if (S.ac && S.ac.state === 'suspended') S.ac.resume();
    } catch (e) {}
  }
  function beep(n) {
    if (!S.ac) return;
    try {
      var t0 = S.ac.currentTime;
      for (var i = 0; i < n; i++) {
        var o = S.ac.createOscillator(), g = S.ac.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        var t = t0 + i * 0.26;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(S.ac.destination);
        o.start(t); o.stop(t + 0.24);
      }
    } catch (e) {}
  }
  function startTimer(sec) {
    ensureAC();
    if (S.timer.iv && S.timer.dur === sec) { stopTimer(); clearTimerDisplay(); return; }
    stopTimer();
    S.metrics.timers++;
    S.timer.dur = sec; S.timer.remain = sec;
    $all('#stageBar [data-act="timer"]').forEach(function (b) {
      b.classList.toggle('on', +b.dataset.sec === sec);
    });
    S.timer.iv = setInterval(function () {
      S.timer.remain -= 0.25;
      if (S.timer.remain <= 0) {
        S.timer.remain = 0;
        stopTimer(); paintTimer(); beep(3); flashTimer();
      } else paintTimer();
    }, 250);
    paintTimer();
  }
  function stopTimer() {
    if (S.timer.iv) { clearInterval(S.timer.iv); S.timer.iv = null; }
    $all('#stageBar [data-act="timer"]').forEach(function (b) { b.classList.remove('on'); });
  }
  function paintTimer() {
    var node = $('#stgTimer'); if (!node) return;
    var r = Math.max(0, Math.ceil(S.timer.remain));
    var m = Math.floor(r / 60), s = r % 60;
    node.textContent = m + ':' + (s < 10 ? '0' + s : s);
  }
  function clearTimerDisplay() {
    S.timer.remain = 0; S.timer.dur = 0;
    var node = $('#stgTimer'); if (node) node.textContent = '—';
  }
  function flashTimer() {
    var node = $('#stgTimer'); if (!node) return;
    node.classList.add('done');
    setTimeout(function () { node.classList.remove('done'); }, 1600);
  }

  /* ================= 编排器：举手 / 抽人 / 计分 ================= */
  function flashHands() {
    var g = $('#stgHandsGroup'); if (!g) return;
    g.classList.add('flash');
    setTimeout(function () { g.classList.remove('flash'); }, 1800);
  }
  function rollStudent() {
    if (S.roll.busy) return;
    var mn = Math.max(1, parseInt($('#stgRollMin').value, 10) || 1);
    var mx = Math.max(mn, parseInt($('#stgRollMax').value, 10) || mn);
    lsSet('stg.roll', mn + '-' + mx);
    S.metrics.rolls++;
    S.roll.busy = true;
    var node = $('#stgRollVal');
    var ticks = 0;
    var iv = setInterval(function () {
      ticks++;
      if (ticks <= 14) { node.textContent = mn + Math.floor(Math.random() * (mx - mn + 1)); return; }
      clearInterval(iv);
      var pick = mn + Math.floor(Math.random() * (mx - mn + 1));
      if (mx > mn && pick === S.roll.last) pick = mn + ((pick - mn + 1) % (mx - mn + 1));
      S.roll.last = pick;
      node.textContent = pick;
      node.classList.add('done'); S.roll.busy = false;
      setTimeout(function () { node.classList.remove('done'); }, 1600);
    }, 60);
  }
  function persistRoll() {
    var mn = Math.max(1, parseInt($('#stgRollMin').value, 10) || 1);
    var mx = Math.max(mn, parseInt($('#stgRollMax').value, 10) || mn);
    $('#stgRollMin').value = mn; $('#stgRollMax').value = mx;
    lsSet('stg.roll', mn + '-' + mx);
  }
  function renderNums() {
    var hn = $('#stgHands'); if (hn) hn.textContent = S.hands.few + ' / ' + S.hands.half + ' / ' + S.hands.many;
    var maxV = 0, maxOpt = null;
    ['few', 'half', 'many'].forEach(function (o) { if (S.hands[o] > maxV) { maxV = S.hands[o]; maxOpt = o; } });
    $all('#stgHandsGroup [data-act="hand"]').forEach(function (b) {
      b.classList.toggle('on', maxV > 0 && b.dataset.opt === maxOpt);
    });
    $all('.stg-score').forEach(function (b) {
      var n = b.querySelector('.n'); if (n) n.textContent = S.scores[+b.dataset.g];
    });
  }

  /* ================= 弹层：剧情菜单 / 课堂数据 ================= */
  function closePops() { $all('.stg-pop').forEach(function (p) { p.classList.remove('open'); }); }
  function sumHTML() {
    var m = S.metrics, h = S.hands, ev = m.events;
    var evTxt = Object.keys(ev).length ? Object.keys(ev).map(function (k) {
      return k + '×' + ev[k];
    }).join('，') : '（还没有动作）';
    var lines = [
      '全班举手：少×' + h.few + ' · 半×' + h.half + ' · 多×' + h.many,
      '计时×' + m.timers + ' · 抽人×' + m.rolls + ' · 一键命令×' + m.cmds,
      '实验室动作：' + evTxt,
      '现场记录×' + S.snaps.length + (S.mission
        ? ' · 剧情：' + S.mission.title + '（' + (S.idx + 1) + '/' + S.mission.cards.length + ' 张）'
        : '')
    ];
    return '<div class="stg-pop-title">本课数据（对照：举手率 / 动作次数 / 出口题另记）</div>' +
      '<div class="stg-pop-text" id="stgSumText">' + lines.join('<br>') + '</div>' +
      '<button class="stg-btn sm" data-act="sum-copy">📋 复制</button>';
  }
  function toggleSum() {
    var pop = $('#stgSumPop');
    var was = pop.classList.contains('open');
    closePops();
    if (was) return;
    pop.innerHTML = sumHTML();
    pop.classList.add('open');
  }
  function copySum() {
    var node = $('#stgSumText');
    var txt = node ? node.innerText || node.textContent : '';
    function done() { if (window.__cl && window.__cl.toast) window.__cl.toast('课堂数据已复制'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e2) {}
      document.body.removeChild(ta);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* ================= 事件接线 ================= */
  function onAct(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act;
    switch (act) {
      case 'story': toggleStory(); break;
      case 'use-mission': closePops(); startMission(b.dataset.mid); cardNext(); break;
      case 'end-mission': closePops(); endMission(); break;
      case 'timer': startTimer(+b.dataset.sec); break;
      case 'timer-stop': stopTimer(); clearTimerDisplay(); break;
      case 'hand': S.hands[b.dataset.opt]++; S.metrics.hands++; renderNums(); break;
      case 'hand-reset': S.hands = { few: 0, half: 0, many: 0 }; renderNums(); break;
      case 'flash-hands': flashHands(); break;
      case 'roll': rollStudent(); break;
      case 'score': S.scores[+b.dataset.g]++; renderNums(); break;
      case 'score-minus': S.scores[+b.dataset.g] = Math.max(0, S.scores[+b.dataset.g] - 1); renderNums(); break;
      case 'score-reset': S.scores = [0, 0, 0, 0]; renderNums(); break;
      case 'sum': toggleSum(); break;
      case 'sum-copy': copySum(); break;
      case 'card-prev': cardPrev(); break;
      case 'card-next': cardNext(); break;
      case 'card-collapse': collapseStory(); break;
      case 'card-action': cardAction(+b.dataset.i); break;
      case 'call-next': callNext(); break;
      case 'call-skip': callSkip(); break;
    }
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-act]')) onAct(e);
    if (!e.target.closest('.stg-pop') && !e.target.closest('[data-act="story"]') && !e.target.closest('[data-act="sum"]')) {
      closePops();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var t = e.target;
    if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    var k = e.key;
    var overlayOpen = callOv && callOv.style.display === 'flex';
    var ribOpen = S.open && ribbon && ribbon.style.display !== 'none';
    if (overlayOpen) {
      if (k === 'ArrowRight' || k === 'Enter' || k === ' ' || k === 'PageDown') { callNext(); stopEv(e); }
      else if (k === 'Escape') { callSkip(); stopEv(e); }
      return;
    }
    if (ribOpen) {
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { cardNext(); stopEv(e); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { cardPrev(); stopEv(e); }
      else if (k === 'Escape') { collapseStory(); stopEv(e); }
    }
  }, true);

  /* ================= 剧情引擎 ================= */
  var CHIP = { mission: '任务', debrief: '结案', file: '档案', exit: '收工', call: '来电' };

  function toggleStory() {
    closePops();
    if (!S.mission) { openMenu(); return; }
    if (S.done) { startMission(S.mission.id); cardNext(); return; }
    if (S.idx < 0) { cardNext(); return; }
    if (S.open) { collapseStory(); } else { S.open = true; showCard(); }
  }
  function openMenu() {
    var html = '<div class="stg-pop-title">剧情（课堂舞台）</div>';
    var ids = Object.keys(REG);
    if (!ids.length) html += '<div class="stg-pop-text">还没有剧情数据。把 missions/*.js 放进来，刷新即可。</div>';
    ids.forEach(function (id) {
      var m = REG[id];
      html += '<button class="stg-pop-item" data-act="use-mission" data-mid="' + id + '">▶ ' +
        esc(m.title) + '<small>' + esc(m.sub || '') + '</small></button>';
    });
    if (S.mission) html += '<button class="stg-pop-item warn" data-act="end-mission">⏹ 结束当前剧情</button>';
    var menu = $('#stgMenu');
    closePops();
    menu.innerHTML = html;
    menu.classList.add('open');
  }
  function startMission(id) {
    var m = REG[id]; if (!m) return;
    S.mission = m; S.idx = -1; S.open = false; S.done = false;
    S.cardState = []; S.snaps = [];
    S.callCard = null; S.callBeat = 0;
    hideCall(); hideRibbon();
    renderStoryBtn(); renderStep();
  }
  function endMission() {
    S.mission = null; S.idx = -1; S.open = false; S.done = false;
    S.cardState = []; S.snaps = [];
    hideCall(); hideRibbon();
    renderStoryBtn(); renderStep();
  }
  function cardNext() {
    if (!S.mission) return;
    if (S.idx >= S.mission.cards.length - 1) { finishStory(); return; }
    S.idx++; showCard();
  }
  function cardPrev() {
    if (!S.mission || S.idx <= 0) return;
    S.idx--; showCard();
  }
  function finishStory() {
    S.done = true; S.open = false;
    hideCall(); hideRibbon();
    renderStoryBtn(); renderStep();
  }
  function collapseStory() {
    S.open = false;
    hideCall(); hideRibbon();
    renderStoryBtn();
  }
  function showCard() {
    if (!S.mission || S.idx < 0 || S.idx >= S.mission.cards.length) return;
    var c = S.mission.cards[S.idx];
    S.open = true;
    if (c.t === 'call') { showRibbonHidden(); showCall(c); }
    else { hideCall(); showRibbon(c); }
    renderStoryBtn(); renderStep();
  }
  function hideRibbon() { if (ribbon) ribbon.style.display = 'none'; }
  function showRibbonHidden() { hideRibbon(); }
  function hideCall() { if (callOv) callOv.style.display = 'none'; }

  /* ---- 来电（全屏） ---- */
  function showCall(c) {
    if (S.callCard !== c) { S.callCard = c; S.callBeat = 0; }
    callOv.style.display = 'flex';
    $('#callAvatar').textContent = (c.who || '电').charAt(0);
    $('#callWho').textContent = c.who || '来电';
    $('#callTag').textContent = c.tag || '';
    paintCall(c);
  }
  function paintCall(c) {
    var beats = c.beats || [''];
    $('#callText').textContent = beats[S.callBeat] || '';
    var dots = '';
    for (var i = 0; i < beats.length; i++) {
      dots += '<span class="stg-dot' + (i <= S.callBeat ? ' on' : '') + '"></span>';
    }
    $('#callDots').innerHTML = dots;
    $('#callBtnNext').textContent = S.callBeat < beats.length - 1 ? '继续 →' : '接通 · 进入任务 →';
  }
  function callNext() {
    var c = S.mission && S.mission.cards[S.idx];
    if (!c || c.t !== 'call') { hideCall(); return; }
    if (S.callBeat < (c.beats || ['']).length - 1) { S.callBeat++; paintCall(c); }
    else { hideCall(); cardNext(); }
  }
  function callSkip() { hideCall(); cardNext(); }

  /* ---- 任务卡横带 ---- */
  function cardSt() { return (S.cardState[S.idx] = S.cardState[S.idx] || {}); }
  function showRibbon(c) {
    ribbon.style.display = 'flex';
    var chip = $('#stgRibChip');
    chip.textContent = CHIP[c.t] || '卡片';
    chip.className = 'stg-chip t-' + c.t;
    $('#stgRibTitle').textContent = c.title || ((S.idx + 1) + ' / ' + S.mission.cards.length);
    $('#stgRibBody').innerHTML = cardBodyHTML(c);
    $('#stgRibStep').textContent = (S.idx + 1) + ' / ' + S.mission.cards.length;
    $('#stgBtnPrev').disabled = S.idx <= 0;
    $('#stgBtnNext').textContent = S.idx >= S.mission.cards.length - 1 ? '收工 ✓' : '下一步 →';
  }
  function cardBodyHTML(c) {
    if (c.t === 'mission') {
      var h = '<div class="stg-goal">' + c.goal + '</div>';
      if (c.pi) h += piHTML();
      h += '<div class="stg-actions">' + (c.actions || []).map(function (a, i) {
        return actHTML(a, i);
      }).join('') + '</div>';
      return h;
    }
    if (c.t === 'debrief') {
      var h2 = '<div class="stg-goal">' + (c.intro || '把两次现场记录摆在一起看：') + '</div>' + snapHTML();
      if (c.take) h2 += '<div class="stg-take">💡 ' + c.take + '</div>';
      h2 += classStatsHTML();
      return h2;
    }
    if (c.t === 'file') {
      return '<div class="stg-file-body">' + c.body + '</div>' +
        (c.tip ? '<div class="stg-dim">' + c.tip + '</div>' : '');
    }
    if (c.t === 'exit') {
      return '<div class="stg-goal">' + c.goal + '</div>' +
        (c.extra ? '<div class="stg-dim">' + c.extra + '</div>' : '');
    }
    return '';
  }
  function piHTML() {
    return '<div class="stg-pi">' +
      '<span class="stg-pi-step">① 自己拿定主意（10 秒，不出声）</span>' +
      '<span class="stg-pi-step">② 同桌互讲 20 秒：说"为什么"</span>' +
      '<span class="stg-pi-step">③ 再举一次手</span>' +
      '<button class="stg-btn sm" data-act="timer" data-sec="20">⏱ 互讲 20 秒</button>' +
      '<button class="stg-btn sm" data-act="flash-hands">✋ 去记录举手</button>' +
      '</div>';
  }
  function actHTML(a, i) {
    var st = cardSt();
    if (a.cmd) {
      return '<button class="stg-act' + (st[i] ? ' done' : '') + '" data-act="card-action" data-i="' + i + '">⚡ ' +
        a.label + '</button>';
    }
    if (a.snap) {
      return st[i]
        ? '<span class="stg-act done">✅ 已记：' + a.snap + '</span>'
        : '<button class="stg-act" data-act="card-action" data-i="' + i + '">📌 ' + a.label + '</button>';
    }
    if (a.watch) {
      return st[i]
        ? '<span class="stg-act done">✅ ' + a.label + '</span>'
        : '<span class="stg-act todo">⬜ ' + a.label + '</span>';
    }
    return '';
  }
  function runCmd(cmd) {
    try {
      var parts = String(cmd).split(':');
      if (parts[0] === 'preset' && window.__cl && window.__cl.loadPreset) {
        window.__cl.loadPreset(parts[1]);
        S.metrics.cmds++;
        return true;
      }
    } catch (e) {}
    return false;
  }
  function cardAction(i) {
    if (!S.mission || S.idx < 0) return;
    var c = S.mission.cards[S.idx];
    var a = (c.actions || [])[i]; if (!a) return;
    var st = cardSt();
    if (a.cmd) {
      runCmd(a.cmd);
      st[i] = true;
      showRibbon(c);
    } else if (a.snap) {
      if (window.__cl && window.__cl.snapshot) {
        S.snaps.push({ label: a.snap, data: window.__cl.snapshot() });
        st[i] = true;
        showRibbon(c);
        if (window.__cl.toast) window.__cl.toast('📌 已记下现场读数：' + a.snap);
      }
    }
  }
  function snapHTML() {
    if (!S.snaps.length) return '<p class="stg-dim">（没有现场记录——直接口述观察结果）</p>';
    return S.snaps.map(function (s) {
      var d = s.data || {};
      var rows = '';
      function row(k, v) { rows += '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
      if (!d.ok) rows += row('读数', '（电路没解出来）');
      else {
        if (d.battery) row('干路电流（电源输出）', fmt(d.battery.I) + ' A');
        if (d.amp) row('电流表读数', fmt(d.amp.display) + ' A' + (d.amp.over ? '（超量程）' : ''));
        if (d.volt) row('电压表读数', fmt(d.volt.display, 2) + ' V');
        var bulbs = d.bulbs && d.bulbs.length
          ? d.bulbs.map(function (b, j) {
              return '灯' + (j + 1) + (b.burnt ? '·烧断' : b.lit ? '·亮' : '·灭');
            }).join('　')
          : '（台面上已没有灯泡）';
        row('灯泡状态', bulbs);
      }
      return '<div class="stg-snap"><div class="stg-snap-h">📌 ' + s.label + '</div>' + rows + '</div>';
    }).join('');
  }
  function classStatsHTML() {
    var ev = S.metrics.events, h = S.hands;
    return '<div class="stg-stats">全班举手：少×' + h.few + ' · 半×' + h.half + ' · 多×' + h.many +
      '　｜　课堂动作：合闸×' + (ev['switch-closed'] || 0) + ' · 拆灯×' + (ev['remove-bulb'] || 0) +
      ' · 记录×' + (ev['record'] || 0) + '</div>';
  }

  /* ---- 顶栏状态 / 实验室事件 ---- */
  function renderStoryBtn() {
    var b = $('#stgStoryBtn'), t = $('#stgMissionTitle');
    if (!b) return;
    if (!S.mission) {
      b.textContent = '🎬 剧情';
      if (t) t.textContent = Object.keys(REG).length ? '（点我开一集）' : '';
      return;
    }
    if (t) t.textContent = S.mission.title;
    if (S.done) { b.textContent = '🔁 重播'; return; }
    if (S.idx < 0) { b.textContent = '▶ 开始'; return; }
    b.textContent = S.open ? '▾ 收起' : '▶ 继续';
  }
  function renderStep() {
    var node = $('#stgMissionStep'); if (!node) return;
    node.textContent = (S.mission && S.idx >= 0)
      ? (S.idx + 1) + '/' + S.mission.cards.length + (S.done ? ' ✓' : '')
      : '';
  }
  function watchHit(w, ev) {
    if (w === 'switch-closed') return ev.type === 'switch' && !!ev.closed;
    if (w === 'bulb-removed') return ev.type === 'comp-removed' && ev.ctype === 'bulb';
    if (w === 'record') return ev.type === 'record';
    if (w === 'bulb-burnt') return ev.type === 'bulb-burnt';
    if (w === 'preset') return ev.type === 'preset';
    return false;
  }
  window.addEventListener('lab-event', function (e) {
    var ev = e.detail || {};
    var key = ev.type === 'switch' ? (ev.closed ? 'switch-closed' : 'switch-open') : ev.type;
    S.metrics.events[key] = (S.metrics.events[key] || 0) + 1;
    if (ev.type === 'comp-removed') {
      var k2 = 'remove-' + ev.ctype;
      S.metrics.events[k2] = (S.metrics.events[k2] || 0) + 1;
    }
    if (!S.mission || !S.open || S.idx < 0) return;
    var c = S.mission.cards[S.idx];
    if (!c || c.t !== 'mission') return;
    var st = cardSt(), dirty = false;
    (c.actions || []).forEach(function (a, i) {
      if (!a.watch || st[i]) return;
      if (watchHit(a.watch, ev)) { st[i] = true; dirty = true; }
    });
    if (dirty) showRibbon(c);
  });

  /* ================= 启动 ================= */
  (function boot() {
    inject();
    var r = (lsGet('stg.roll') || '1-56').split('-');
    $('#stgRollMin').value = r[0] || '1';
    $('#stgRollMax').value = r[1] || '56';
    $('#stgRollMin').addEventListener('change', persistRoll);
    $('#stgRollMax').addEventListener('change', persistRoll);
    renderNums(); renderStoryBtn(); renderStep();
    var m = (location.search.match(/[?&]m=([^&]+)/) || [])[1] ||
      (location.hash.match(/m=([\w-]+)/) || [])[1];
    if (m) {
      try { m = decodeURIComponent(m); } catch (e) {}
      if (REG[m]) startMission(m);
    }
  })();
})();
