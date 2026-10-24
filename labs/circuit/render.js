/* 电路实验室 · 渲染层：把 model 的电路画成 SVG（含读数、电流箭头、灯泡光晕）
 * 依赖：CircuitModel.DEFS / CircuitSolver 常数。全部世界坐标 1240×760，网格 20。 */
(function (root) {
  'use strict';
  var M = root.CircuitModel, S = root.CircuitSolver;
  var NS = 'http://www.w3.org/2000/svg';
  var TERM_R = 9, STUB = 26;

  var C = {
    ink: '#23272E', metal: '#E9E5DD', metal2: '#CFC7B8', edge: '#4A4741',
    blue: '#1F5BD8', blueSoft: '#E3EAFB', orange: '#E8590C', green: '#2F9E44',
    red: '#E03131', paper: '#FFFFFF', line: '#E3DFD6', ink2: '#5A5F66'
  };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmtNum(x) {
    var a = Math.abs(x), d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return x.toFixed(d);
  }
  function fmt(x, unit) { return fmtNum(x) + ' ' + unit; }

  /* 导线折线路径：A 端子 → 出线桩 → 折到 B 端子行 → B 端子
   * 若 B 端子那一行（长横段）中间有别的大元件挡着，则从下方绕行（教科书式回程线）。 */
  function routeBlocked(circuit, w, pa, sa, pb, sb) {
    var p1x = pa.x + sa * STUB, p2x = pb.x + sb * STUB;
    var x1 = Math.min(p1x, p2x) + 6, x2 = Math.max(p1x, p2x) - 6;
    for (var i = 0; i < circuit.comps.length; i++) {
      var c = circuit.comps[i];
      if (c.id === w.a.c || c.id === w.b.c) continue;
      var hw = M.DEFS[c.type].w / 2;
      if (Math.abs(c.y - pb.y) < 60 && c.x + hw > x1 && c.x - hw < x2) return true;
    }
    return false;
  }
  function busY(circuit) {
    var m = 0;
    for (var i = 0; i < circuit.comps.length; i++) {
      var c = circuit.comps[i];
      m = Math.max(m, c.y + M.DEFS[c.type].h / 2);
    }
    return m + 90;
  }
  function wireD(pa, sa, pb, sb, detourY) {
    var p1x = pa.x + sa * STUB, p2x = pb.x + sb * STUB;
    if (detourY != null) {
      var y2 = detourY;
      return 'M' + pa.x + ',' + pa.y + ' L' + p1x + ',' + pa.y +
             ' L' + p1x + ',' + y2 + ' L' + p2x + ',' + y2 + ' L' + p2x + ',' + pb.y +
             ' L' + pb.x + ',' + pb.y;
    }
    return 'M' + pa.x + ',' + pa.y + ' L' + p1x + ',' + pa.y +
           ' L' + p1x + ',' + pb.y + ' L' + p2x + ',' + pb.y + ' L' + pb.x + ',' + pb.y;
  }
  function wireMid(pa, sa, pb, detourY) {
    if (detourY != null) return { x: (pa.x + pb.x) / 2, y: detourY };
    return { x: pa.x + sa * STUB, y: (pa.y + pb.y) / 2 };
  }

  function defsInto(svg) {
    var defs = el('defs', {}, svg);
    var pat = el('pattern', { id: 'grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 1, cy: 1, r: 1.1, fill: '#DDD8CC' }, pat);
    var g = el('radialGradient', { id: 'bulbGlow' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#FFD43B', 'stop-opacity': 0.95 }, g);
    el('stop', { offset: '55%', 'stop-color': '#FFC300', 'stop-opacity': 0.35 }, g);
    el('stop', { offset: '100%', 'stop-color': '#FFC300', 'stop-opacity': 0 }, g);
  }

  function drawWire(g, circuit, w, ui) {
    var a = circuit.byId(w.a.c), b = circuit.byId(w.b.c);
    if (!a || !b) return;
    var pa = circuit.termPos(a, w.a.t), pb = circuit.termPos(b, w.b.t);
    var da = M.DEFS[a.type].terms[w.a.t].x < 0 ? -1 : 1;
    var db = M.DEFS[b.type].terms[w.b.t].x < 0 ? -1 : 1;
    var det = routeBlocked(circuit, w, pa, da, pb, db);
    var dy = det ? busY(circuit) : null;
    var d = wireD(pa, da, pb, db, dy);
    var sel = ui.sel && ui.sel.kind === 'wire' && ui.sel.id === w.id;
    el('path', { d: d, fill: 'none', stroke: 'transparent', 'stroke-width': 26, 'data-kind': 'wire', 'data-id': w.id }, g);
    el('path', { d: d, fill: 'none', stroke: sel ? C.blue : C.ink, 'stroke-width': sel ? 4.5 : 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    if (sel) {
      var mid = wireMid(pa, da, pb, dy);
      var bg = el('g', { 'data-kind': 'wire-del', 'data-id': w.id, style: 'cursor:pointer' }, g);
      el('circle', { cx: mid.x, cy: mid.y, r: 14, fill: C.red }, bg);
      el('text', { x: mid.x, y: mid.y + 6, 'text-anchor': 'middle', 'font-size': 18, fill: '#fff', 'font-weight': 'bold' }, bg).textContent = '✕';
    }
  }

  function terminal(g, x, y, ui, cid, ti, connected) {
    var hot = ui.hoverTerm && ui.hoverTerm.c === cid && ui.hoverTerm.t === ti;
    var wiring = ui.wiring && ((ui.wiring.c === cid && ui.wiring.t === ti));
    el('circle', { cx: x, cy: y, r: TERM_R + (hot || wiring ? 3 : 0), fill: wiring ? C.blue : '#fff',
      stroke: hot || wiring ? C.blue : C.edge, 'stroke-width': 2.4, 'data-kind': 'term', 'data-c': cid, 'data-t': ti, style: 'cursor:crosshair' }, g);
  }

  function flowArrows(g, x, y, dir, absI, safety) {
    /* 电流方向：橙色小箭头链；无电流时不画。dir 已是屏幕方向（+1 右 / −1 左） */
    if (absI < 1e-5) return;
    var n = 3, gap = 16;
    var start = x - (n - 1) * gap / 2;
    var d = '', i2;
    var arrows = el('g', { class: 'flowmark' + (safety ? '' : ' flow') }, g);
    for (i2 = 0; i2 < n; i2++) {
      var cx = start + i2 * gap;
      d += 'M' + (cx - 5 * dir) + ',' + (y - 6) + ' L' + (cx + 5 * dir) + ',' + y +
           ' L' + (cx - 5 * dir) + ',' + (y + 6) + ' ';
    }
    var p = el('path', { d: d, fill: 'none', stroke: C.orange, 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 }, arrows);
    var speed = Math.min(1.6, Math.max(0.3, 1.0 / (0.25 + absI * 2)));
    if (!safety) p.style.animationDuration = speed + 's';
  }

  function readout(g, x, y, text, opts) {
    opts = opts || {};
    var w = opts.w || 150, h = 44;
    el('rect', { x: x - w / 2, y: y, width: w, height: h, rx: 9,
      fill: opts.danger ? '#FBE4E4' : '#FFFFFF', stroke: opts.danger ? C.red : C.line, 'stroke-width': 2.5 }, g);
    el('text', { x: x, y: y + 30, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 'bold',
      fill: opts.danger ? C.red : C.ink, 'font-family': 'Consolas, monospace' }, g).textContent = text;
  }

  function drawComponent(g, circuit, c, sol, ui) {
    var def = M.DEFS[c.type], hw = def.w / 2, hh = def.h / 2;
    var comp = el('g', { 'data-kind': 'comp', 'data-id': c.id, style: 'cursor:move', transform: 'translate(' + c.x + ',' + c.y + ')' }, g);
    var o = (sol && sol.ok && sol.comps[c.id]) || null;
    /* 透明命中区：元件轮廓内点哪都能选中/拖动（视觉不可见） */
    el('rect', { x: -hw - 10, y: -hh - 40, width: def.w + 20, height: def.h + 80, fill: '#fff', 'fill-opacity': 0 }, comp);
    var body = el('g', {}, comp);
    var lens = [hh, -hh];

    switch (c.type) {
      case 'battery': {
        el('rect', { x: -hw, y: -hh, width: def.w, height: def.h, rx: 12, fill: C.metal, stroke: C.edge, 'stroke-width': 3 }, body);
        for (var pi = 0; pi < 2; pi++) {
          var px = -34 + pi * 34;
          el('line', { x1: px + 8, y1: -24, x2: px + 8, y2: 24, stroke: C.ink, 'stroke-width': 5 }, body);
          el('line', { x1: px - 8, y1: -13, x2: px - 8, y2: 13, stroke: C.ink, 'stroke-width': 5 }, body);
        }
        el('text', { x: 46, y: 10, 'font-size': 26, 'font-weight': 'bold', fill: C.ink }, body).textContent = '+';
        el('text', { x: -58, y: 10, 'font-size': 30, 'font-weight': 'bold', fill: C.ink }, body).textContent = '−';
        el('text', { x: 0, y: hh + 30, 'text-anchor': 'middle', 'font-size': 19, fill: C.ink2,
          'font-family': 'Consolas, monospace' }, body).textContent = c.params.E.toFixed(1) + ' V · r=' + c.params.r.toFixed(1) + ' Ω';
        break;
      }
      case 'resistor': {
        el('rect', { x: -hw, y: -hh, width: def.w, height: def.h, rx: 10, fill: '#fff', stroke: C.edge, 'stroke-width': 3 }, body);
        el('text', { x: 0, y: 9, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 'bold',
          'font-family': 'Consolas, monospace', fill: C.ink }, body).textContent = fmtNum(c.params.R) + ' Ω';
        break;
      }
      case 'bulb': {
        var br = c.burnt ? 0 : (o ? o.brightness : 0);
        if (br > 0.02) el('circle', { cx: 0, cy: 0, r: 86, fill: 'url(#bulbGlow)', opacity: Math.min(1, br * 1.15) }, body);
        el('circle', { cx: 0, cy: 0, r: 38, fill: c.burnt ? '#CFC7B8' : (br > 0.55 ? '#FFE066' : '#FFF9DB'), stroke: C.edge, 'stroke-width': 3.5 }, body);
        var fx = 14;
        el('line', { x1: -fx, y1: -fx, x2: fx, y2: fx, stroke: c.burnt ? '#8B8578' : C.needle || '#C92A2A', 'stroke-width': 3 }, body);
        el('line', { x1: -fx, y1: fx, x2: c.burnt ? -2 : fx, y2: c.burnt ? -2 : -fx, stroke: c.burnt ? '#8B8578' : '#C92A2A', 'stroke-width': 3 }, body);
        el('line', { x1: -hw, y1: 0, x2: -38, y2: 0, stroke: C.edge, 'stroke-width': 3.5 }, body);
        el('line', { x1: 38, y1: 0, x2: hw, y2: 0, stroke: C.edge, 'stroke-width': 3.5 }, body);
        if (c.burnt) el('text', { x: 0, y: hh + 26, 'text-anchor': 'middle', 'font-size': 19, fill: C.red }, body).textContent = '灯丝烧断了';
        break;
      }
      case 'switch': {
        el('circle', { cx: -34, cy: 4, r: 5.5, fill: C.ink }, body);
        el('circle', { cx: 34, cy: 4, r: 5.5, fill: C.ink }, body);
        el('line', { x1: -30, y1: 0, x2: -hw, y2: 0, stroke: C.edge, 'stroke-width': 3.5 }, body);
        el('line', { x1: 30, y1: 0, x2: hw, y2: 0, stroke: C.edge, 'stroke-width': 3.5 }, body);
        var lever = el('g', { class: 'switch-lever', 'transform': 'rotate(' + (c.params.closed ? 0 : -38) + ', -34, 4)' }, body);
        el('line', { x1: -34, y1: 4, x2: 34, y2: 4, stroke: c.params.closed ? C.blue : C.edge, 'stroke-width': 5, 'stroke-linecap': 'round' }, lever);
        el('text', { x: 0, y: hh + 28, 'text-anchor': 'middle', 'font-size': 18, fill: C.ink2 }, body).textContent = c.params.closed ? '已闭合（点我断开）' : '断开（点我闭合）';
        break;
      }
      case 'rheostat': {
        el('rect', { x: -hw, y: -hh + 26, width: def.w, height: 30, rx: 8, fill: '#fff', stroke: C.edge, 'stroke-width': 3 }, body);
        el('line', { x1: -hw, y1: -hh + 14, x2: hw, y2: -hh + 14, stroke: C.edge, 'stroke-width': 4 }, body);
        var kx = -hw + 18 + c.params.frac * (def.w - 36);
        el('rect', { x: -hw, y: -hh + 14, width: kx + hw - 4, height: 8, fill: C.blue, opacity: 0.85, 'data-kind': 'rheo-fill', 'data-id': c.id }, body);
        var knob = el('g', { 'data-kind': 'rheo-knob', 'data-id': c.id, style: 'cursor:ew-resize' }, body);
        el('circle', { cx: kx, cy: -hh + 14, r: 16, fill: C.blue, stroke: '#fff', 'stroke-width': 3 }, knob);
        el('text', { x: 0, y: hh + 26, 'text-anchor': 'middle', 'font-size': 19, 'font-family': 'Consolas, monospace', fill: C.ink2 }, body)
          .textContent = '接入 ' + fmtNum(c.params.frac * c.params.Rmax) + ' Ω / ' + fmtNum(c.params.Rmax) + ' Ω';
        break;
      }
      case 'ammeter':
      case 'voltmeter': {
        var isA = c.type === 'ammeter';
        el('circle', { cx: 0, cy: -6, r: 42, fill: '#fff', stroke: C.edge, 'stroke-width': 3.5 }, body);
        el('text', { x: 0, y: 10, 'text-anchor': 'middle', 'font-size': 44, 'font-weight': 'bold', fill: C.ink }, body).textContent = isA ? 'A' : 'V';
        var val = o ? (isA ? o.display : o.display) : 0;
        var danger = o && o.flags && o.flags.over;
        readout(body, 0, 44, danger ? '超量程!' : fmt(val, isA ? 'A' : 'V'), { danger: danger, w: isA ? 160 : 150 });
        break;
      }
      default: break;
    }

    /* 连接线桩 + 端子 */
    def.terms.forEach(function (t, ti) {
      var tx = t.x + (t.x < 0 ? -10 : 10);
      el('line', { x1: t.x, y1: 0, x2: tx, y2: 0, stroke: C.edge, 'stroke-width': 3 }, body);
    });
    /* 选中光环 */
    if (ui.sel && ui.sel.kind === 'comp' && ui.sel.id === c.id) {
      el('rect', { x: -hw - 12, y: -hh - 34, width: def.w + 24, height: def.h + 62, rx: 14,
        fill: 'none', stroke: C.blue, 'stroke-width': 3.5, 'stroke-dasharray': '10 7' }, body);
    }
    /* 电流箭头：端子 0 在右侧，故电阻类元件 I>0 表示电流朝屏幕左方；电池 I>0 表示流出 + 端子（朝右） */
    if (o && c.type !== 'voltmeter') {
      var dir = c.type === 'battery' ? (o.I > 0 ? 1 : -1) : (o.I > 0 ? -1 : 1);
      flowArrows(body, 0, -hh - (c.type === 'bulb' ? 62 : 30), dir, Math.abs(o.I), ui.safety);
    }
    if (o && c.type === 'voltmeter') {
      var dirV = o.I > 0 ? -1 : 1;
      flowArrows(body, 0, -hh - 22, dirV, Math.abs(o.I), ui.safety);
    }

    /* 端子放最上层 */
    def.terms.forEach(function (t, ti) { terminal(comp, t.x, t.y, ui, c.id, ti); });
  }

  function drawGhost(g, type, x, y) {
    var def = M.DEFS[type];
    var gg = el('g', { transform: 'translate(' + x + ',' + y + ')', opacity: 0.5 }, g);
    el('rect', { x: -def.w / 2, y: -def.h / 2, width: def.w, height: def.h, rx: 12,
      fill: C.blueSoft, stroke: C.blue, 'stroke-width': 3, 'stroke-dasharray': '10 8' }, gg);
    el('text', { x: 0, y: 8, 'text-anchor': 'middle', 'font-size': 22, fill: C.blue }, gg).textContent = '放在这里';
  }

  function drawWiringPreview(g, circuit, ui) {
    if (!ui.wiring) return;
    var c = circuit.byId(ui.wiring.c);
    if (!c) return;
    var pa = circuit.termPos(c, ui.wiring.t);
    var sa = M.DEFS[c.type].terms[ui.wiring.t].x < 0 ? -1 : 1;
    var cur = ui.cursor;
    var p1x = pa.x + sa * STUB;
    var d = 'M' + pa.x + ',' + pa.y + ' L' + p1x + ',' + pa.y + ' L' + p1x + ',' + cur.y + ' L' + cur.x + ',' + cur.y;
    el('path', { d: d, fill: 'none', stroke: C.blue, 'stroke-width': 3.5, 'stroke-dasharray': '9 7', 'stroke-linecap': 'round' }, g);
    el('circle', { cx: cur.x, cy: cur.y, r: 6, fill: C.blue }, g);
  }

  function draw(svg, circuit, sol, ui) {
    ui = ui || {};
    svg.innerHTML = '';
    defsInto(svg);
    var gGrid = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: 1240, height: 760, fill: '#FBFAF7' }, gGrid);
    el('rect', { x: 0, y: 0, width: 1240, height: 760, fill: 'url(#grid)' }, gGrid);
    var gWire = el('g', {}, svg), gComp = el('g', {}, svg);
    circuit.wires.forEach(function (w) { drawWire(gWire, circuit, w, ui); });
    drawWiringPreview(gWire, circuit, ui);
    circuit.comps.forEach(function (c) { drawComponent(gComp, circuit, c, sol, ui); });
    if (ui.placing) drawGhost(gComp, ui.placing.type, ui.placing.x, ui.placing.y);
  }

  function hitTerminal(circuit, pt) {
    for (var i = 0; i < circuit.comps.length; i++) {
      var c = circuit.comps[i], terms = M.DEFS[c.type].terms;
      for (var t = 0; t < terms.length; t++) {
        var p = circuit.termPos(c, t);
        if (Math.hypot(pt.x - p.x, pt.y - p.y) <= 20) return { c: c.id, t: t };
      }
    }
    return null;
  }
  function hitComp(circuit, pt) {
    for (var i = circuit.comps.length - 1; i >= 0; i--) {
      var c = circuit.comps[i], d = M.DEFS[c.type];
      if (Math.abs(pt.x - c.x) <= d.w / 2 + 10 && Math.abs(pt.y - c.y) <= d.h / 2 + 30) return c;
    }
    return null;
  }
  function hitWire(circuit, pt) {
    for (var i = circuit.wires.length - 1; i >= 0; i--) {
      var w = circuit.wires[i], a = circuit.byId(w.a.c), b = circuit.byId(w.b.c);
      if (!a || !b) continue;
      var pa = circuit.termPos(a, w.a.t), pb = circuit.termPos(b, w.b.t);
      var sa = M.DEFS[a.type].terms[w.a.t].x < 0 ? -1 : 1, sb = M.DEFS[b.type].terms[w.b.t].x < 0 ? -1 : 1;
      var p1 = { x: pa.x + sa * STUB, y: pa.y }, p2 = { x: pb.x + sb * STUB, y: pb.y };
      var segs;
      if (routeBlocked(circuit, w, pa, sa, pb, sb)) {
        var y2 = busY(circuit);
        segs = [[pa, p1], [p1, { x: p1.x, y: y2 }], [{ x: p1.x, y: y2 }, { x: p2.x, y: y2 }], [{ x: p2.x, y: y2 }, { x: p2.x, y: pb.y }], [{ x: p2.x, y: pb.y }, pb]];
      } else {
        segs = [[pa, p1], [p1, { x: p1.x, y: pb.y }], [{ x: p1.x, y: pb.y }, p2], [p2, pb]];
      }
      for (var s2 = 0; s2 < segs.length; s2++) {
        if (distToSeg(pt, segs[s2][0], segs[s2][1]) < 12) return w;
      }
    }
    return null;
  }
  function distToSeg(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    var len2 = vx * vx + vy * vy;
    var t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  }

  root.CircuitRender = { draw: draw, hitTerminal: hitTerminal, hitComp: hitComp, hitWire: hitWire, fmt: fmt, fmtNum: fmtNum, C: C };
})(typeof window !== 'undefined' ? window : globalThis);
