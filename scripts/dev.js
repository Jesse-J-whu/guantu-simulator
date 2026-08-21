// 开发启动器:并行起后端(:3000)与 vite 前端(:5173),Ctrl+C 一键全停。

const { spawn } = require('node:child_process');

const procs = [];

function run(name, cmd, args, color) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  p.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n'));
  p.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}`).join('\n') + '\n'));
  procs.push(p);
}

console.log('开发模式: 后端 http://localhost:3000 | 前端 http://localhost:5173 (API 已代理)');
run('server', process.execPath, ['server.js'], '36');
run('web', 'npx', ['vite'], '35');

function shutdown() {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
