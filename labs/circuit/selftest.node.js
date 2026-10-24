/* Node 自检：node selftest.node.js（在 labs/circuit 目录下运行） */
const S = require('./solver.js');
let pass = 0, fail = 0;
function near(a, b, tol, name) {
  const ok = Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + '：得 ' + a + '，应 ' + b); }
}

/* 1. 串联：E=1.5V, r=0.5Ω, R=10Ω → I=0.142857A, U_R=1.42857V */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 1, b: 0, E: 1.5 },     // 电池：1(内) ↔ 0(-)
    { type: 'res', a: 1, b: 2, R: 0.5 },      // 内阻
    { type: 'res', a: 2, b: 0, R: 10 }        // 外阻
  ]});
  near(r.v[2], 1.4285714, 1e-6, '串联 U_R');
  near(r.i[2], 0.1428571, 1e-6, '串联 I');
  near(r.i[0], 0.1428571, 1e-6, '电池输出电流');
}

/* 2. 并联：E=3V 理想，10Ω∥10Ω → 总 0.6A，各 0.3A */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 1, b: 0, E: 3 },
    { type: 'res', a: 1, b: 0, R: 10 },
    { type: 'res', a: 1, b: 0, R: 10 }
  ]});
  near(r.i[1], 0.3, 1e-6, '并联支路 1');
  near(r.i[2], 0.3, 1e-6, '并联支路 2');
  near(r.i[0], 0.6, 1e-6, '并联总电流');
}

/* 3. 分压：6V，10k+10k → 中点 3V */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 2, b: 0, E: 6 },
    { type: 'res', a: 2, b: 1, R: 10000 },
    { type: 'res', a: 1, b: 0, R: 10000 }
  ]});
  near(r.v[1], 3, 1e-6, '分压中点');
}

/* 4. 电压表负载效应：10V 经 100kΩ 到中点，100kΩ 到地；并 3kΩ 表（真实） vs 理想 */
{
  const els = (Rv) => [
    { type: 'vsrc', a: 2, b: 0, E: 10 },
    { type: 'res', a: 2, b: 1, R: 100000 },
    { type: 'res', a: 1, b: 0, R: 100000 }
  ].concat(Rv ? [{ type: 'res', a: 1, b: 0, R: Rv }] : []);
  const ideal = S.solve({ nets: 3, gnd: 0, elements: els(null) });
  const real = S.solve({ nets: 3, gnd: 0, elements: els(3000) });
  near(ideal.v[1], 5, 1e-6, '理想表读数 5V');
  const expect = 10 * (100000 * 3000 / 103000) / (100000 + 100000 * 3000 / 103000);
  near(real.v[1], expect, 1e-6, '真实表读数(负载效应)');
  console.log('  负载效应：理想 ' + ideal.v[1].toFixed(4) + ' V，真实 ' + real.v[1].toFixed(4) + ' V');
}

/* 5. 滑动变阻器：6V, 10Ω定值 + 滑变 10Ω（滑到一半）→ I=0.4A */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 2, b: 0, E: 6 },
    { type: 'res', a: 2, b: 1, R: 10 },
    { type: 'res', a: 1, b: 0, R: 5 }
  ]});
  near(r.i[2], 0.4, 1e-6, '滑变半程');
}

/* 6. 断开开关：近似 0 电流 */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 2, b: 0, E: 6 },
    { type: 'res', a: 2, b: 1, R: S.OPEN },
    { type: 'res', a: 1, b: 0, R: 10 }
  ]});
  near(r.i[1] < 1e-7 ? 0 : 1, 0, 0, '断开开关电流≈0');
}

/* 7. 短路：1.5V r=0.5Ω + 电流表 0.1Ω → 2.5A */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 1, b: 0, E: 1.5 },
    { type: 'res', a: 1, b: 2, R: 0.5 },
    { type: 'res', a: 2, b: 0, R: 0.1 }
  ]});
  near(r.i[2], 2.5, 1e-6, '短路电流(真实表 0.1Ω)');
}

/* 8. 理想电流表 = 0V 电压源：1.5V r=0.5Ω → 3A */
{
  const r = S.solve({ nets: 3, gnd: 0, elements: [
    { type: 'vsrc', a: 1, b: 0, E: 1.5 },
    { type: 'res', a: 1, b: 2, R: 0.5 },
    { type: 'vsrc', a: 2, b: 0, E: 0 }
  ]});
  near(r.i[0], 3, 1e-6, '理想电流表电路·电池输出 3A');
  near(-r.i[2], 3, 1e-6, '理想电流表 A→B 显示 3A');
}

/* 9. 孤岛：接地部分正常，孤岛返回 0 */
{
  const r = S.solve({ nets: 4, gnd: 0, elements: [
    { type: 'vsrc', a: 1, b: 0, E: 6 },
    { type: 'res', a: 1, b: 0, R: 12 },
    { type: 'vsrc', a: 3, b: 2, E: 9 },     // 孤岛
    { type: 'res', a: 3, b: 2, R: 9 }
  ]});
  near(r.v[1], 6, 1e-6, '主电路正常');
  near(r.v[3], 0, 0, '孤岛电位 0');
  near(r.i[2], 0, 0, '孤岛电流 0');
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
