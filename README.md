# API Pressure Lab

API Pressure Lab 是一款运行在 Windows 本机的 API 压测工具。它可以同时配置多个 API，控制 RPM、并发、请求总量和重试策略，并实时查看延迟、成功率与错误记录。

支持 NewAPI、OpenAI 兼容接口、Claude Messages 和 Gemini generateContent。配置、运行指标和历史日志保存在本机。

## 主要功能

- 独立配置 1-10 个 API，包括地址、协议、模型、密钥和代理
- 设置 RPM、总请求数、最大并发、随机抖动、重试和连续失败停止条件
- 使用权重或滚动策略选择不同长度的 Prompt
- 支持流式与非流式请求
- 查看实时指标、延迟分位数、API 统计、历史记录和错误汇总

## 运行环境

- Windows 10 或 Windows 11
- Node.js 20.19.0+，或者 22.12.0+
- npm 10+

## 快速开始

从 [Releases](https://github.com/ccw-HE/api-pressure-lab/releases/latest) 下载源码压缩包并解压，或者克隆仓库：

```powershell
git clone https://github.com/ccw-HE/api-pressure-lab.git
cd api-pressure-lab
```

双击根目录的 `Start.bat`。首次启动会安装依赖并构建界面，完成后自动打开 `http://127.0.0.1:4217`。

使用期间请保持启动窗口运行。在窗口中按 `Ctrl+C` 可以停止服务，也可以执行：

```powershell
.\Start.bat stop
```

## 基本使用

左侧用于切换总览、API 配置、负载与代理、Prompt 库、运行监控、历史与错误。右侧状态栏显示当前运行状态、RPM、成功与失败，并提供开始、暂停、继续和停止操作。

建议先完成 API 配置，再从较低的 RPM、并发数和请求总量开始测试。运行期间可以在监控页查看趋势、延迟和错误，历史结果保存在本机。

## Prompt 策略

- 权重模式：按比例从不同长度分区中选择 Prompt，适合固定分布的批量测试
- 滚动模式：逐轮增加 Prompt 长度，模拟上下文持续增长的对话

期望输出 token 用于设置 Prompt 中要求的目标输出长度；请求体最大输出 token 用于限制 API 实际允许的输出上限。

## 使用边界

只对自己拥有或已经获得明确授权的 API 服务进行压力测试。提高负载前，请确认服务限额、计费方式和上游使用条款。

项目默认只监听 `127.0.0.1`。如果修改监听地址，请同时配置访问控制，并评估网络暴露和 API Key 泄漏风险。

## 隐私与本地数据

API Key 会保存在本机的 `data/config.json` 和浏览器存储中，配置页只显示脱敏结果。发起压测时，密钥会发送到你配置的 API 服务。

请勿上传或分享 `data/config.json`。截图、录屏或提交问题前，请遮盖 API 地址、模型名称和密钥信息。需要迁移配置或历史记录时，可以备份 `data/` 目录。

## 开发与测试

安装依赖并运行完整检查：

```powershell
npm ci
npm test
npm run build
```

开发模式需要两个终端：

```powershell
# 终端 1：后端
npm run server

# 终端 2：前端
npm run dev
```

开发时打开 `http://127.0.0.1:5173`。后端运行在 `http://127.0.0.1:4217`，前端会将 `/api` 请求代理到后端。

参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 反馈与安全问题

普通问题和功能建议请提交到 [GitHub Issues](https://github.com/ccw-HE/api-pressure-lab/issues)。提交前请删除日志、截图和复现步骤中的真实 API Key。

安全漏洞请按照 [SECURITY.md](SECURITY.md) 私密报告，不要发布到公开 Issue。

## 许可证

项目使用 [MIT License](LICENSE)。
