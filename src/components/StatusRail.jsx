// 右侧状态栏：所有页面常驻，严格只显示计划书 §5 规定的 6 项：
// 1 运行状态 2 运行时间 3 实际 RPM 4 成功/失败 5 当前 Prompt 分区 6 停止/暂停/继续
// 不允许再塞入 P95、并发、错误分布等（全部归入运行监控页面）。
import React, { useState } from 'react';
import { Activity, ChevronDown, Clock3, CheckCircle2, Layers, Pause, Play, Square } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { formatDuration, statusText, tierLabel } from '../utils/format.js';

export default function StatusRail() {
  const { metrics, config, runAction, streamConnected } = useStore();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const status = metrics?.status || 'idle';
  const running = status === 'running';
  const paused = status === 'paused';
  const canStart = ['idle', 'stopped', 'completed'].includes(status);
  const currentTier = metrics?.currentTier;
  const primaryClass = running ? 'pause' : paused ? 'resume' : 'start';
  const primaryLabel = running ? '暂停' : paused ? '继续' : '开始';
  const PrimaryIcon = running ? Pause : Play;

  return (
    <aside className={`statusRail ${mobileExpanded ? 'mobileExpanded' : 'mobileCollapsed'}`}>
      {/* 1. 运行状态 */}
      <div className="statusHead">
        <span className="statusHeadLabel">运行状态</span>
        <span className={`statusBadge ${status}`}>
          <span className="statusDot" />
          {statusText(status)}
        </span>
        <span className={`streamState ${streamConnected ? 'online' : 'offline'}`}>
          {streamConnected ? '实时连接正常' : '实时连接重试中'}
        </span>
        <button type="button" className="railToggle" onClick={() => setMobileExpanded((value) => !value)} aria-expanded={mobileExpanded}>
          {mobileExpanded ? '收起详情' : '展开详情'}
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="statusItems">
        {/* 2. 运行时间 */}
        <StatusItem icon={Clock3} label="运行时间" value={formatDuration(metrics?.elapsedMs || 0)} />
        {/* 3. 实际 RPM */}
        <StatusItem
          icon={Activity}
          label="实际 RPM"
          value={metrics?.actualRpm ?? 0}
          hint={`计划 ${config?.load?.rpm ?? '-'}`}
        />
        {/* 4. 成功 / 失败 */}
        <StatusItem
          icon={CheckCircle2}
          label="成功 / 失败"
          value={`${metrics?.succeeded ?? 0} / ${metrics?.failed ?? 0}`}
        />
        {/* 5. 当前 Prompt 分区 */}
        <StatusItem
          icon={Layers}
          label="当前 Prompt 分区"
          value={currentTier ? tierLabel(currentTier) : '—'}
        />
      </div>

      {/* 6. 开始 / 停止 / 暂停 / 继续 */}
      <div className="statusControls">
        <button
          type="button"
          className={`ctrlBtn ${primaryClass}`}
          onClick={() => {
            if (paused) runAction('resume');
            else if (running) runAction('pause');
            else runAction('start');
          }}
          disabled={!running && !paused && !canStart}
        >
          <PrimaryIcon size={15} />
          {primaryLabel}
        </button>
        <button
          type="button"
          className="ctrlBtn stop"
          onClick={() => runAction('stop')}
          disabled={!running && !paused}
        >
          <Square size={15} />
          停止
        </button>
      </div>
    </aside>
  );
}

function StatusItem({ icon: Icon, label, value, hint }) {
  return (
    <div className="statusItem">
      <span className="statusItemIcon">
        <Icon size={16} />
      </span>
      <div className="statusItemBody">
        <span className="statusItemLabel">{label}</span>
        <strong className="statusItemValue">{value}</strong>
        {hint ? <em className="statusItemHint">{hint}</em> : null}
      </div>
    </div>
  );
}
