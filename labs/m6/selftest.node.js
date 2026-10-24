/* Node 自检：node selftest.node.js （在 labs/m6 目录下运行） */
const I = require('./instruments.js');
const r = I.selfTest(500);
console.log('几何自检:', r.ok ? 'PASS（' + (r.count * 4) + ' 例）' : 'FAIL ' + r.fails.join(' | '));

let bad = [];
for (let i = 0; i < 100; i++) {
  const div = [10, 20, 50][i % 3];
  const c = I.newCaliper(div);
  const co = I.calOptions(c);
  if (co.length !== 3 || co.filter(o => o.correct).length !== 1 ||
      new Set(co.map(o => o.text)).size !== 3) bad.push('cal ' + JSON.stringify(co) + ' v=' + c.v01);
  const m = I.newMic();
  const mo = I.micOptions(m);
  if (mo.length !== 3 || mo.filter(o => o.correct).length !== 1 ||
      new Set(mo.map(o => o.text)).size !== 3) bad.push('mic ' + JSON.stringify(mo) + ' v=' + m.vUm);
  const bq = I.bugQuestion(i % 2 ? 'caliper' : 'micrometer');
  if (bq.options.length !== 3 || bq.options.filter(o => o.correct).length !== 1 ||
      new Set(bq.options.map(o => o.text)).size !== 3) bad.push('bug ' + JSON.stringify(bq.options));
}
console.log('选项自检:', bad.length ? 'FAIL\n  ' + bad.slice(0, 6).join('\n  ') : 'PASS（100 例 × 3 题型）');

const pc = I.newCaliper(10, 2370);
const pm = I.newMic(6725);
console.log('教材例卡尺:', pc.fmt, '|', I.calExpl(pc));
console.log('教材例千分尺:', pm.fmt, '|', I.micExpl(pm));
console.log('卡尺放大镜窗口:', I.calLoupeView(pc), ' 千分尺放大镜窗口:', I.micLoupeView(pm));
