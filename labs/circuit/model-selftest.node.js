/* Node 自检：node model-selftest.node.js（在 labs/circuit 目录下运行） */
const M = require('./model.js');
const P = require('./presets.js');
let pass = 0, fail = 0;
function near(a, b, tol, name) {
  const ok = Math.abs(a - b) <= tol;
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + '：得 ' + a + '，应 ' + b + ' (±' + tol + ')'); }
}
function load(preset) {
  const c = new M.Circuit();
  const ids = preset.comps.map(cc => c.add(cc.t, cc.x, cc.y, cc.p).id);
  preset.wires.forEach(w => c.connect(ids[w[0]], w[1], ids[w[2]], w[3]));
  return { c, ids };
}

/* 串联两灯：4.5V，r=0.5，两灯 8.3Ω → I≈0.263A，各灯 P≈0.574W（不烧） */
{
  const { c, ids } = load(P.find(p => p.id === 'series'));
  c.byId(ids[1]).params.closed = true;
  const r = c.solve({ realMeters: true });
  if (!r.ok) { fail++; console.log('FAIL 串联：' + r.reason); }
  const b1 = r.comps[ids[2]], b2 = r.comps[ids[3]];
  near(Math.abs(b1.I), 4.5 / (0.5 + 8.3 + 8.3 + 0.001), 0.002, '串联 I');
  near(b1.P, b2.P, 1e-9, '两灯功率相等');
  near(b1.flags.burnt ? 1 : 0, 0, 0, '串联不烧灯');
}

/* 并联两灯（3V）：各灯 I≈0.322A，总≈0.645A，不烧 */
{
  const { c, ids } = load(P.find(p => p.id === 'parallel'));
  c.byId(ids[1]).params.closed = true;
  c.byId(ids[0]).params.E = 3;
  const r = c.solve({ realMeters: true });
  const b1 = r.comps[ids[2]], b2 = r.comps[ids[3]];
  near(Math.abs(b1.I), Math.abs(b2.I), 1e-9, '并联两灯电流相等');
  near(Math.abs(b1.I), 0.3226, 0.004, '并联支路电流');
  near(b1.flags.burnt ? 1 : 0, 0, 0, '并联不烧灯');
}

/* 欧姆定律：滑变 100% → I≈0.147；滑到 10% → I≈0.357，电压表读数同步 */
{
  const { c, ids } = load(P.find(p => p.id === 'ohm'));
  let r = c.solve({ realMeters: true });
  near(r.comps[ids[2]].display, 4.5 / 30.6, 0.003, '欧姆定律 I(滑变全)');
  near(r.comps[ids[5]].display, 4.5 / 30.6 * 10, 0.03, '电压表 U(滑变全)');
  c.byId(ids[3]).params.frac = 0.1;
  r = c.solve({ realMeters: true });
  near(r.comps[ids[2]].display, 4.5 / 12.6, 0.005, '欧姆定律 I(滑变10%)');
  near(r.comps[ids[5]].display, 4.5 / 12.6 * 10, 0.06, '电压表 U(滑变10%)');
}

/* 电动势内阻：滑变 20 → I≈0.0711，端电压≈1.4289（电压表接电池两端） */
{
  const { c, ids } = load(P.find(p => p.id === 'emf'));
  const r = c.solve({ realMeters: true });
  near(r.comps[ids[2]].display, 1.5 / 21.101, 0.002, '内阻实验 I');
  near(r.comps[ids[4]].display, 1.5 - 1.5 / 21.101 * 1.0, 0.01, '内阻实验 端电压');
}

/* 短路：4.5V / (0.5+0.1) = 7.5A → 超量程 */
{
  const { c, ids } = load(P.find(p => p.id === 'short'));
  c.byId(ids[2]).params.closed = true;
  const r = c.solve({ realMeters: true });
  near(r.comps[ids[1]].display, 7.5, 0.02, '短路电流 7.5A');
  near(r.comps[ids[1]].flags.over ? 1 : 0, 1, 0, '短路超量程标记');
}

/* 理想表模式：欧姆定律同一电路，理想电流表零内阻 */
{
  const { c, ids } = load(P.find(p => p.id === 'ohm'));
  const r = c.solve({ realMeters: false });
  near(r.comps[ids[2]].display, 4.5 / 30.5, 0.003, '理想表 I');
}

/* 烧灯：4.5V 直接接一只灯（2.5V 0.3A）→ P≈2.44W > 1.65W → 烧断，下一次求解归零 */
{
  const c = new M.Circuit();
  const b = c.add('battery', 200, 500, { E: 4.5, r: 0.5 });
  const L = c.add('bulb', 600, 500);
  c.connect(b.id, 0, L.id, 1); c.connect(L.id, 0, b.id, 1);
  const r1 = c.solve({ realMeters: true });
  near(r1.comps[L.id].flags.burnt ? 1 : 0, 1, 0, '4.5V 直连烧灯');
  const r2 = c.solve({ realMeters: true });
  near(Math.abs(r2.comps[L.id].I) < 1e-6 ? 0 : 1, 0, 0, '烧断后电流≈0');
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
