/* 电路实验室 · 电路模型：元件 / 导线 / 网表 → 求解器 → 各元件读数
 * 坐标：世界坐标 px，网格 20；元件横向摆放，两端子。
 * 读数约定：res 类元件 I = 电流从端子0流向端子1（负号表示反向）；
 *           电池 I = 输出电流（从 + 端子流出，正常放电为正）。 */
(function (root) {
  'use strict';
  var S = root.CircuitSolver || require('./solver.js');

  var DEFS = {
    battery:   { w: 150, h: 64, terms: [{ x: 70, y: 0, name: '+' }, { x: -70, y: 0, name: '−' }], params: { E: 4.5, r: 0.5 } },
    resistor:  { w: 132, h: 52, terms: [{ x: 62, y: 0 }, { x: -62, y: 0 }], params: { R: 10 } },
    bulb:      { w: 104, h: 84, terms: [{ x: 50, y: 0 }, { x: -50, y: 0 }], params: { R0: 8.3, Pnom: 0.75, Vnom: 2.5 } },
    switch:    { w: 132, h: 64, terms: [{ x: 60, y: 0 }, { x: -60, y: 0 }], params: { closed: false } },
    rheostat:  { w: 176, h: 64, terms: [{ x: 78, y: 0 }, { x: -78, y: 0 }], params: { Rmax: 20, frac: 1 } },
    ammeter:   { w: 112, h: 96, terms: [{ x: 52, y: 0 }, { x: -52, y: 0 }], params: {} },
    voltmeter: { w: 112, h: 96, terms: [{ x: 52, y: 0 }, { x: -52, y: 0 }], params: {} }
  };
  var METER_MAX = { ammeter: 3, voltmeter: 15 };

  function Circuit() { this.comps = []; this.wires = []; this._id = 1; }

  /* ---------- 增删改 ---------- */
  Circuit.prototype.add = function (type, x, y, params) {
    var def = DEFS[type];
    var c = { id: this._id++, type: type, x: x, y: y, params: {} };
    for (var k in def.params) c.params[k] = def.params[k];
    if (params) for (var k2 in params) c.params[k2] = params[k2];
    if (type === 'bulb') c.burnt = false;
    this.comps.push(c);
    return c;
  };
  Circuit.prototype.remove = function (id) {
    this.comps = this.comps.filter(function (c) { return c.id !== id; });
    this.wires = this.wires.filter(function (w) { return w.a.c !== id && w.b.c !== id; });
  };
  Circuit.prototype.byId = function (id) {
    for (var i = 0; i < this.comps.length; i++) if (this.comps[i].id === id) return this.comps[i];
    return null;
  };
  Circuit.prototype.termPos = function (c, ti) {
    var t = DEFS[c.type].terms[ti];
    return { x: c.x + t.x, y: c.y + t.y };
  };
  Circuit.prototype.connect = function (cA, tA, cB, tB) {
    if (cA === cB && tA === tB) return null;
    var w = { id: this._id++, a: { c: cA, t: tA }, b: { c: cB, t: tB } };
    this.wires.push(w);
    return w;
  };
  Circuit.prototype.removeWire = function (id) {
    this.wires = this.wires.filter(function (w) { return w.id !== id; });
  };
  Circuit.prototype.clear = function () { this.comps = []; this.wires = []; };

  /* ---------- 网表 ---------- */
  Circuit.prototype.solve = function (mode) {
    /* mode: { realMeters: true } —— 真实表内阻 或 理想表 */
    mode = mode || { realMeters: true };
    var self = this, i, k;
    /* 1. 并查集：端子 → 网络 */
    var parent = {};
    function key(c, t) { return c + ':' + t; }
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
    this.comps.forEach(function (c) {
      DEFS[c.type].terms.forEach(function (_, t) { parent[key(c.id, t)] = key(c.id, t); });
    });
    this.wires.forEach(function (w) { union(key(w.a.c, w.a.t), key(w.b.c, w.b.t)); });
    var netId = {}, nNets = 0;
    for (var kk in parent) { var r = find(kk); if (netId[r] == null) netId[r] = nNets++; }
    function netOf(c, t) { return netId[find(key(c, t))]; }

    /* 2. 地：第一只电池的 − 端子；没有电池就用第一个元件端子 */
    var batt = this.comps.filter(function (c) { return c.type === 'battery'; })[0];
    var gnd = null;
    if (batt) gnd = netOf(batt.id, 1);
    else if (this.comps.length) gnd = netOf(this.comps[0].id, 0);
    else return { ok: true, comps: {}, nNets: 0 };

    /* 3. 元件列表 */
    var els = [], ref = {};      // ref[cid] = {kind:'res'|'vsrc', idx, role}
    var nextPseudo = nNets;
    function pushRes(cid, role, a, b, R) { ref[cid + ':' + role] = els.length; els.push({ type: 'res', a: a, b: b, R: R }); }
    function pushV(cid, role, a, b, E) { ref[cid + ':' + role] = els.length; els.push({ type: 'vsrc', a: a, b: b, E: E }); }

    this.comps.forEach(function (c) {
      var n0 = netOf(c.id, 0), n1 = netOf(c.id, 1);
      switch (c.type) {
        case 'battery': {
          var X = nextPseudo++;
          pushV(c.id, 'src', X, n1, c.params.E);
          pushRes(c.id, 'r', X, n0, Math.max(c.params.r, 0.05));
          break;
        }
        case 'resistor': pushRes(c.id, 'main', n0, n1, Math.max(c.params.R, S.WIRE)); break;
        case 'bulb': pushRes(c.id, 'main', n0, n1, c.burnt ? S.OPEN : Math.max(c.params.R0, S.WIRE)); break;
        case 'switch': pushRes(c.id, 'main', n0, n1, c.params.closed ? S.WIRE : S.OPEN); break;
        case 'rheostat': pushRes(c.id, 'main', n0, n1, Math.max(c.params.frac * c.params.Rmax, S.WIRE)); break;
        case 'ammeter':
          if (mode.realMeters) pushRes(c.id, 'main', n0, n1, 0.1);
          else pushV(c.id, 'main', n0, n1, 0);
          break;
        case 'voltmeter':
          if (mode.realMeters) pushRes(c.id, 'main', n0, n1, 3000);
          break;                                  // 理想电压表：断路（只差分电位）
        default: break;
      }
    });

    /* 4. 求解 */
    var res = S.solve({ nets: nextPseudo, gnd: gnd, elements: els });
    if (!res.ok) return { ok: false, reason: res.reason };

    /* 5. 回读每个元件 */
    var out = { ok: true, comps: {}, nNets: nNets, gnd: gnd };
    var anyNewBurn = false;
    function R0(cid, role) { var ix = ref[cid + ':' + role]; return ix; }
    this.comps.forEach(function (c) {
      var V = function (n) { return res.v[n] || 0; };
      var n0 = netOf(c.id, 0), n1 = netOf(c.id, 1);
      var o = { U: 0, I: 0, P: 0, flags: {} };
      function Ires(role) { var ix = R0(c.id, role); return ix == null ? 0 : res.i[ix]; }
      switch (c.type) {
        case 'battery': {
          var X = null;
          // 内部节点电位 = 源正极所在：用 I 反推即可；直接给 U、I：
          o.I = Ires('r');                                    // 输出电流（X→+ 方向为正 = 放电）
          o.U = V(n0) - V(n1);                                // 端电压 正极−负极
          o.P = o.U * o.I;
          break;
        }
        case 'voltmeter': {
          o.U = V(n0) - V(n1); o.I = mode.realMeters ? Ires('main') : 0;
          o.display = Math.abs(o.U);
          o.flags.over = Math.abs(o.U) > METER_MAX.voltmeter;
          break;
        }
        case 'ammeter': {
          o.I = mode.realMeters ? Ires('main') : -Ires('main');
          o.display = Math.abs(o.I);
          o.flags.over = Math.abs(o.I) > METER_MAX.ammeter;
          o.flags.reverse = o.I < -1e-9;
          break;
        }
        default: {
          o.I = (c.type === 'voltmeter') ? 0 : Ires('main');
          o.U = V(n0) - V(n1);
          o.P = Math.abs(o.U * o.I);
          break;
        }
      }
      if (c.type === 'bulb') {
        var Pn = c.params.Pnom;
        o.brightness = c.burnt ? 0 : Math.min(1, Math.abs(o.P) / Pn * 1.15);
        if (!c.burnt && o.P > 2.2 * Pn) { c.burnt = true; c.burnAt = o.P; anyNewBurn = true; }
        o.flags.burnt = c.burnt;
      }
      out.comps[c.id] = o;
    });
    out.elements = els; out.raw = res;
    /* 有灯泡刚烧断：用「断路」状态重解一次，让电流/电压立刻塌下来 */
    if (anyNewBurn) return this.solve(mode);
    return out;
  };

  var Model = { Circuit: Circuit, DEFS: DEFS, METER_MAX: METER_MAX };
  root.CircuitModel = Model;
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
})(typeof window !== 'undefined' ? window : globalThis);
