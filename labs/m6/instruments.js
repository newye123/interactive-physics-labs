/* M6 读数训练器 · 仪器模型：出题、几何、绘图、自检
 * 数值约定：游标卡尺 v01 = 百分之几毫米的整数（23.70mm → 2370）
 *           螺旋测微器 vUm = 微米的整数（6.725mm → 6725）
 * 坐标约定：卡尺 16 单位/毫米；千分尺长度轴 24 单位/毫米，鼓轮 1 格(0.01mm) = 18 单位 */
var __root = (typeof window !== 'undefined') ? window : globalThis;
__root.Inst = (function () {
  'use strict';

  var PREC01 = { 10: 10, 20: 5, 50: 2 };      // 分度 → 精度（0.01mm 单位）
  var CAL_U = 16, MIC_P = 24, MIC_EDGE0 = 620, MIC_TS = 18;
  var NS = 'http://www.w3.org/2000/svg';

  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- 数值与文案 ---------- */
  function fmtCal(v01, div) {
    return (div === 10 ? (v01 / 100).toFixed(1) : (v01 / 100).toFixed(2)) + ' mm';
  }
  function fmtMic(vUm) { return (vUm / 1000).toFixed(3) + ' mm'; }

  function calPart(v01, div) { // → {m, n}
    var prec01 = PREC01[div], m = Math.floor(v01 / 100), n = (v01 - m * 100) / prec01;
    return { m: m, n: n, prec01: prec01 };
  }
  function micPart(vUm) {
    var m = Math.floor(vUm / 1000), h = Math.floor((vUm % 1000) / 500), k = Math.floor(((vUm % 500)) / 10), est = vUm % 10;
    return { m: m, h: h, k: k, est: est }; // est ∈ {0,5}
  }

  function calExpl(it) {
    return '主尺 ' + it.m + ' mm ＋ 游标第 ' + it.n + ' 条线对齐 × ' +
      (it.prec01 / 100) + ' mm ＝ ' + fmtCal(it.v01, it.div);
  }
  function micExpl(it) {
    var t = (it.vUm % 500) / 10;
    var fixed = (it.vUm - it.vUm % 500) / 1000;
    var estTxt = (it.est === 5)
      ? '（在 ' + Math.floor(t) + ' 与 ' + (Math.floor(t) + 1) + ' 之间，估读 ' + t + '）'
      : '（第 ' + t + ' 条线正好对齐）';
    return '固定刻度 ' + fixed + ' mm' + (it.h ? '（半刻度线已露出）' : '') +
      ' ＋ 可动刻度 ' + t + ' × 0.01 mm ＝ ' + fmtMic(it.vUm) + estTxt;
  }

  /* ---------- 生成 ---------- */
  function newCaliper(div, v01) {
    div = div || pick([10, 20, 50]);
    var prec01 = PREC01[div], m, n;
    if (v01 == null) {
      if (div === 10) { m = rnd(2, 45); n = rnd(1, 9); }
      else if (div === 20) { m = rnd(2, 35); n = rnd(1, 19); }
      else { m = rnd(2, 10); n = rnd(1, 49); }
      v01 = m * 100 + n * prec01;
    }
    var p = calPart(v01, div);
    return { kind: 'caliper', div: div, v01: v01, m: p.m, n: p.n, prec01: prec01,
             fmt: fmtCal(v01, div) };
  }
  function newMic(vUm) {
    if (vUm == null) {
      var m = rnd(3, 9), h = rnd(0, 1), k = rnd(4, 46), est = pick([0, 5]);
      vUm = m * 1000 + h * 500 + k * 10 + est;
    }
    var p = micPart(vUm);
    return { kind: 'micrometer', vUm: vUm, m: p.m, h: p.h, k: p.k, est: p.est,
             fmt: fmtMic(vUm) };
  }

  /* ---------- 选项（读数题） ---------- */
  function uniqPush(pool, seen, v01, div) {
    if (v01 <= 0 || seen[v01]) return false;
    seen[v01] = 1; pool.push({ v01: v01, text: fmtCal(v01, div) }); return true;
  }
  function calOptions(it) {
    var pool = [], seen = {}, prec01 = it.prec01;
    uniqPush(pool, seen, it.v01 - prec01, it.div);
    uniqPush(pool, seen, it.v01 + prec01, it.div);
    uniqPush(pool, seen, it.m * 100, it.div);          // 忘加游标
    uniqPush(pool, seen, it.v01 - 100, it.div);        // 主尺差 1mm
    uniqPush(pool, seen, it.v01 + 100, it.div);
    uniqPush(pool, seen, it.v01 - 50, it.div);
    shuffle(pool);
    var ds = pool.slice(0, 2);
    var opts = [{ text: it.fmt, correct: true }]
      .concat(ds.map(function (d) { return { text: d.text, correct: false }; }));
    return shuffle(opts);
  }
  function micOptions(it) {
    var pool = [], seen = {}, v = it.vUm;
    function push(x) { if (x > 0 && !seen[x]) { seen[x] = 1; pool.push({ vUm: x, text: fmtMic(x) }); } }
    push(v - 500); push(v + 500);                       // 半刻度
    push(v - 10); push(v + 10);                         // 差一格
    if (it.est === 5) push(v - 5); else push(v + 5);    // 估读
    push(v - 1000); push(v + 1000);                     // 整毫米
    shuffle(pool);
    var opts = [{ text: it.fmt, correct: true }]
      .concat(pool.slice(0, 2).map(function (d) { return { text: d.text, correct: false }; }));
    return shuffle(opts);
  }

  /* ---------- 找茬题 ---------- */
  var CAL_BUGS = {
    wrongLine: '游标尺上对齐的线数错了一条',
    mainMiss: '主尺的整毫米数读错了一位（差约 1 mm）',
    forgotVernier: '只读了主尺，忘了加游标尺的读数'
  };
  var MIC_BUGS = {
    missHalf: '漏看了半刻度线（没加上 0.5 mm）',
    noEst: '最后一位没有估读（少了 0.005 mm）',
    overEst: '把整数格错读成了半格（多了 0.005 mm）',
    offTick: '可动刻度（鼓轮）的格数数错了一格',
    mainMiss: '固定刻度的整毫米数读错了（差约 1 mm）'
  };
  function bugQuestion(inst) {
    if (inst === 'caliper') {
      var div = pick([10, 20, 50]), it = newCaliper(div), cands = [];
      var signW = (it.n === 1) ? 1 : (it.n >= div - 1 ? -1 : pick([-1, 1]));
      cands.push({ id: 'wrongLine', impl: it.v01 + signW * it.prec01 });
      var signM = pick([-1, 1]);
      cands.push({ id: 'mainMiss', impl: it.v01 + signM * 100 });
      cands.push({ id: 'forgotVernier', impl: it.m * 100 });
      cands = cands.filter(function (c) { return c.impl > 0 && c.impl !== it.v01; });
      var bug = pick(cands);
      var others = shuffle(cands.filter(function (c) { return c.id !== bug.id && c.impl !== bug.impl; }));
      var opts = shuffle([{ text: CAL_BUGS[bug.id], correct: true },
        { text: CAL_BUGS[others[0].id], correct: false },
        { text: CAL_BUGS[others[1].id], correct: false }]);
      return { kind: 'caliper', item: it, claim: fmtCal(bug.impl, div), bugId: bug.id,
        expl: '正确读数：' + it.fmt + '（' + calExpl(it) + '）。这位同学的问题是：' + CAL_BUGS[bug.id] + '。',
        options: opts, tag: '' };
    } else {
      var it2 = newMic(), cands2 = [];
      var offSign = pick([-1, 1]);
      cands2.push({ id: 'offTick', impl: it2.vUm + offSign * 10 });
      if (it2.h === 1) cands2.push({ id: 'missHalf', impl: it2.vUm - 500 });
      if (it2.est === 5) cands2.push({ id: 'noEst', impl: it2.vUm - 5 });
      else cands2.push({ id: 'overEst', impl: it2.vUm + 5 });
      cands2.push({ id: 'mainMiss', impl: it2.vUm + pick([-1000, 1000]) });
      cands2 = cands2.filter(function (c) { return c.impl > 0 && c.impl !== it2.vUm; });
      var bug2 = pick(cands2);
      var others2 = shuffle(cands2.filter(function (c) { return c.id !== bug2.id && c.impl !== bug2.impl; }));
      var opts2 = shuffle([{ text: MIC_BUGS[bug2.id], correct: true },
        { text: MIC_BUGS[others2[0].id], correct: false },
        { text: MIC_BUGS[others2[1].id], correct: false }]);
      return { kind: 'micrometer', item: it2, claim: fmtMic(bug2.impl), bugId: bug2.id,
        expl: '正确读数：' + it2.fmt + '（' + micExpl(it2) + '）。这位同学的问题是：' + MIC_BUGS[bug2.id] + '。',
        options: opts2, tag: '' };
    }
  }

  /* ---------- 绘图工具 ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function line(p, x1, y1, x2, y2, w, color) {
    return el('line', { x1: x1, y1: y1, x2: x2, y2: y2, 'stroke-width': w,
      stroke: color || '#23272E', 'stroke-linecap': 'butt' }, p);
  }
  function text(p, x, y, s, size, color, anchor) {
    var t = el('text', { x: x, y: y, 'font-size': size, fill: color || '#23272E',
      'text-anchor': anchor || 'middle', 'font-family': 'Consolas, "Microsoft YaHei UI", monospace' }, p);
    t.textContent = s; return t;
  }
  var C = { ink: '#23272E', metal: '#E9E5DD', metal2: '#CFC7B8', edge: '#4A4741',
    blue: '#1F5BD8', green: '#2F9E44', red: '#C92A2A' };

  /* ---------- 卡尺 ---------- */
  function drawCal(svg, it, opts) {
    opts = opts || {};
    svg.innerHTML = '';
    svg.setAttribute('viewBox', opts.viewBox || '-26 20 1084 195');
    var g = el('g', {}, svg), U = CAL_U;
    el('rect', { x: -20, y: 40, width: 1010, height: 64, rx: 8,
      fill: C.metal, stroke: C.edge, 'stroke-width': 2 }, g);
    for (var mm = 0; mm <= 62; mm++) {
      var x = mm * U, len = mm % 10 === 0 ? 30 : (mm % 5 === 0 ? 22 : 14);
      line(g, x, 52, x, 52 + len, mm % 10 === 0 ? 2.2 : 1.4, C.ink);
      if (mm % 10 === 0) text(g, x, 95, mm, 20, C.ink);
    }
    var xV = it.v01 / 100 * U;
    var span = (it.div - 1) * (1 - it.prec01 / 100) * U + 60;
    el('rect', { x: xV - 30, y: 110, width: span, height: 64, rx: 8,
      fill: C.metal2, stroke: C.edge, 'stroke-width': 2 }, g);
    var step = it.div / 10;
    for (var i = 0; i <= it.div; i++) {
      var xi = xV + i * (1 - it.prec01 / 100) * U, labeled = i % step === 0;
      line(g, xi, 110, xi, 110 + (labeled ? 30 : 22), labeled ? 2.2 : 1.4, C.ink);
      if (labeled) text(g, xi, 158, i / step, it.div === 10 ? 15 : 18, C.ink);
    }
    if (opts.highlight) {
      var xAl = (it.m + it.n) * U;               // 对齐线（=整数毫米刻度）
      line(g, xAl, 34, xAl, 186, 3, C.green).setAttribute('stroke-dasharray', '9 5');
      line(g, xV, 102, xV, 186, 3, C.blue);
      line(g, xV, 110, xV, 140, 4, C.blue);
      line(g, xAl, 110, xAl, 140, 4, C.green);
      line(g, xAl, 52, xAl, 82, 4, C.green);
    }
  }
  function calLoupeView(it) {
    var cx = (it.m + it.n) * CAL_U;
    return (cx - 80) + ' 36 160 150';
  }

  /* ---------- 千分尺 ---------- */
  function drawMic(svg, it, opts) {
    opts = opts || {};
    svg.innerHTML = '';
    svg.setAttribute('viewBox', opts.viewBox || '20 76 1180 208');
    var g = el('g', {}, svg), r = it.vUm / 1000;
    var xs = 130 + r * MIC_P, edge = MIC_EDGE0 + r * MIC_P;
    el('rect', { x: 52, y: 96, width: 66, height: 166, rx: 12, fill: C.metal,
      stroke: C.edge, 'stroke-width': 2 }, g);
    el('rect', { x: 104, y: 118, width: 26, height: 126, rx: 3, fill: C.metal2,
      stroke: C.edge, 'stroke-width': 1.5 }, g);
    el('rect', { x: xs, y: 168, width: 760 - xs, height: 28, rx: 3,
      fill: C.metal, stroke: C.edge, 'stroke-width': 1.5 }, g);
    el('rect', { x: 520, y: 150, width: 385, height: 60, rx: 6, fill: C.metal,
      stroke: C.edge, 'stroke-width': 2 }, g);
    line(g, 540, 180, edge + 16, 180, 2.4, C.ink);
    for (var m2 = 0; m2 <= 24; m2++) {
      var pos = MIC_EDGE0 + m2 * 12;
      if (pos > edge + 2) break;
      if (m2 % 2 === 0) { line(g, pos, 164, pos, 180, 2, C.ink); text(g, pos, 156, m2 / 2, 16, C.ink); }
      else line(g, pos, 180, pos, 192, 1.4, C.ink);
    }
    el('rect', { x: edge, y: 118, width: 280, height: 124, rx: 14, fill: C.metal2,
      stroke: C.edge, 'stroke-width': 2 }, g);
    var t = (it.vUm % 500) / 10;
    for (var k = 0; k < 50; k++) {
      var dlt = ((k - t + 25) % 50 + 50) % 50 - 25, xk = edge + 16 + dlt * MIC_TS;
      if (xk < edge + 4 || xk > edge + 270) continue;
      line(g, xk, 134, xk, 174, 1.6, C.ink);
      if (k % 5 === 0) text(g, xk, 126, k, 15, C.ink);
    }
    if (opts.highlight) {
      var mh = Math.floor(it.vUm / 500);
      line(g, MIC_EDGE0 + mh * 12, 160, MIC_EDGE0 + mh * 12, 196, 3.5, C.green);
      if (t % 1 === 0) line(g, edge + 16, 128, edge + 16, 178, 3.5, C.green);
      else {
        el('rect', { x: edge + 7, y: 128, width: 18, height: 50, fill: C.green, opacity: 0.18 }, g);
        [Math.floor(t), Math.ceil(t)].forEach(function (kk) {
          line(g, edge + 16 + (kk - t) * MIC_TS, 130, edge + 16 + (kk - t) * MIC_TS, 176, 3, C.green);
        });
      }
      line(g, edge + 16, 108, edge + 16, 250, 3, C.green).setAttribute('stroke-dasharray', '9 5');
    }
  }
  function micLoupeView(it) {
    var edge = MIC_EDGE0 + it.vUm / 1000 * MIC_P;
    return (edge - 60) + ' 108 180 150';
  }

  /* ---------- 自检（几何与读数自洽性） ---------- */
  function selfTest(n) {
    n = n || 300; var fails = [];
    [10, 20, 50].forEach(function (div) {
      for (var i = 0; i < n; i++) {
        var it = newCaliper(div);
        var sum = it.v01 + it.n * (100 - it.prec01);
        if (sum % 100 !== 0) fails.push('cal ' + div + ' ' + it.v01);
        if (it.n < 1 || it.n > div - 1) fails.push('cal n ' + it.n);
        if (it.m * 100 + it.n * it.prec01 !== it.v01) fails.push('cal compose ' + it.v01);
      }
    });
    for (var j = 0; j < n; j++) {
      var m = newMic();
      var exposed = Math.floor(m.vUm / 500) * 500;
      var t = (m.vUm % 500) / 10;
      var t2 = (m.vUm - exposed) / 10;
      if (Math.abs(t - t2) > 1e-9) fails.push('mic phase ' + m.vUm);
      var reread = exposed / 1000 + t * 0.01;
      if (Math.abs(reread - m.vUm / 1000) > 1e-9) fails.push('mic reread ' + m.vUm);
      if (m.est !== 0 && m.est !== 5) fails.push('mic est ' + m.vUm);
    }
    return { ok: fails.length === 0, fails: fails.slice(0, 10), count: n };
  }

  var Inst = {
    PREC01: PREC01, CAL_U: CAL_U, MIC_P: MIC_P, MIC_EDGE0: MIC_EDGE0,
    newCaliper: newCaliper, newMic: newMic,
    calOptions: calOptions, micOptions: micOptions, bugQuestion: bugQuestion,
    calExpl: calExpl, micExpl: micExpl, fmtCal: fmtCal, fmtMic: fmtMic,
    drawCal: drawCal, drawMic: drawMic,
    calLoupeView: calLoupeView, micLoupeView: micLoupeView,
    selfTest: selfTest,
    presets: [{ kind: 'caliper', div: 10, v01: 2370, tag: '教材图 11.3-3 例' },
              { kind: 'micrometer', vUm: 6725, tag: '教材图 11.3-5 例' }]
  };
  return Inst;
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = __root.Inst; }
