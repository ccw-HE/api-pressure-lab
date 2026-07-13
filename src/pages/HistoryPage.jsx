// 历史与错误页面（计划书 §13.6）：历史运行记录、关键错误聚合、历史模式摘要、常见失败原因。
import React, { useMemo } from 'react';
import { History, AlertTriangle, Gauge, Trash2 } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { Card } from '../components/Field.jsx';
import { extractStatusCode, formatLatencySeconds } from '../utils/format.js';

export default function HistoryPage() {
  const { runs, metrics, config, clearLogs, message } = useStore();
  const m = metrics || {};
  const clearDisabled = ['running', 'paused'].includes(m.status) || (m.inFlight || 0) > 0;

  const totals = useMemo(() => summarizeTotals(runs, m), [runs, m]);
  const errorEntries = useMemo(() => {
    const errors = aggregateRunErrors(runs);
    for (const [message, count] of Object.entries(m.errors || {})) {
      errors[message] = (errors[message] || 0) + count;
    }
    return Object.entries(errors).sort((a, b) => b[1] - a[1]);
  }, [runs, m.errors]);
  const commonReasons = useMemo(() => summarizeReasons(errorEntries), [errorEntries]);

  function handleClearLogs() {
    if (clearDisabled) return;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('确认清除所有历史运行日志和当前错误统计吗？此操作不可撤销。');
    if (confirmed) clearLogs();
  }

  return (
    <div className="page historyPage">
      <div className="pageHeader historyHeader">
        <div>
          <h1>历史与错误</h1>
          <p>历史运行记录与关键错误聚合</p>
        </div>
        <div className="historyActions">
          {message && <span className="inlineMessage historyMessage">{message}</span>}
          <button className="dangerBtn" type="button" onClick={handleClearLogs} disabled={clearDisabled}>
            <Trash2 size={15} />
            清除日志
          </button>
        </div>
      </div>

      <div className="historySummaryStrip">
        <SummaryTile icon={Gauge} label="当前策略" value={config?.prompt?.strategy === 'scroll' ? '滚动模式' : '权重模式'} />
        <SummaryTile label="累计发送" value={totals.sent} />
        <SummaryTile label="累计成功" value={totals.succeeded} />
        <SummaryTile label="累计失败" value={totals.failed} danger />
        <SummaryTile
          label="成功率"
          value={totals.sent ? `${Math.round((totals.succeeded / totals.sent) * 100)}%` : '—'}
        />
      </div>

      <div className="historyMainGrid">
        <Card title="历史运行记录" icon={History} note="最近 30 次运行日志摘要" className="historyRunsCard">
          {runs.length === 0 ? (
            <p className="mutedText">还没有历史记录</p>
          ) : (
            <div className="runList historyRunList">
              {runs.map((run) => (
                <div key={run.runId} className="runRow">
                  <div className="runRowMain">
                    <strong>{run.total} 请求</strong>
                    <span className="runTime">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
                    </span>
                  </div>
                  <div className="runRowStats">
                    <span className="okText">成功 {run.success}</span>
                    <span className="failText">失败 {run.failed}</span>
                    <span>平均 {formatLatencySeconds(run.averageDurationMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="historySideStack">
          <Card title="常见失败原因" icon={AlertTriangle} note="按 HTTP 状态与消息归类">
            {commonReasons.length === 0 ? (
              <p className="mutedText">暂无失败记录</p>
            ) : (
              <div className="reasonList historyReasonList">
                {commonReasons.map((r) => (
                  <div key={r.key} className="reasonRow">
                    <span className="errorCode">{r.code}</span>
                    <span className="reasonText" title={r.sample}>{r.sample}</span>
                    <strong className="errorCount">{r.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="关键错误聚合" icon={AlertTriangle} note="按错误消息完整聚合">
            {errorEntries.length === 0 ? (
              <p className="mutedText">暂无错误</p>
            ) : (
              <div className="errorDist historyErrorList">
                {errorEntries.map(([msg, count]) => (
                  <div key={msg} className="errorDistRow">
                    <span className="errorCode">{extractStatusCode(msg) || 'ERR'}</span>
                    <span className="errorMsg" title={msg}>{msg}</span>
                    <strong className="errorCount">{count}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value, danger }) {
  return (
    <div className={`historySummaryTile ${danger ? 'danger' : ''}`}>
      {Icon ? <Icon size={16} /> : null}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function summarizeTotals(runs, metrics) {
  const totals = runs.reduce(
    (acc, run) => ({
      sent: acc.sent + (run.total || 0),
      succeeded: acc.succeeded + (run.success || 0),
      failed: acc.failed + (run.failed || 0)
    }),
    { sent: 0, succeeded: 0, failed: 0 }
  );
  const currentRunAlreadyLogged = metrics.runId && runs.some((run) => run.runId === metrics.runId);
  if (metrics.runId && !currentRunAlreadyLogged) {
    totals.sent += metrics.sent || 0;
    totals.succeeded += metrics.succeeded || 0;
    totals.failed += metrics.failed || 0;
  }
  return totals;
}

function aggregateRunErrors(runs) {
  return runs.reduce((acc, run) => {
    for (const [message, count] of Object.entries(run.errors || {})) {
      acc[message] = (acc[message] || 0) + count;
    }
    return acc;
  }, {});
}

// 将错误消息按 HTTP 状态码归类，取每类的样本与计数。
function summarizeReasons(errorEntries) {
  const byCode = new Map();
  for (const [msg, count] of errorEntries) {
    const code = extractStatusCode(msg) || '其他';
    const existing = byCode.get(code) || { key: code, code, count: 0, sample: msg };
    existing.count += count;
    byCode.set(code, existing);
  }
  return Array.from(byCode.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}
