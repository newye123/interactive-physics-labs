// 静态资源自检：每个 <script src> / <link href> / <a href> 指向的本地文件必须存在。
//
// 为什么需要它：这是一个纯静态课堂包，没有构建步骤，也没有打包器帮忙。
// 一个写错的相对路径不会报错，只会在课堂上变成一块白屏——
// 老师在讲台上，学生在等，而"页面没反应"和"代码有 bug"看起来一模一样。
//
// 退出码三档：0 通过 / 1 有断链 / 2 工具自己没跑起来。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === '.git' || name.name === 'node_modules') continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (name.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// 只取 src= 与 href=，跳过 http(s)、mailto、锚点、data:
const ATTR = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

function localRefs(html) {
  const refs = [];
  let m;
  while ((m = ATTR.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (/^(https?:|mailto:|data:|#|javascript:)/i.test(raw)) continue;
    refs.push(raw);
  }
  return refs;
}

let files;
try {
  files = walk(ROOT);
} catch (e) {
  console.error('无法遍历目录：', e.message);
  process.exit(2);
}

if (files.length === 0) {
  console.error('没找到任何 .html —— 探针可能扫错了目录');
  process.exit(2);
}

let broken = 0;
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  for (const ref of localRefs(html)) {
    // 去掉 ?query 与 #hash
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = path.resolve(path.dirname(file), clean);
    checked++;
    if (!fs.existsSync(target)) {
      broken++;
      console.log(`断链  ${rel}  ->  ${ref}`);
    }
  }
}

console.log(`\n扫描 ${files.length} 个页面，检查 ${checked} 条本地引用，断链 ${broken} 条`);

if (checked === 0) {
  console.error('一条引用都没解析到 —— 这是探针失灵，不是"没问题"');
  process.exit(2);
}

process.exit(broken === 0 ? 0 : 1);
