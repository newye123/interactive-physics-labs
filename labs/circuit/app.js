/* 电路实验室 · 交互层 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var MODEL = window.CircuitModel, R = window.CircuitRender, PRESETS = window.CircuitPresets;
  var svg = $('#benchSvg');

  var A = {
    circuit: new MODEL.Circuit(),
    sol: null, realMeters: true, safety: false,
    sel: null, placing: null, wiring: null,
    cursor: { x: 0, y: 0 }, hoverTerm: null,
    dragging: null, knobDrag: null,
    record: [], prevBurnt: {}, prevOver: {}, toastTimer: null
  };
  var NAME = { battery: '电池', resistor: '定值电阻', bulb: '小灯泡', switch: '开关',
    rheostat: '滑动变阻器', ammeter: '电流表', voltmeter: '电压表' };

  function ui() {
    return { sel: A.sel, placing: A.placing, wiring: A.wiring, cursor: A.cursor,
      hoverTerm: A.hoverTerm, safety: A.safety };
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(A.toastTimer);
    A.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function worldPt(ev) {
    var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    var m = svg.getScreenCTM().inverse();
    var w = p.matrixTransform(m);
    return { x: w.x, y: w.y };
  }
  var snap = function (v) { return Math.round(v / 20) * 20; };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  /* 给课堂舞台（可选附加层）推事件：window 'lab-event' */
  function emitLab(type, data) {
    try {
      var d = { type: type };
      if (data) for (var k in data) d[k] = data[k];
      window.dispatchEvent(new CustomEvent('lab-event', { detail: d }));
    } catch (e) {}
  }

  /* ---------- 求解 + 绘制 ---------- */
  function solveAndDraw() {
    A.sol = A.circuit.solve({ realMeters: A.realMeters });
    if (!A.sol.ok) toast('电路无法求解：' + A.sol.reason);
    R.draw(svg, A.circuit, A.sol, ui());
    afterSolve();
  }
  function drawOnly() { R.draw(svg, A.circuit, A.sol, ui()); }
  function afterSolve() {
    if (!A.sol || !A.sol.ok) return;
    A.circuit.comps.forEach(function (c) {
      var o = A.sol.comps[c.id]; if (!o) return;
      if (c.type === 'bulb' && o.flags.burnt && !A.prevBurnt[c.id]) {
        A.prevBurnt[c.id] = true;
        toast('灯丝烧断了！它烧断前的功率约 ' + (c.burnAt || 0).toFixed(2) + ' W（额定 0.75 W）。');
        emitLab('bulb-burnt', { id: c.id });
      }
      if (c.type === 'ammeter' && o.flags.over && !A.prevOver[c.id]) {
        A.prevOver[c.id] = true; toast('电流表超量程！真实实验中表会直接打弯——先断开开关。');
        emitLab('meter-over', { id: c.id });
      }
      if (c.type === 'ammeter' && !o.flags.over) A.prevOver[c.id] = false;
    });
    renderProps(); renderData();
  }

  /* ---------- 预置 ---------- */
  function loadPreset(id) {
    var p = PRESETS.filter(function (x) { return x.id === id; })[0] || PRESETS[0];
    A.circuit.clear();
    var ids = p.comps.map(function (cc) { return A.circuit.add(cc.t, cc.x, cc.y, cc.p).id; });
    p.wires.forEach(function (w) { A.circuit.connect(ids[w[0]], w[1], ids[w[2]], w[3]); });
    A.sel = null; A.placing = null; A.wiring = null; A.record = [];
    A.prevBurnt = {}; A.prevOver = {};
    A.presetId = p.id;
    $('#presetSel').value = p.id;
    solveAndDraw();
    emitLab('preset', { id: p.id });
  }

  /* ---------- 删除元件（带事件推送） ---------- */
  function removeComp(id) {
    var c = A.circuit.byId(id);
    A.circuit.remove(id);
    A.sel = null;
    if (c) emitLab('comp-removed', { ctype: c.type, id: id });
    solveAndDraw();
  }

  /* ---------- 属性面板 ---------- */
  function liveTable(c, o) {
    if (!o) return '';
    var rows = '';
    function row(k, v) { rows += '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
    if (c.type === 'battery') { row('端电压 U', R.fmt(Math.abs(o.U), 'V')); row('输出电流 I', R.fmt(Math.abs(o.I), 'A')); row('输出功率 P', R.fmt(o.P, 'W')); }
    else if (c.type === 'voltmeter') row('读数', R.fmt(o.display, 'V') + (o.flags.over ? '（超量程）' : ''));
    else if (c.type === 'ammeter') row('读数', R.fmt(o.display, 'A') + (o.flags.over ? '（超量程）' : ''));
    else { row('电流 I', R.fmt(Math.abs(o.I), 'A')); row('电压 U', R.fmt(Math.abs(o.U), 'V')); row('功率 P', R.fmt(o.P, 'W')); }
    return '<div class="live">' + rows + '</div>';
  }
  function chip(act, val, label) { return '<button class="chip" data-act="' + act + '" data-arg="' + val + '">' + (label || val) + '</button>'; }

  function renderProps() {
    var box = $('#props');
    if (!A.sel || !A.circuit.byId(A.sel.id)) {
      box.innerHTML = '<p class="hint">点一个元件看属性；按住端子拖线连接；点开关直接通断。</p>';
      return;
    }
    if (A.sel.kind === 'wire') {
      box.innerHTML = '<h3>导线</h3><p class="hint">删除后两端断开。</p><button class="del" data-act="delWire">删除导线（Del）</button>';
      return;
    }
    var c = A.circuit.byId(A.sel.id), o = A.sol && A.sol.ok ? A.sol.comps[c.id] : null;
    var h = '<h3>' + NAME[c.type] + '</h3>' + liveTable(c, o);
    switch (c.type) {
      case 'battery':
        h += '<div class="lab">电动势 E</div><div class="chips">' + [1.5, 3, 4.5, 6, 9].map(function (v) { return chip('E', v, v + ' V'); }).join('') + '</div>' +
          '<div class="chips">' + chip('Eminus', 0.5, '−0.5') + chip('Eplus', 0.5, '+0.5') + '</div>' +
          '<div class="lab">内阻 r</div><div class="chips">' + [0.1, 0.5, 1, 2].map(function (v) { return chip('r', v, v + ' Ω'); }).join('') + '</div>';
        break;
      case 'resistor':
        h += '<div class="lab">阻值 R</div><div class="chips">' + [5, 10, 20, 100, 1000, 3000].map(function (v) { return chip('R', v, v + ' Ω'); }).join('') + '</div>' +
          '<div class="chips">' + chip('Rminus', 100, '−100') + chip('Rminus1', 1, '−1') + chip('Rplus1', 1, '+1') + chip('Rplus', 100, '+100') + '</div>';
        break;
      case 'bulb':
        h += '<p class="hint">额定 2.5 V · 0.3 A（约 8.3 Ω）。超额定电压会烧断。</p>' +
          (c.burnt ? '<button class="primary" data-act="newbulb">换一只新灯泡</button>' : '');
        break;
      case 'switch':
        h += '<button class="primary" data-act="toggleSwitch">' + (c.params.closed ? '断开开关' : '闭合开关') + '</button>';
        break;
      case 'rheostat':
        h += '<div class="lab">最大阻值</div><div class="chips">' + [10, 20, 50].map(function (v) { return chip('Rmax', v, v + ' Ω'); }).join('') + '</div>' +
          '<div class="lab">接入 ' + R.fmtNum(c.params.frac * c.params.Rmax) + ' Ω（' + Math.round(c.params.frac * 100) + '%）</div>' +
          '<div class="chips">' + chip('fracDown', 0, '减小') + chip('fracUp', 0, '增大') + '</div>' +
          '<p class="hint">也可以在台面上直接拖蓝点。</p>';
        break;
      case 'ammeter':
        h += '<p class="hint">量程 3 A · 内阻 ' + (A.realMeters ? '0.1 Ω（真实表）' : '0 Ω（理想表）') + '</p>';
        break;
      case 'voltmeter':
        h += '<p class="hint">量程 15 V · 内阻 ' + (A.realMeters ? '3 kΩ（真实表）' : '∞（理想表）') + '</p>';
        break;
      default: break;
    }
    h += '<button class="del" data-act="delComp">删除这个元件（Del）</button>';
    box.innerHTML = h;
  }

  function bump(v, d, min, max) { return Math.min(max, Math.max(min, v + d)); }
  function onPropsClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act, arg = parseFloat(b.dataset.arg);
    var c = A.sel && A.circuit.byId(A.sel.id);
    if (act === 'delWire') { A.circuit.removeWire(A.sel.id); A.sel = null; solveAndDraw(); return; }
    if (act === 'delComp' && c) { removeComp(c.id); return; }
    if (!c) return;
    switch (act) {
      case 'E': c.params.E = arg; break;
      case 'Eplus': c.params.E = bump(c.params.E, 0.5, 0.5, 24); break;
      case 'Eminus': c.params.E = bump(c.params.E, -0.5, 0.5, 24); break;
      case 'r': c.params.r = arg; break;
      case 'R': c.params.R = arg; break;
      case 'Rplus': c.params.R = bump(c.params.R, 100, 0.1, 99999); break;
      case 'Rminus': c.params.R = bump(c.params.R, -100, 0.1, 99999); break;
      case 'Rplus1': c.params.R = bump(c.params.R, 1, 0.1, 9999); break;
      case 'Rminus1': c.params.R = bump(c.params.R, -1, 0.1, 9999); break;
      case 'Rmax': c.params.Rmax = arg; break;
      case 'fracDown': c.params.frac = bump(c.params.frac, -0.05, 0, 1); break;
      case 'fracUp': c.params.frac = bump(c.params.frac, 0.05, 0, 1); break;
      case 'toggleSwitch': c.params.closed = !c.params.closed; emitLab('switch', { closed: c.params.closed }); break;
      case 'newbulb': c.burnt = false; delete A.prevBurnt[c.id]; break;
      default: break;
    }
    solveAndDraw();
  }

  /* ---------- 数据记录 + U-I 图 ---------- */
  function firstOf(type) { return A.circuit.comps.filter(function (c) { return c.type === type; })[0]; }
  function doRecord() {
    var v = firstOf('voltmeter'), am = firstOf('ammeter');
    if (!v || !am) { toast('先在电路里放一只电压表和一只电流表。'); return; }
    if (!A.sol || !A.sol.ok) { toast('电路还没解出来。'); return; }
    var U = A.sol.comps[v.id].display, I = A.sol.comps[am.id].display;
    A.record.push({ U: U, I: I });
    renderData();
    emitLab('record', { U: U, I: I });
  }
  function snapshot() {
    var out = { ok: !!(A.sol && A.sol.ok), preset: A.presetId || '', battery: null, amp: null, volt: null, bulbs: [] };
    if (!out.ok) return out;
    function o(id) { return A.sol.comps[id]; }
    var b = firstOf('battery');
    if (b) { var ob = o(b.id); out.battery = { I: Math.abs(ob.I), U: Math.abs(ob.U), P: ob.P }; }
    var am = firstOf('ammeter');
    if (am) { var oa = o(am.id); out.amp = { display: oa.display, over: !!oa.flags.over }; }
    var v = firstOf('voltmeter');
    if (v) { var ov = o(v.id); out.volt = { display: ov.display, over: !!ov.flags.over }; }
    A.circuit.comps.forEach(function (c) {
      if (c.type !== 'bulb') return;
      var c2 = o(c.id);
      out.bulbs.push({ burnt: !!c.burnt, lit: !c.burnt && Math.abs(c2.I) > 1e-4, I: Math.abs(c2.I), U: Math.abs(c2.U), P: c2.P });
    });
    return out;
  }
  function fit(pts) {
    var n = pts.length; if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.I; sy += p.U; sxx += p.I * p.I; sxy += p.I * p.U; });
    var det = n * sxx - sx * sx; if (Math.abs(det) < 1e-12) return null;
    var slope = (n * sxy - sx * sy) / det, b = (sy - slope * sx) / n;
    return { E: b, r: -slope };
  }
  function renderData() {
    var v = firstOf('voltmeter'), am = firstOf('ammeter');
    $('#btnRecord').disabled = !(v && am);
    var tb = $('#recTable');
    if (!A.record.length) { tb.innerHTML = '<p class="hint">还没有数据。拖动滑变改变电流，每变一次点一下「记录」。</p>'; }
    else {
      var rows = A.record.map(function (p, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + p.U.toFixed(3) + '</td><td>' + p.I.toFixed(3) +
          '</td><td>' + (p.I > 1e-9 ? (p.U / p.I).toFixed(1) : '—') + '</td></tr>';
      }).reverse().slice(0, 6).join('');
      tb.innerHTML = '<table><tr><th>#</th><th>U/V</th><th>I/A</th><th>U/I</th></tr>' + rows + '</table>';
    }
    renderPlot();
  }
  function renderPlot() {
    var svgP = $('#plotSvg'), W = 320, H = 210, ml = 46, mb = 34, mt = 14, mr = 14;
    svgP.innerHTML = '';
    function el(tag, attrs, parent) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svgP).appendChild(e); return e; }
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff', rx: 10, stroke: '#E3DFD6', 'stroke-width': 2 });
    var pts = A.record;
    var xs = pts.map(function (p) { return p.I; }), ys = pts.map(function (p) { return p.U; });
    var xMax = Math.max(0.02, Math.max.apply(null, xs) * 1.15);
    var yMax = Math.max(0.2, Math.max.apply(null, ys) * 1.15);
    var X = function (v) { return ml + (W - ml - mr) * v / xMax; };
    var Y = function (v) { return H - mb - (H - mt - mb) * v / yMax; };
    el('line', { x1: ml, y1: mt, x2: ml, y2: H - mb, stroke: '#23272E', 'stroke-width': 2 });
    el('line', { x1: ml, y1: H - mb, x2: W - mr, y2: H - mb, stroke: '#23272E', 'stroke-width': 2 });
    el('text', { x: ml - 8, y: mt + 12, 'text-anchor': 'end', 'font-size': 14, fill: '#5A5F66' }).textContent = 'U';
    el('text', { x: W - mr, y: H - mb + 22, 'text-anchor': 'end', 'font-size': 14, fill: '#5A5F66' }).textContent = 'I';
    el('text', { x: 6, y: mt + 12, 'font-size': 13, fill: '#5A5F66' }).textContent = yMax.toFixed(2) + 'V';
    el('text', { x: W - mr - 34, y: H - 8, 'font-size': 13, fill: '#5A5F66' }).textContent = xMax.toFixed(2) + 'A';
    var f = fit(pts);
    if (f && pts.length >= 2) {
      el('line', { x1: X(0), y1: Y(f.E), x2: X(xMax), y2: Y(Math.max(0, f.E - f.r * xMax)),
        stroke: '#E8590C', 'stroke-width': 2.5, 'stroke-dasharray': '8 6', opacity: 0.85 });
      el('text', { x: ml + 8, y: H - mb - 30, 'font-size': 13.5, fill: '#E8590C' }).textContent =
        '截距 ≈ ' + f.E.toFixed(2) + ' V';
      el('text', { x: ml + 8, y: H - mb - 12, 'font-size': 13.5, fill: '#E8590C' }).textContent =
        '|斜率| ≈ ' + Math.abs(f.r).toFixed(2) + ' Ω';
    }
    pts.forEach(function (p, i) {
      el('circle', { cx: X(p.I), cy: Y(p.U), r: 5, fill: '#1F5BD8', stroke: '#fff', 'stroke-width': 1.5 });
      el('text', { x: X(p.I) + 8, y: Y(p.U) - 6, 'font-size': 12, fill: '#5A5F66' }).textContent = (i + 1);
    });
  }

  /* ---------- 指针交互 ---------- */
  svg.addEventListener('pointermove', function (ev) {
    var pt = worldPt(ev); A.cursor = pt;
    if (A.dragging) {
      var c = A.circuit.byId(A.dragging.id);
      if (c) { c.x = pt.x - A.dragging.ox; c.y = pt.y - A.dragging.oy; A.dragging.moved = true; drawOnly(); }
      return;
    }
    if (A.knobDrag) {
      var rc = A.circuit.byId(A.knobDrag);
      if (rc) {
        var hw = MODEL.DEFS.rheostat.w / 2;
        rc.params.frac = Math.min(1, Math.max(0, (pt.x - (rc.x - hw + 18)) / (MODEL.DEFS.rheostat.w - 36)));
        solveAndDraw();
      }
      return;
    }
    var ht = R.hitTerminal(A.circuit, pt);
    var changed = (!!ht !== !!A.hoverTerm) || (ht && A.hoverTerm && (ht.c !== A.hoverTerm.c || ht.t !== A.hoverTerm.t));
    A.hoverTerm = ht;
    if (A.placing) { A.placing.x = snap(pt.x); A.placing.y = snap(pt.y); drawOnly(); return; }
    if (A.wiring || changed) drawOnly();
  });

  svg.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    var pt = worldPt(ev);
    if (A.placing) {
      var nx = Math.min(1150, Math.max(90, snap(pt.x))), ny = Math.min(690, Math.max(70, snap(pt.y)));
      var cNew = A.circuit.add(A.placing.type, nx, ny);
      A.sel = { kind: 'comp', id: cNew.id };
      A.placing = null; setPalette(null);
      solveAndDraw();
      return;
    }
    var hit = ev.target.closest('[data-kind]');
    var kind = hit && hit.dataset.kind;
    if (kind === 'term') {
      var cid = +hit.dataset.c, tid = +hit.dataset.t;
      if (A.wiring && A.wiring.c === cid && A.wiring.t === tid) { A.wiring = null; drawOnly(); return; }
      if (!A.wiring) { A.wiring = { c: cid, t: tid }; }
      else {
        var w = A.circuit.connect(A.wiring.c, A.wiring.t, cid, tid);
        A.wiring = null;
        if (w) { A.sel = null; solveAndDraw(); return; }
      }
      drawOnly(); return;
    }
    if (kind === 'rheo-knob' || kind === 'rheo-fill') { A.knobDrag = +hit.dataset.id; return; }
    if (kind === 'wire-del') { A.circuit.removeWire(+hit.dataset.id); A.sel = null; solveAndDraw(); return; }
    if (kind === 'wire') { A.sel = { kind: 'wire', id: +hit.dataset.id }; A.wiring = null; drawOnly(); renderProps(); return; }
    if (kind === 'comp') {
      var c = A.circuit.byId(+hit.dataset.id);
      A.sel = { kind: 'comp', id: c.id };
      A.wiring = null;
      A.dragging = { id: c.id, ox: pt.x - c.x, oy: pt.y - c.y, moved: false };
      renderProps(); drawOnly(); return;
    }
    A.sel = null; A.wiring = null; drawOnly(); renderProps();
  });

  svg.addEventListener('pointerup', function () {
    if (A.dragging) {
      var c = A.circuit.byId(A.dragging.id);
      var moved = A.dragging.moved;
      A.dragging = null;
      if (c) {
        if (moved) {
          c.x = Math.min(1150, Math.max(90, snap(c.x)));
          c.y = Math.min(690, Math.max(70, snap(c.y)));
          solveAndDraw(); return;
        }
        if (c.type === 'switch') { c.params.closed = !c.params.closed; emitLab('switch', { closed: c.params.closed }); solveAndDraw(); return; }
        if (c.type === 'bulb' && c.burnt) { toast('这只灯泡烧断了，右侧属性里点「换一只新灯泡」。'); }
      }
      drawOnly(); return;
    }
    A.knobDrag = null;
  });
  svg.addEventListener('pointerleave', function () { A.hoverTerm = null; if (!A.dragging && !A.knobDrag) drawOnly(); });

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var k = e.key;
    if (k === 'Delete' || k === 'Backspace') {
      if (A.sel) {
        if (A.sel.kind === 'comp') { removeComp(A.sel.id); }
        else { A.circuit.removeWire(A.sel.id); A.sel = null; solveAndDraw(); }
      }
      e.preventDefault();
    } else if (k === 'Escape') {
      A.placing = null; A.wiring = null; A.sel = null; setPalette(null); solveAndDraw();
    } else if (k === 's' || k === 'S') { toggleSafety(); }
    else if (k === 'f' || k === 'F') { toggleFull(); }
    else if (k === 'r' || k === 'R') { loadPreset(A.presetId); toast('已复位到预置原样。'); }
    else if (k >= '1' && k <= '7') {
      var types = ['battery', 'resistor', 'bulb', 'switch', 'rheostat', 'ammeter', 'voltmeter'];
      setPlacing(types[+k - 1]);
    }
  });

  /* ---------- 顶栏 / 工具 ---------- */
  function setPalette(type) {
    document.querySelectorAll('.pal button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.type === type);
    });
  }
  function setPlacing(type) {
    if (A.placing && A.placing.type === type) { A.placing = null; setPalette(null); drawOnly(); return; }
    A.placing = { type: type, x: A.cursor.x, y: A.cursor.y };
    A.wiring = null;
    setPalette(type);
    drawOnly();
    toast('在台面上点一下放置：' + NAME[type]);
  }
  function toggleSafety() {
    A.safety = !A.safety;
    document.body.classList.toggle('safety', A.safety);
    $('#btnSafety').classList.toggle('on', A.safety);
    lsSet('cl.safety', A.safety ? '1' : '0');
    drawOnly();
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  }

  document.querySelectorAll('.pal button').forEach(function (b) {
    b.addEventListener('click', function () { setPlacing(b.dataset.type); });
  });
  $('#props').addEventListener('click', onPropsClick);
  $('#btnRecord').addEventListener('click', doRecord);
  $('#btnClearData').addEventListener('click', function () { A.record = []; renderData(); });
  $('#presetSel').addEventListener('change', function () { loadPreset(this.value); });
  $('#btnSafety').addEventListener('click', toggleSafety);
  $('#btnFull').addEventListener('click', toggleFull);
  $('#btnClear').addEventListener('click', function () { loadPreset('blank'); });
  $('#btnMode').addEventListener('click', function () {
    A.realMeters = !A.realMeters;
    this.textContent = '表内阻：' + (A.realMeters ? '真实' : '理想');
    this.classList.toggle('on', !A.realMeters);
    solveAndDraw();
    toast(A.realMeters ? '现在是真实表：电流表 0.1 Ω，电压表 3 kΩ。' : '现在是理想表：电流表 0 Ω、电压表不取电流。');
  });

  /* ---------- 启动 ---------- */
  var sel = $('#presetSel');
  PRESETS.forEach(function (p) {
    var op = document.createElement('option');
    op.value = p.id; op.textContent = p.name;
    sel.appendChild(op);
  });
  if (lsGet('cl.safety') === '1') toggleSafety();
  loadPreset('series');
  window.__cl = { A: A, loadPreset: loadPreset, solveAndDraw: solveAndDraw, MODEL: MODEL, snapshot: snapshot, toast: toast };
})();
