// API 配置页（计划书 §13.2）：API 列表、协议、Base URL、模型、Key 脱敏编辑、代理开关、路径预览。
import React, { useState } from 'react';
import { Trash2, Plus, Save } from 'lucide-react';
import { useStore, useConfigUpdaters } from '../state/store.jsx';
import { pullModels } from '../api/client.js';
import { previewApiUrl } from '../utils/format.js';
import { Toggle } from '../components/Field.jsx';

export default function ApiConfigPage() {
  const { config, saveConfig, saving, message, setMessage } = useStore();
  const { updateApi, addApi, removeApi } = useConfigUpdaters();
  const [modelOptions, setModelOptions] = useState({});

  async function loadModels(api, index) {
    setMessage('');
    try {
      const body = await pullModels(api, config.proxy);
      const models = body.models || [];
      setModelOptions((old) => ({ ...old, [api.id]: models }));
      setMessage(`已拉取 ${models.length} 个模型`);
      if (models.length > 0 && !models.includes(api.model)) {
        updateApi(index, { model: models[0] });
      }
    } catch (error) {
      setMessage(error.message || String(error));
    }
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <h1>API 配置</h1>
        <p>最多 10 个 API，每个完全独立。API Key 保存后脱敏显示，仅保留头尾字符。</p>
      </div>

      <div className="apiList">
        {config.apis.map((api, index) => (
          <div className="apiCard" key={api.id}>
            <div className="apiCardHead">
              <input
                className="apiName"
                value={api.name}
                onChange={(e) => updateApi(index, { name: e.target.value })}
                placeholder="API 名称"
              />
              <Toggle
                label="启用"
                checked={api.enabled}
                onChange={(v) => updateApi(index, { enabled: v })}
              />
              <button
                type="button"
                className="iconBtn danger"
                onClick={() => removeApi(index)}
                disabled={config.apis.length <= 1}
                title="删除这个 API"
                aria-label={`删除 ${api.name || `API ${index + 1}`}`}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="apiGrid">
              <label className="field">
                <span>协议</span>
                <select value={api.protocol} onChange={(e) => updateApi(index, { protocol: e.target.value })}>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>

              <label className="field grow">
                <span>Base URL</span>
                <input
                  value={api.baseUrl}
                  placeholder="https://api.example.com"
                  onChange={(e) => updateApi(index, { baseUrl: e.target.value })}
                />
              </label>

              <label className="field">
                <span>模型</span>
                {(modelOptions[api.id] || []).length > 0 ? (
                  <select
                    value={(modelOptions[api.id] || []).includes(api.model) ? api.model : ''}
                    onChange={(e) => updateApi(index, { model: e.target.value })}
                  >
                    <option value="" disabled>
                      选择模型
                    </option>
                    {(modelOptions[api.id] || []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={api.model}
                    placeholder="模型名"
                    onChange={(e) => updateApi(index, { model: e.target.value })}
                  />
                )}
              </label>

              <label className="field grow">
                <span>API Key</span>
                <input
                  type="password"
                  value={api.apiKey}
                  placeholder="sk-..."
                  onChange={(e) => updateApi(index, { apiKey: e.target.value })}
                />
              </label>

              <label className="field grow">
                <span>自定义路径（可空）</span>
                <input
                  value={api.path}
                  placeholder="留空则按协议自动推断"
                  onChange={(e) => updateApi(index, { path: e.target.value })}
                />
              </label>
            </div>

            <div className="apiCardFoot">
              <Toggle label="流式" checked={api.stream} onChange={(v) => updateApi(index, { stream: v })} />
              <Toggle label="使用代理" checked={api.useProxy} onChange={(v) => updateApi(index, { useProxy: v })} />
              <button type="button" className="ghostBtn" onClick={() => loadModels(api, index)}>
                拉取模型列表
              </button>
            </div>

            <div className="pathPreview">
              <span>请求地址预览</span>
              <code>{previewApiUrl(api) || '填写 Base URL 后显示完整请求地址'}</code>
            </div>
          </div>
        ))}
      </div>

      <div className="pageActions">
        <button type="button" className="ghostBtn" onClick={addApi} disabled={config.apis.length >= 10}>
          <Plus size={16} />
          添加 API
        </button>
        <button type="button" className="primaryBtn" onClick={saveConfig} disabled={saving}>
          <Save size={16} />
          {saving ? '保存中' : '保存配置'}
        </button>
        {message && <span className="inlineMessage">{message}</span>}
      </div>
    </div>
  );
}
