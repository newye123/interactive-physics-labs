/* 电路实验室 · 直流求解内核（改进节点法 MNA）
 * 元件：{ type:'res', a, b, R }  电阻（开关/表内阻/导线都用它）
 *       { type:'vsrc', a, b, E } 电压源（E = V(a) − V(b)），并给出支路电流
 * 求解：solve({ nets, gnd, elements }) → { ok, v[], i[] }
 *   v[n]   = 网表节点电位（伏）
 *   i[k]   = elements[k] 的电流：res 为 a→b 方向；vsrc 为「从 b 端子流出、经电源内部送到 a 端子」
 * 说明：未与地（gnd）连通的部分视为「未接通」，其电位记 0、电流记 0；
 *       开路开关（R ≥ 1e8）不参与连通性，避免把孤岛“接”回主电路。 */
(function (root) {
  'use strict';

  var OPEN = 1e9;        // 开路电阻（开关断开、理想电压表缺省）
  var WIRE = 1e-3;       // 导线/闭合开关的等效小电阻

  function solve(opts) {
    var nets = opts.nets, gnd = opts.gnd, els = opts.elements;
    var n = nets, i, k;

    /* 1. 从 gnd 出发做连通性搜索（开路元件不参与） */
    var adj = [];
    for (i = 0; i < nets; i++) adj.push([]);
    for (k = 0; k < els.length; k++) {
      var e = els[k];
      if (e.type === 'res' && e.R >= 1e8) continue;      // 开路
      if (e.a === e.b) continue;
      adj[e.a].push(e.b); adj[e.b].push(e.a);
    }
    var live = new Array(nets).fill(false), stack = [gnd];
    live[gnd] = true;
    while (stack.length) {
      var u = stack.pop();
      for (i = 0; i < adj[u].length; i++) if (!live[adj[u][i]]) { live[adj[u][i]] = true; stack.push(adj[u][i]); }
    }
    if (!live[gnd]) live[gnd] = true;

    /* 2. 建立节点编号（不含地） */
    var idx = new Array(nets).fill(-1), m = 0;
    for (i = 0; i < nets; i++) if (i !== gnd && live[i]) idx[i] = m++;
    var srcs = [];
    for (k = 0; k < els.length; k++) {
      var el = els[k];
      if (el.type !== 'vsrc') continue;
      if (!live[el.a] || !live[el.b]) continue;
      if (el.a === el.b) continue;
      srcs.push(k);
    }
    var N = m + srcs.length;
    if (N === 0) return { ok: true, v: new Array(nets).fill(0), i: els.map(function () { return 0; }) };

    /* 3. 组装矩阵 */
    var A = [], z = new Array(N).fill(0);
    for (i = 0; i < N; i++) { A.push(new Array(N).fill(0)); }
    function A_add(r, c, val) { A[r][c] += val; }
    for (k = 0; k < els.length; k++) {
      var r = els[k];
      if (r.type !== 'res' || !live[r.a] || !live[r.b]) continue;
      var g = 1 / Math.max(r.R, WIRE);          // R 下限保护
      var a = idx[r.a], b = idx[r.b];
      if (a >= 0) A_add(a, a, g);
      if (b >= 0) A_add(b, b, g);
      if (a >= 0 && b >= 0) { A_add(a, b, -g); A_add(b, a, -g); }
    }
    var sIdx = {};
    for (i = 0; i < srcs.length; i++) {
      sIdx[srcs[i]] = m + i;
      var s = els[srcs[i]], row = m + i, pa = idx[s.a], pb = idx[s.b];
      if (pa >= 0) { A_add(pa, row, 1); A_add(row, pa, 1); }
      if (pb >= 0) { A_add(pb, row, -1); A_add(row, pb, -1); }
      z[row] = s.E;
    }

    /* 4. 高斯消元（列主元） */
    for (var col = 0; col < N; col++) {
      var piv = col, best = Math.abs(A[col][col]);
      for (i = col + 1; i < N; i++) { var v = Math.abs(A[i][col]); if (v > best) { best = v; piv = i; } }
      if (best < 1e-13) return { ok: false, reason: '矩阵奇异：请检查电路（可能有两端电位相同的理想电压源或孤立回路）' };
      if (piv !== col) { var t = A[col]; A[col] = A[piv]; A[piv] = t; var tz = z[col]; z[col] = z[piv]; z[piv] = tz; }
      var pc = A[col][col];
      for (i = col + 1; i < N; i++) {
        var f = A[i][col] / pc;
        if (f === 0) continue;
        for (var j = col; j < N; j++) A[i][j] -= f * A[col][j];
        z[i] -= f * z[col];
      }
    }
    var x = new Array(N).fill(0);
    for (i = N - 1; i >= 0; i--) {
      var sum = z[i];
      for (var j2 = i + 1; j2 < N; j2++) sum -= A[i][j2] * x[j2];
      x[i] = sum / A[i][i];
    }

    /* 5. 回填结果 */
    var volts = new Array(nets).fill(0);
    for (i = 0; i < nets; i++) if (idx[i] >= 0) volts[i] = x[idx[i]];
    var cur = new Array(els.length).fill(0);
    for (k = 0; k < els.length; k++) {
      var q = els[k];
      if (q.type === 'res') {
        if (!live[q.a] || !live[q.b]) { cur[k] = 0; continue; }
        cur[k] = (volts[q.a] - volts[q.b]) / Math.max(q.R, WIRE);
        if (Math.abs(q.R - WIRE) < 1e-12 && q.R === WIRE) cur[k] = (volts[q.a] - volts[q.b]) / WIRE;
      } else {
        cur[k] = (sIdx[k] != null) ? -x[sIdx[k]] : 0;   // 输出电流（从 a 端子流出）
      }
    }
    return { ok: true, v: volts, i: cur };
  }

  var Solver = { solve: solve, OPEN: OPEN, WIRE: WIRE };
  root.CircuitSolver = Solver;
  if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
})(typeof window !== 'undefined' ? window : globalThis);
