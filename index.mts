/**
 * index.mts - ESM TypeScript 入口包装文件
 *
 * Pterodactyl Node.js Egg 的启动脚本:
 *   if [[ "${MAIN_FILE}" == "*.js" ]]; then node ... else ts-node --esm ... fi
 * 引号导致 glob 不生效，永远走 ts-node --esm 分支。
 *
 * ts-node --esm 需要 .mts 扩展名才能正确加载 ESM TypeScript。
 * 本文件用 ESM 语法 spawn 一个子进程运行 CommonJS 的 index.js。
 *
 * 面板 Main file 设置为 index.mts
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 启动 index.js 子进程，继承 stdio
const child = spawn('node', [path.join(__dirname, 'index.js')], {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env
});

child.on('error', (err) => {
  console.error('Failed to start index.js:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

// 转发信号
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
