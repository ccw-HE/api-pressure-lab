// 总览页（计划书 §13.1）：当前模式摘要、核心运行状态、最近结果摘要、快捷入口。
import React from 'react';
import { PlugZap, TimerReset, Library, LineChart } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { statusText, strategyLabel, formatDuration, compact, formatLatencySeconds } from '../utils/format.js';

export default function OverviewPage({ onNavigate }) {
  const { config, metrics, runs } = useStore();
  const strategy = config?.prompt?.strategy || 'weight';
  const lastRun = runs?.[0];
  const sent = metrics?.sent || 0;
  const planned = metrics?.planned || config?.load?.totalRequests || 0;
  const progress = planned ? Math.min(100, Math.round((sent / planned) * 100)) : 0;
  const completed = (metrics?.succeeded || 0) + (metrics?.failed || 0);
  const successRate = completed ? Math.round(((metrics?.succeeded || 0) / completed) * 100) : 0;

  return (
    <div className="page">
      <div className="pageHeader">
        <h1>总览</h1>
        <p>本机 API 压测控制台的当前状态概要。</p>
      </div>

      <section className={`runStatusBand ${metrics?.status || 'idle'}`}>
        <div className="runStatusIdentity">
          <span className="runStatusEyebrow">当前运行</span>
          <strong>{statusText(metrics?.status || 'idle')}</strong>
          <small>{sent} / {planned || '—'} 请求</small>
        </div>
        <div className="runProgressTrack" aria-label={`完成进度 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="runBandMetrics">
          <div><span>完成</span><strong>{progress}%</strong></div>
          <div><span>实际 RPM</span><strong>{metrics?.actualRpm || 0}</strong></div>
          <div><span>成功率</span><strong>{successRate}%</strong></div>
          <div><span>运行时间</span><strong>{formatDuration(metrics?.elapsedMs || 0)}</strong></div>
        </div>
      </section>

      <div className="cardGrid">
        <div className="card">
          <div className="cardTitle">当前模式</div>
          <div className="bigValue">{strategyLabel(strategy)}</div>
          <div className="cardHint">
            {strategy === 'weight'
              ? `权重 ${config.prompt.weights['2-5w']}/${config.prompt.weights['5-10w']}/${config.prompt.weights['10-15w']}/${config.prompt.weights['15-20w']}`
              : `增量 ${config.prompt.scroll.incrementMin}-${config.prompt.scroll.incrementMax} token`}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">运行状态</div>
          <div className="bigValue">{statusText(metrics?.status || 'idle')}</div>
          <div className="cardHint">运行时间 {formatDuration(metrics?.elapsedMs || 0)}</div>
        </div>

        <div className="card">
          <div className="cardTitle">本轮成功 / 失败</div>
          <div className="bigValue">
            {metrics?.succeeded ?? 0} / {metrics?.failed ?? 0}
          </div>
          <div className="cardHint">实际 RPM {metrics?.actualRpm ?? 0}，计划 {config?.load?.rpm}</div>
        </div>

        <div className="card">
          <div className="cardTitle">最近一次运行</div>
          {lastRun ? (
            <>
              <div className="bigValue">{lastRun.total} 请求</div>
              <div className="cardHint">
                {lastRun.success} 成功 · {lastRun.failed} 失败 · 平均 {formatLatencySeconds(lastRun.averageDurationMs)}
              </div>
            </>
          ) : (
            <div className="cardHint">还没有历史运行记录</div>
          )}
        </div>
      </div>

      <div className="pageSection">
        <h2>快捷入口</h2>
        <div className="quickLinks">
          <button type="button" className="quickLink" onClick={() => onNavigate('apis')}>
            <PlugZap size={20} />
            <span>API 配置</span>
          </button>
          <button type="button" className="quickLink" onClick={() => onNavigate('load')}>
            <TimerReset size={20} />
            <span>负载与代理</span>
          </button>
          <button type="button" className="quickLink" onClick={() => onNavigate('prompts')}>
            <Library size={20} />
            <span>Prompt 库</span>
          </button>
          <button type="button" className="quickLink" onClick={() => onNavigate('monitor')}>
            <LineChart size={20} />
            <span>运行监控</span>
          </button>
        </div>
      </div>

      <div className="pageSection">
        <h2>Token 估算</h2>
        <div className="inlineStats">
          <div>
            <span>输入 token</span>
            <strong>{compact(metrics?.inputTokens || 0)}</strong>
          </div>
          <div>
            <span>输出 token</span>
            <strong>{compact(metrics?.outputTokens || 0)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
