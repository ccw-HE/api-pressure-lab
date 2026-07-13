# API Pressure Lab

API Pressure Lab 是一个运行在 Windows 本机的 API 压测控制台，支持 NewAPI、OpenAI 兼容接口、Claude Messages 和 Gemini generateContent。

项目使用 React、Vite 和 Express 构建。界面分为页面导航、当前工作区和常驻运行状态三部分，可配置多个 API，观察实时指标，并保留本地历史记录。

## 运行环境

- Windows 10 或 Windows 11
- Node.js 20.18.1 或更高版本
- npm 10 或兼容版本
- 默认服务地址：`http://127.0.0.1:4217`

## 启动

双击根目录的 `Start.bat`。

它会自动完成：检查 Node.js、按需安装依赖、构建 WebUI、启动本机服务，并打开浏览器到 `http://127.0.0.1:4217`。

结束方式：在启动窗口按 `Ctrl+C` 直接结束，无需二次确认。

也可以在终端中停止服务：

```powershell
.\Start.bat stop
```

手动方式：

```powershell
npm ci
npm run build
npm start
```

然后打开 `http://127.0.0.1:4217`。

开发模式需要两个终端：

```powershell
# 终端 1：后端
npm run server

# 终端 2：前端
npm run dev
```

开发时打开 `http://127.0.0.1:5173`。后端运行在 `http://127.0.0.1:4217`，前端会将 `/api` 请求代理到后端。

## 使用边界

只对自己拥有或已经获得明确授权的 API 服务进行压力测试。建议从较低的 RPM、并发数和请求总量开始，确认服务限额、计费方式与上游使用条款后再提高负载。

项目默认只监听 `127.0.0.1`。如果修改监听地址，请同时评估访问控制、网络暴露和本地 API Key 的安全风险。

## 页面结构

左侧用于切换总览、API 配置、负载与代理、Prompt 库、运行监控、历史与错误。右侧状态栏常驻显示运行状态、RPM、成功与失败，并提供开始、暂停、继续和停止操作。

## Prompt 双策略

两条独立路线，互不兜底，默认权重模式：

- 权重模式：按 `2-5w / 5-10w / 10-15w / 15-20w` 四个分区的百分比抽样（默认 10 / 35 / 35 / 20），合计 100%，单项可为 0%。适合短期大规模冒烟测试。
- 滚动模式：模拟真实对话逐轮增长。首条从 `2-5w` 随机开始，每轮在上轮 token 基础上加随机增量（默认 3000-5000），在 100 条有序库中取最接近的一条；超过 20w 上限后压缩重启回到 `2-5w`。

## 输出 token 双层规则

期望输出 token 决定 Prompt 中要求的目标输出长度；请求体最大输出 token 控制 API 实际允许的输出上限。

## 默认能力

支持 1-10 个 API 独立配置，覆盖 OpenAI Chat、Claude Messages 和 Gemini generateContent；可设置 RPM、并发、重试、流式或非流式请求和 HTTP 代理，并提供实时监控、历史记录与错误汇总。

## 测试

安装锁文件指定的依赖并运行完整检查：

```powershell
npm ci
npm test
npm run build
```

## 项目结构

```text
server/     Express 服务、压力调度、协议适配与本地日志
src/        React WebUI
scripts/    Windows 进程启动与停止辅助脚本
tests/      Vitest 单元测试和本地协议测试
Start.bat   Windows 启动入口
```

## 隐私与本地数据

API Key 会保存在本机的 `data/config.json` 和浏览器存储中，配置页只显示脱敏结果。发起压测时，密钥会发送到你配置的 API 服务。请勿分享 `data/config.json`，截图或录屏前也请遮盖 API 地址、模型名称和密钥信息。需要迁移配置或历史记录时，备份 `data/` 目录即可。
