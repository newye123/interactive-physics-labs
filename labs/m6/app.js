/* M6 读数训练器 · 课堂流程（状态机 + 键盘 + 台本） */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var instSvg = $('#instSvg'), loupeSvg = $('#loupeSvg'), loupeWrap = $('#loupeWrap');

  var S = {
    screen: 'start', count: 6, qs: [], i: 0, phase: 'ask',
    majority: null, setVal: null, solved: false, attempts: 0,
    results: [], t0: 0, timer: null, dragging: false, lastX: 0
  };
  var sel = { instName: { caliper: '游标卡尺', micrometer: '螺旋测微器' } };

  /* ---------- 出题 ---------- */
  function randType(prevType) {
    var t = ['read', 'bug', 'set'][Math.floor(Math.random() * 3)];
    return (t === prevType && Math.random() < 0.5) ? 'read' : t;
  }
  function makePayload(inst) { return inst === 'caliper' ? Inst.newCaliper() : Inst.newMic(); }
  function buildQuestions(n) {
    var qs = [];
    var seen = localStorage.getItem('m6.seenSeeds') === '1';
    if (!seen && n >= 2) {
      Inst.presets.forEach(function (p) {
        var item = p.kind === 'caliper' ? Inst.newCaliper(p.div, p.v01) : Inst.newMic(p.vUm);
        qs.push({ type: 'read', inst: p.kind, item: item,
          options: p.kind === 'caliper' ? Inst.calOptions(item) : Inst.micOptions(item),
          expl: (p.kind === 'caliper' ? Inst.calExpl(item) : Inst.micExpl(item)), tag: p.tag });
      });
      localStorage.setItem('m6.seenSeeds', '1');
    }
    var prev = null;
    while (qs.length < n) {
      var t = qs.length < 2 && !seen ? 'read' : randType(prev);
      var inst = Math.random() < 0.5 ? 'caliper' : 'micrometer';
      if (t === 'bug') {
        var bq = Inst.bugQuestion(inst);
        qs.push({ type: 'bug', inst: bq.kind, item: bq.item, claim: bq.claim,
          options: bq.options, expl: bq.expl, tag: '' });
      } else if (t === 'set') {
        var it = makePayload(inst), span = inst === 'caliper'
          ? Math.max(3, Math.round(20 * it.prec01) ) : 500;
        var off = (inst === 'caliper')
          ? (Math.floor(Math.random() * 15) + 5) * it.prec01
          : (Math.floor(Math.random() * 400) + 150) * 5;
        var start = it.v01 != null ? it.v01 - off : it.vUm - off;
        if (inst === 'caliper') { if (start < it.prec01) start = it.v01 + off; }
        else { if (start < 3000) start = it.vUm + off; if (start > 11000) start = it.vUm - off; }
        qs.push({ type: 'set', inst: inst, item: it, start0: start,
          expl: (inst === 'caliper' ? Inst.calExpl(it) : Inst.micExpl(it)), tag: '' });
      } else {
        var it2 = makePayload(inst);
        qs.push({ type: 'read', inst: inst, item: it2,
          options: inst === 'caliper' ? Inst.calOptions(it2) : Inst.micOptions(it2),
          expl: (inst === 'caliper' ? Inst.calExpl(it2) : Inst.micExpl(it2)), tag: '' });
      }
      prev = t;
    }
    return qs;
  }
  function correctIdx(q) { for (var i = 0; i < q.options.length; i++) if (q.options[i].correct) return i; return -1; }
  function qVal(q) { return q.inst === 'caliper' ? q.item.v01 : q.item.vUm; }
  function clampSet(q, v) {
    if (q.inst === 'caliper') return Math.max(q.item.prec01, Math.min(v, 5900));
    return Math.max(3000, Math.min(v, 11000));
  }
  function drawQ(q, value, highlight, targetEl) {
    var el = targetEl || instSvg;
    var it = q.item, v = value != null ? value : qVal(q);
    if (q.inst === 'caliper') {
      if (v !== it.v01) it = Inst.newCaliper(it.div, v); // 摆位置态：按当前值重算 m/n
      Inst.drawCal(el, it, { highlight: highlight });
    } else {
      if (v !== it.vUm) it = Inst.newMic(v);
      Inst.drawMic(el, it, { highlight: highlight });
    }
    return it;
  }
  function loupeView(q) {
    return q.inst === 'caliper' ? Inst.calLoupeView(q.item) : Inst.micLoupeView(q.item);
  }
  function stepOf(q) { return q.inst === 'caliper' ? q.item.prec01 : 5; }
  function mmFmt(q, v) {
    return q.inst === 'caliper' ? Inst.fmtCal(v, q.item.div) : Inst.fmtMic(v);
  }

  /* ---------- 屏幕 ---------- */
  function showScreen(name) {
    S.screen = name;
    $('#startScreen').classList.toggle('hidden', name !== 'start');
    $('#questionScreen').classList.toggle('hidden', name !== 'question');
    $('#endScreen').classList.toggle('hidden', name !== 'end');
  }
  function fmtClock(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60); s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function tick() { $('#clock').textContent = fmtClock(Date.now() - S.t0); }

  /* ---------- 开始 / 结束 ---------- */
  function start(n) {
    S.count = n; S.qs = buildQuestions(n); S.i = 0; S.results = [];
    S.t0 = Date.now();
    clearInterval(S.timer); S.timer = setInterval(tick, 1000); tick();
    showScreen('question'); renderQuestion();
  }
  function end() {
    clearInterval(S.timer);
    var ok = S.results.filter(Boolean).length, tot = S.results.length;
    var pct = tot ? ok / tot : 0;
    var words = pct >= 0.85 ? '全员过关——可以上真仪器了。'
      : pct >= 0.6 ? '不错。再练一组，把速度提上来。'
      : '建议回教材 11.3（p62–65）把读数规则重读一遍，再来一组。';
    $('#endScore').innerHTML = '答对 <b class="num">' + ok + '</b> / <b class="num">' + tot +
      '</b> 题 · 用时 <b class="num">' + fmtClock(Date.now() - S.t0) + '</b><br>' + words;
    showScreen('end');
  }

  /* ---------- 渲染题目 ---------- */
  function renderQuestion() {
    var q = S.qs[S.i];
    S.phase = 'ask'; S.majority = null; S.solved = false; S.attempts = 0;
    q.setVal = q.start0 != null ? q.start0 : null;
    $('#qCounter').textContent = '第 ' + (S.i + 1) + ' / ' + S.qs.length + ' 题';
    var typeName = q.type === 'read' ? '读读数' : q.type === 'bug' ? '找茬' : '摆位置';
    var instName = sel.instName[q.inst];
    var sub = q.inst === 'caliper'
      ? instName + ' · ' + q.item.div + ' 分度（精度 ' + (q.item.prec01 / 100) + ' mm）'
      : instName + ' · 螺距 0.5 mm，估读到 0.001 mm';
    var prompt = '';
    if (q.type === 'read') {
      prompt = '这块' + instName + '的读数是多少？<span class="sub">' + typeName + ' · ' + sub +
        '<br>全班先举手指选一个，老师点“多数派”，再按空格揭晓。</span>';
    } else if (q.type === 'bug') {
      prompt = '某同学的读数是 <span class="num" style="color:var(--red)">' + q.claim +
        '</span>——他错在哪？<span class="sub">' + typeName + ' · ' + sub +
        '<br>全班先举手指选一个，老师点“多数派”，再按空格揭晓。</span>';
    } else {
      prompt = '把仪器调到 <span class="num" style="color:var(--blue)">' + q.item.fmt +
        '</span><span class="sub">' + typeName + ' · ' + sub +
        '<br>拖动游标/鼓轮，或用 ± 大按钮；对齐后按「确认」。</span>';
    }
    $('#prompt').innerHTML = prompt;

    var choices = $('#choices'), setCtrls = $('#setCtrls');
    choices.innerHTML = '';
    if (q.type === 'set') {
      choices.classList.add('hidden'); setCtrls.classList.remove('hidden');
      var st = stepOf(q);
      $('#nDnBig').textContent = q.inst === 'caliper' ? '−1 mm' : '−1 mm';
      $('#nDnStep').textContent = q.inst === 'caliper' ? '−' + (st / 100) + ' mm' : '−0.005 mm';
      $('#nUpStep').textContent = q.inst === 'caliper' ? '+' + (st / 100) + ' mm' : '+0.005 mm';
      $('#nUpBig').textContent = q.inst === 'caliper' ? '+1 mm' : '+1 mm';
      drawQ(q, q.setVal, false); setFeedback();
      $('#btnReveal').disabled = false; $('#btnReveal').textContent = '看答案（空格）';
    } else {
      choices.classList.remove('hidden'); setCtrls.classList.add('hidden');
      var letters = ['A', 'B', 'C'];
      q.options.forEach(function (o, idx) {
        var b = document.createElement('button');
        b.className = 'choice'; b.dataset.i = idx;
        b.innerHTML = '<span class="badge">' + letters[idx] + '</span><span>' + o.text + '</span>';
        b.addEventListener('click', function () { onChoice(idx, b); });
        choices.appendChild(b);
      });
      drawQ(q, null, false);
      $('#btnReveal').disabled = true; $('#btnReveal').textContent = '揭晓答案（空格）';
    }
    loupeWrap.classList.add('hidden');
    $('#feedback').innerHTML = '';
    $('#modelNote').textContent = q.inst === 'caliper'
      ? '模型说明：默认无零误差；游标卡尺不估读——主尺读数 ＋ 游标线数 × 精度。'
      : '模型说明：默认无零误差；螺距 0.5 mm、可动刻度 50 格；估读到 0.001 mm。';
    refreshDrawer();
  }

  function onChoice(idx, btn) {
    if (S.phase !== 'ask') return;
    S.majority = idx;
    document.querySelectorAll('.choice').forEach(function (b) { b.classList.remove('chosen'); });
    btn.classList.add('chosen'); btn.blur();
    $('#btnReveal').disabled = false;
    refreshDrawer();
  }

  /* ---------- 揭晓 ---------- */
  function reveal() {
    if (S.phase !== 'ask') return;
    var q = S.qs[S.i]; S.phase = 'reveal';
    var qel = $('#feedback');
    if (q.type === 'set') {
      var okSet = q.setVal === qVal(q); S.solved = okSet;
      drawQ(q, null, true);                       // 画目标位置并高亮
      qel.innerHTML = okSet
        ? '<span class="ok">✓ 对齐了！</span><span class="calc">' + q.expl + '</span>'
        : '<span class="bad">看答案：</span><span class="calc">' + q.expl + '</span>';
      S.results.push(okSet);
    } else {
      var ci = correctIdx(q);
      document.querySelectorAll('.choice').forEach(function (b) {
        var i = +b.dataset.i;
        b.disabled = true;
        if (i === ci) { b.classList.add('correct'); b.querySelector('.mark') || b.insertAdjacentHTML('beforeend', '<span class="mark">✓ 正确</span>'); }
        else if (i === S.majority) { b.classList.add('wrong'); b.insertAdjacentHTML('beforeend', '<span class="mark">全班多数派</span>'); }
      });
      drawQ(q, null, true);
      var right = S.majority === ci;
      qel.innerHTML = (right ? '<span class="ok">✓ 全班答对了！</span>' : '<span class="bad">多数派翻车了——</span>') +
        '<span class="calc">' + q.expl + '</span>' +
        (q.tag ? '<span class="tag">' + q.tag + '</span>' : '');
      S.results.push(right);
    }
    // 放大镜
    var it = q.item;
    if (q.inst === 'caliper') Inst.drawCal(loupeSvg, it, { highlight: true, viewBox: Inst.calLoupeView(it) });
    else Inst.drawMic(loupeSvg, it, { highlight: true, viewBox: Inst.micLoupeView(it) });
    loupeWrap.classList.remove('hidden');
    $('#btnReveal').textContent = (S.i + 1 >= S.qs.length) ? '完成（空格）' : '下一题（空格）';
    refreshDrawer();
  }

  /* ---------- 前进 / 复位 ---------- */
  function advance() {
    var q = S.qs[S.i];
    if (S.phase === 'ask') {
      if (q.type === 'set') { reveal(); return; }
      if (S.majority == null) {
        var c = $('#choices'); c.classList.add('shake');
        $('#feedback').innerHTML = '<span class="bad">先让全班举手，点一个“多数派”，再揭晓。</span>';
        setTimeout(function () { c.classList.remove('shake'); }, 400);
        return;
      }
      reveal(); return;
    }
    S.i++;
    if (S.i >= S.qs.length) end(); else renderQuestion();
  }
  function resetQ() {
    if (S.screen !== 'question') return;
    var q = S.qs[S.i];
    if (q.type === 'set') { q.start0 = clampSet(q, qVal(q) + (Math.random() < 0.5 ? 1 : -1) * (10 * stepOf(q))); if (q.start0 === qVal(q)) q.start0 = qVal(q) - 10 * stepOf(q); }
    renderQuestion();
  }

  /* ---------- 摆位置 ---------- */
  function setFeedback() {
    var q = S.qs[S.i], el = $('#feedback');
    if (S.phase !== 'ask') return;
    var diff = q.setVal - qVal(q);
    if (diff === 0) { el.innerHTML = '<span class="ok">✓ 看起来对齐了——按「确认」锁定。</span>'; return; }
    if (S.attempts === 0) {
      el.innerHTML = diff > 0 ? '再调小一点。' : '再调大一点。';
    } else {
      el.innerHTML = diff > 0 ? '偏大 ' + mmFmt(q, Math.abs(diff)) + '，再调小一点。'
                              : '偏小 ' + mmFmt(q, Math.abs(diff)) + '，再调大一点。';
    }
  }
  function setAdjust(delta) {
    var q = S.qs[S.i];
    if (q.type !== 'set' || S.phase !== 'ask') return;
    q.setVal = clampSet(q, q.setVal + delta);
    drawQ(q, q.setVal, false); setFeedback(); refreshDrawer();
  }
  function onConfirm() {
    var q = S.qs[S.i];
    if (q.type !== 'set' || S.phase !== 'ask') return;
    if (q.setVal === qVal(q)) { reveal(); }
    else { S.attempts++; setFeedback(); }
  }
  function onDrag(ev) {
    var q = S.qs[S.i];
    if (!q || q.type !== 'set' || S.phase !== 'ask') return;
    var vb = instSvg.viewBox.baseVal, rect = instSvg.getBoundingClientRect();
    var k = vb.width / Math.max(1, rect.width);
    var dx = ev.clientX - S.lastX; S.lastX = ev.clientX;
    var U = q.inst === 'caliper' ? Inst.CAL_U : Inst.MIC_P;
    var dval = dx * k / U;                                   // mm
    var step = stepOf(q);
    var cur = q.setVal + (q.inst === 'caliper' ? dval * 100 : dval * 1000);
    q.setVal = clampSet(q, Math.round(cur / step) * step);
    drawQ(q, q.setVal, false); setFeedback(); refreshDrawer();
  }

  /* ---------- 台本 ---------- */
  function refreshDrawer() {
    var body = $('#drawerBody');
    if (S.screen !== 'question' || !S.qs[S.i]) {
      body.innerHTML = '<p class="dim">开始上课后，这里会显示这一题的 30 秒台本。</p>'; return;
    }
    var q = S.qs[S.i], L = [];
    var revealed = S.phase === 'reveal';
    if (q.type === 'read') {
      L.push(['情境', '看这块' + sel.instName[q.inst] + '，先别算——让全班猜一个。']);
      L.push(['提问', '全班举手指，选 A / B / C。']);
      L.push(['操作', '点“多数派” → 空格揭晓。']);
    } else if (q.type === 'bug') {
      L.push(['情境', '某同学读出了 ' + q.claim + '，全班一起来找茬。']);
      L.push(['提问', '他错在哪？全班举手指，选 A / B / C。']);
      L.push(['操作', '点“多数派” → 空格揭晓。']);
    } else {
      L.push(['情境', '目标读数已经给出，全班监督：现在是偏大还是偏小？']);
      L.push(['提问', '谁上来调？其他同学盯着游标零线 / 鼓轮读数报方向。']);
      L.push(['操作', '拖动或 ± 按钮，对齐后按「确认」。']);
    }
    L.push(['揭晓句', revealed ? q.expl : '（揭晓后自动出现在这里）']);
    L.push(['落点', q.inst === 'caliper' ? '教材 11.3 练习 1（p67）' : '教材 11.3 练习 1、3（p67）']);
    L.push(['追问层', '点一个猜错的同学：你先看哪把尺？第几条线对齐？']);
    L.push(['快学生层', q.inst === 'caliper' ? '换 20 分度，同一个位置再读一次，读数怎么变？'
      : '如果半刻度线没露出来，读数差多少？']);
    var html = '<dl>';
    L.forEach(function (kv) { html += '<dt>' + kv[0] + '</dt><dd>' + kv[1] + '</dd>'; });
    html += '</dl><p class="dim" style="margin-top:12px">' +
      ($('#modelNote').textContent || '') + '</p>';
    body.innerHTML = html;
  }

  /* ---------- 键盘 / 按钮 ---------- */
  function toggleDrawer(force) {
    var d = $('#drawer'), on = force != null ? force : !d.classList.contains('open');
    d.classList.toggle('open', on);
    $('#btnDrawer').classList.toggle('on', on);
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  }
  function toggleSafety() {
    var on = !document.body.classList.contains('safety');
    document.body.classList.toggle('safety', on);
    localStorage.setItem('m6.safety', on ? '1' : '0');
    $('#btnSafety').classList.toggle('on', on);
  }
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var k = e.key;
    if (k === ' ') {
      e.preventDefault();
      if (S.screen === 'start') start(6);
      else if (S.screen === 'question') advance();
      else if (S.screen === 'end') start(S.count);
    } else if (k === '1' || k === '2' || k === '3') {
      if (S.screen === 'question' && S.phase === 'ask') {
        var b = document.querySelector('.choice[data-i="' + (+k - 1) + '"]');
        if (b) { onChoice(+k - 1, b); }
      }
    } else if (k === 'r' || k === 'R') { resetQ(); }
    else if (k === 't' || k === 'T') { toggleDrawer(); }
    else if (k === 'f' || k === 'F') { toggleFull(); }
    else if (k === 'ArrowLeft') { if (S.screen === 'question') { e.preventDefault(); setAdjust(-stepOf(S.qs[S.i])); } }
    else if (k === 'ArrowRight') { if (S.screen === 'question') { e.preventDefault(); setAdjust(stepOf(S.qs[S.i])); } }
    else if (k === 'ArrowUp') { if (S.screen === 'question') { e.preventDefault(); setAdjust(S.qs[S.i].inst === 'caliper' ? 100 : 1000); } }
    else if (k === 'ArrowDown') { if (S.screen === 'question') { e.preventDefault(); setAdjust(S.qs[S.i].inst === 'caliper' ? -100 : -1000); } }
  });

  /* ---------- 事件绑定 ---------- */
  $('#countPick').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    start(+b.dataset.count);
  });
  $('#btnReveal').addEventListener('click', function () { this.blur(); if (S.phase === 'ask') reveal(); else advance(); });
  $('#btnConfirm').addEventListener('click', function () { this.blur(); onConfirm(); });
  $('#nDnBig').addEventListener('click', function () { setAdjust(S.qs[S.i].inst === 'caliper' ? -100 : -1000); });
  $('#nUpBig').addEventListener('click', function () { setAdjust(S.qs[S.i].inst === 'caliper' ? 100 : 1000); });
  $('#nDnStep').addEventListener('click', function () { setAdjust(-stepOf(S.qs[S.i])); });
  $('#nUpStep').addEventListener('click', function () { setAdjust(stepOf(S.qs[S.i])); });
  $('#btnDrawer').addEventListener('click', function () { toggleDrawer(); });
  $('#btnDrawerClose').addEventListener('click', function () { toggleDrawer(false); });
  $('#btnSafety').addEventListener('click', toggleSafety);
  $('#btnFull').addEventListener('click', toggleFull);
  $('#btnAgain').addEventListener('click', function () { start(S.count); });
  $('#btnHome').addEventListener('click', function () { showScreen('start'); clearInterval(S.timer); });
  instSvg.addEventListener('pointerdown', function (e) {
    var q = S.qs[S.i];
    if (!q || q.type !== 'set' || S.phase !== 'ask') return;
    S.dragging = true; S.lastX = e.clientX;
    try { instSvg.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  instSvg.addEventListener('pointermove', function (e) { if (S.dragging) onDrag(e); });
  instSvg.addEventListener('pointerup', function () { S.dragging = false; });

  /* ---------- 初始化 ---------- */
  if (localStorage.getItem('m6.safety') === '1') { toggleSafety(); }
  var st = Inst.selfTest(300);
  console.log('[M6] 几何自检：' + (st.ok ? '通过（' + st.count * 4 + ' 例）' : '失败 ' + st.fails.join(' | ')));
  window.__m6 = { S: S, start: start, advance: advance, reveal: reveal, resetQ: resetQ,
    buildQuestions: buildQuestions, selfTest: Inst.selfTest };
})();
