// 统一入口：跑全部自检，聚合退出码。
//
// 为什么不用 `a && b && c`：链式短路会在第一处失败就停，后面的检查根本不跑，
// 你看到的是"一个失败"，实际可能是"四个失败"。而且链式写法里，
// 最后一条命令的退出码会覆盖前面所有命令的退出码。
//
// 所以这里逐个跑、全部跑完、再统一裁决。退出码三档：0 全过 / 1 有失败 / 2 跑不起来。

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  ['电路求解器自检', 'labs/circuit/selftest.node.js'],
  ['电路模型自检', 'labs/circuit/model-selftest.node.js'],
  ['读数训练器自检', 'labs/m6/selftest.node.js'],
  ['静态资源断链检查', 'tests/check_assets.mjs'],
];

const results = [];
let spawnError = 0;

for (const [label, rel] of CHECKS) {
  const r = spawnSync(process.execPath, [rel], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });

  if (r.error) {
    spawnError++;
    console.log(`\n✗ ${label} —— 无法启动：${r.error.message}`);
    results.push([label, 'SPAWN-ERROR']);
    continue;
  }

  const ok = r.status === 0;
  const tail = (r.stdout || '').trim().split('\n').slice(-1)[0] || '';
  console.log(`\n${ok ? '✓' : '✗'} ${label}  (rc=${r.status})  ${tail}`);
  results.push([label, ok ? 'PASS' : `FAIL rc=${r.status}`]);
}

console.log('\n──── 汇总 ────');
for (const [label, verdict] of results) {
  console.log(`${verdict.padEnd(14)} ${label}`);
}

const failed = results.filter(([, v]) => v !== 'PASS').length;
console.log(`\n${results.length - failed} 通过 / ${failed} 失败`);

if (spawnError > 0) process.exit(2);
process.exit(failed === 0 ? 0 : 1);
