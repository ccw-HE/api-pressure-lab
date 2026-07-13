// 负载与代理页（计划书 §13.3）：RPM、总请求数、最大并发、抖动、重试、失败自动停止、全局代理、请求体最大输出 token。
import React from 'react';
import { Save } from 'lucide-react';
import { useStore, useConfigUpdaters } from '../state/store.jsx';
import { NumberField, Toggle } from '../components/Field.jsx';

export default function LoadPage() {
  const { config, saveConfig, saving, message } = useStore();
  const { updateLoad, updateProxy, updateOutput } = useConfigUpdaters();
  const estimatedMinutes = Math.ceil(config.load.totalRequests / Math.max(1, config.load.rpm));
  const pressureRatio = Math.round((config.load.rpm / Math.max(1, config.load.maxConcurrent)) * 10) / 10;

  return (
    <div className="page">
      <div className="pageHeader">
        <h1>负载与代理</h1>
        <p>控制压测节奏、并发与全局网络行为。请求体最大输出 token 为全局统一设置。</p>
      </div>

      <div className="loadSummaryBand">
        <div><span>目标速率</span><strong>{config.load.rpm} RPM</strong></div>
        <div><span>并发上限</span><strong>{config.load.maxConcurrent}</strong></div>
        <div><span>预计耗时</span><strong>{estimatedMinutes >= 60 ? `${Math.floor(estimatedMinutes / 60)} 小时 ${estimatedMinutes % 60} 分` : `${estimatedMinutes} 分钟`}</strong></div>
        <div><span>每并发负载</span><strong>{pressureRatio} 请求/分</strong></div>
      </div>

      <div className="card">
        <h2 className="cardTitle">负载节奏</h2>
        <div className="fieldGrid">
          <NumberField label="RPM（每分钟请求）" value={config.load.rpm} min={1} max={600} onChange={(rpm) => updateLoad({ rpm })} />
          <NumberField label="总请求数" value={config.load.totalRequests} min={1} max={100000} onChange={(totalRequests) => updateLoad({ totalRequests })} />
          <NumberField label="最大并发" value={config.load.maxConcurrent} min={1} max={100} onChange={(maxConcurrent) => updateLoad({ maxConcurrent })} />
          <NumberField label="随机抖动（秒）" value={config.load.jitterSeconds} min={0} max={30} onChange={(jitterSeconds) => updateLoad({ jitterSeconds })} />
          <NumberField label="失败重试次数" value={config.load.retries} min={0} max={2} onChange={(retries) => updateLoad({ retries })} />
          <NumberField
            label="连续失败自动停止"
            hint="设为 0 关闭自动停止"
            value={config.load.stopAfterConsecutiveFailures}
            min={0}
            max={1000}
            onChange={(stopAfterConsecutiveFailures) => updateLoad({ stopAfterConsecutiveFailures })}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="cardTitle">请求体最大输出 token</h2>
        <p className="cardNote">
          全局统一，不按 API 单独配置。用于尽量避免中转站因非法输入或上限不合理而返回 400。范围 1024-65535。
        </p>
        <div className="fieldGrid">
          <NumberField
            label="max_tokens（全局）"
            value={config.output.maxOutputTokens}
            min={1024}
            max={65535}
            onChange={(maxOutputTokens) => updateOutput({ maxOutputTokens })}
          />
        </div>
      </div>

      <div className="card">
        <h2 className="cardTitle">全局代理</h2>
        <div className="proxyRow">
          <Toggle label="启用 HTTP 代理" checked={config.proxy.enabled} onChange={(v) => updateProxy({ enabled: v })} />
          <label className="field grow">
            <span>代理地址</span>
            <input value={config.proxy.url} onChange={(e) => updateProxy({ url: e.target.value })} placeholder="http://127.0.0.1:7897" />
          </label>
        </div>
      </div>

      <div className="pageActions">
        <button type="button" className="primaryBtn" onClick={saveConfig} disabled={saving}>
          <Save size={16} />
          {saving ? '保存中' : '保存配置'}
        </button>
        {message && <span className="inlineMessage">{message}</span>}
      </div>
    </div>
  );
}
