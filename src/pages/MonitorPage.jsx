// 运行监控页面（计划书 §13.5）：完整版运行状态。
// 趋势图、P50/P95/P99、错误分布、最近错误、按 API 统计、Prompt 运行轨迹。
import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { TrendingUp, Timer, AlertTriangle, ListChecks, Server, Route } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { Page, Card } from '../components/Field.jsx';
import { compact, tierLabel, extractStatusCode, formatLatencySeconds } from '../utils/format.js';

export default function MonitorPage() {
  const { metrics } = useStore();
  const m = metrics || {};
  const timeline = m.timeline || [];

  const chartData = useMemo(() => buildChartData(timeline), [timeline]);
  const errorEntries = Object.entries(m.errors || {}).sort((a, b) => b[1] - a[1]);
  const byApi = Object.entries(m.byApi || {});
  const recentErrors = timeline.filter((e) => e.type === 'error').slice(-20).reverse();

  return (
    <Page title="运行监控" subtitle="完整版运行状态，右侧状态栏只保留关键 6 项">
      <Card title="实时趋势" icon={TrendingUp} note="最近事件的成功与失败计数">
        <div className="chartBox">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="label" stroke="#9aa5b1" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9aa5b1" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e3e8ef',
                  borderRadius: 10,
                  fontSize: 12
                }}
              />
              <Line type="monotone" dataKey="success" stroke="#16a34a" strokeWidth={2} dot={false} name="成功" />
              <Line type="monotone" dataKey="error" stroke="#dc2626" strokeWidth={2} dot={false} name="失败" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="gridTwo">
        <Card title="延迟分位" icon={Timer} note="基于最近请求样本">
          <div className="statGrid">
            <StatBox label="P50" value={formatLatencySeconds(m.p50Ms)} />
            <StatBox label="P95" value={formatLatencySeconds(m.p95Ms)} accent />
            <StatBox label="P99" value={formatLatencySeconds(m.p99Ms)} />
            <StatBox label="平均延迟" value={formatLatencySeconds(m.averageDurationMs)} />
            <StatBox label="平均首字" value={formatLatencySeconds(m.averageFirstTokenMs)} />
            <StatBox label="并发中" value={m.inFlight || 0} />
          </div>
        </Card>

        <Card title="Prompt 运行轨迹" icon={Route} note="当前模式下的实时命中情况">
          <div className="statGrid">
            <StatBox label="当前分区" value={m.currentTier ? tierLabel(m.currentTier) : '—'} accent />
            <StatBox label="输入 token" value={compact(m.inputTokens)} />
            <StatBox label="输出 token" value={compact(m.outputTokens)} />
            <StatBox label="流式请求" value={m.streamCount || 0} />
            <StatBox label="非流式" value={m.nonStreamCount || 0} />
            <StatBox label="中断流" value={m.interruptedStreams || 0} />
          </div>
        </Card>
      </div>

      <Card title="错误分布" icon={AlertTriangle} note="按错误消息聚合">
        {errorEntries.length === 0 ? (
          <p className="mutedText">暂无错误</p>
        ) : (
          <div className="errorDist">
            {errorEntries.slice(0, 10).map(([msg, count]) => (
              <div key={msg} className="errorDistRow">
                <span className="errorCode">{extractStatusCode(msg) || 'ERR'}</span>
                <span className="errorMsg" title={msg}>{msg}</span>
                <strong className="errorCount">{count}</strong>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="gridTwo">
        <Card title="最近错误" icon={ListChecks} note="最近 20 条请求错误">
          {recentErrors.length === 0 ? (
            <p className="mutedText">暂无错误</p>
          ) : (
            <div className="recentErrorList">
              {recentErrors.map((e, i) => (
                <div key={`${e.at}-${i}`} className="recentErrorRow">
                  <time>{new Date(e.at).toLocaleTimeString('zh-CN', { hour12: false })}</time>
                  <span className="errorCode small">{extractStatusCode(e.error) || 'ERR'}</span>
                  <span className="apiTag">{m.byApi?.[e.apiId]?.name || e.apiId}</span>
                  <p>{e.error}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="按 API 统计" icon={Server} note="各 API 的发送与成败">
          {byApi.length === 0 ? (
            <p className="mutedText">暂无数据</p>
          ) : (
            <div className="apiStatList">
              {byApi.map(([id, stat]) => (
                <div key={id} className="apiStatRow">
                  <div className="apiStatName">
                    <strong>{stat.name || id}</strong>
                    <span className="protoTag">{stat.protocol}</span>
                  </div>
                  <div className="apiStatNums">
                    <span>发送 {stat.sent || 0}</span>
                    <span className="okText">成功 {stat.succeeded || 0}</span>
                    <span className="failText">失败 {stat.failed || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div className={`statBox ${accent ? 'accent' : ''}`}>
      <span className="statBoxLabel">{label}</span>
      <strong className="statBoxValue">{value}</strong>
    </div>
  );
}

function buildChartData(timeline) {
  const buckets = new Map();
  for (const event of timeline) {
    const label = new Date(event.at).toLocaleTimeString('zh-CN', {
      minute: '2-digit',
      second: '2-digit'
    });
    const bucket = buckets.get(label) || { label, success: 0, error: 0 };
    if (event.type === 'success') bucket.success += 1;
    if (event.type === 'error') bucket.error += 1;
    buckets.set(label, bucket);
  }
  return Array.from(buckets.values()).slice(-40);
}
