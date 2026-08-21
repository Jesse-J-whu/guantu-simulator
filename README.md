# 官途模拟器(Guantu Simulator)

以真实官场案例为鉴的文字模拟游戏:选部门、做抉择、看属性与职级起落,24 步写完一段官途。AI 事件引擎由 GLM 驱动,前端 React 19,后端 Node cluster + SQLite。

## 快速开始

```bash
npm install
npm run build          # 生成 dist/(生产静态资源,必须先构建)
GLM_API_KEY=<你的GLM密钥> npm start   # http://localhost:3000
```

开发模式(前端热更新 + 后端):`npm run dev`。

管理仪表盘(访问/留存/通关统计):`http://localhost:3000/admin`。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `WORKERS` | CPU 数 | cluster 工作进程数,`1` 表示单进程 |
| `DB_PATH` | `data/guantu.db` | SQLite 路径(WAL 模式,多 worker 安全) |
| `LLM_MODE` | `real` | `real`(线上上游)/ `mock`(确定性离线生成,测试与压测用) |
| `GLM_API_KEY` | — | 智谱 GLM 密钥,`real` 模式必填 |
| `DEEPSEEK_API_KEY` | — | 备用上游,GLM 连续失败时自动切换 |
| `GLM_MODEL` | `glm-4-flash` | 模型名 |
| `LLM_MAX_CONCURRENT` | `20` | 单 worker LLM 并发闸门,保护事件循环 |
| `RATE_LIMIT_PER_MIN` | `600` | 每 IP 每分钟 API 请求上限 |
| `TRUST_PROXY` | 关 | **仅在部署于可信反向代理之后才开启**。开启后取 `X-Forwarded-For` 最右侧一段作为客户端 IP;前提是源端口不能被直连,否则该头可被伪造绕过限流。不开启则一律用 socket 地址 |

## 架构

```
src/engine/     纯 TS 游戏引擎(可脱离前端单测):事件生成、解析、去重、
                职级事实校验、属性/晋升结算
src/components/ React 组件(表现层,无游戏逻辑)
src/hooks/      状态编排(useGame)
server/         Node http 应用层:静态服务、LLM 代理、限流、留存上报、
                admin 仪表盘;cluster 多 worker + node:sqlite
e2e/            Playwright(Firefox)真实浏览器全流程
tests/          vitest 单元 + 服务端集成
scripts/        压测(loadtest.mjs)与 GLM 大规模多样性扫描(diversity-scan.mts)
docs/           压测报告、多样性验证报告、历次修复报告
```

## 测试与验证

```bash
npm test            # vitest:单元 + 集成(需先 npm run build)
npm run typecheck   # 三套 tsconfig 全 strict
npx playwright test # E2E:真实浏览器完整一局 + admin + 健康检查
node scripts/loadtest.mjs        # autocannon 压测(4 场景)
GLM_API_KEY=… npx tsx scripts/diversity-scan.mts   # 真实 GLM 13 局多样性扫描
```

相关报告见 `docs/loadtest-report.md` 与 `docs/diversity-report.md`。

## 声明

本游戏内容纯属虚构,以真实官场案例为参考背景;所有剧情均为文学创作,不代表现实任何机构或个人。
