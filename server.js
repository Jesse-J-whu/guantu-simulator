// 官途模拟器 — 生产入口(保持 npm start 兼容)。
// 实际逻辑在 server/index.js:cluster 启动、数据留存、LLM 代理、静态服务。

require('./server/index.js');
