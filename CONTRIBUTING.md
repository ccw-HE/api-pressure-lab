# 参与贡献

欢迎提交问题、改进建议和 Pull Request。请尽量保持改动范围清晰，不要在同一个提交中混入无关重构。

## 提交问题

提交 Bug 时，请说明：

- Windows 和 Node.js 版本
- 可以稳定复现的操作步骤
- 预期结果与实际结果
- 已脱敏的错误信息

不要上传 `data/config.json`、真实 API Key、完整请求头或包含隐私信息的运行日志。

## 本地开发

```powershell
npm ci
npm test
npm run build
```

开发模式分别运行后端和前端：

```powershell
npm run server
npm run dev
```

前端地址为 `http://127.0.0.1:5173`，后端地址为 `http://127.0.0.1:4217`。

## Pull Request

- 提交前运行完整测试和生产构建
- 行为变化需要补充或更新测试
- 不得提交本地配置、日志、PID、缓存或真实凭据
- 说明改动解决了什么问题，以及如何验证
