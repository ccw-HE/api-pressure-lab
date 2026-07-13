// 左侧导航：真实页面切换入口，一个按钮对应一个页面（非锚点跳转）。
import React from 'react';
import { LayoutDashboard, PlugZap, Gauge, Library, Activity, History, Waves } from 'lucide-react';

export const PAGES = [
  { key: 'overview', label: '总览', icon: LayoutDashboard },
  { key: 'apis', label: 'API 配置', icon: PlugZap },
  { key: 'load', label: '负载与代理', icon: Gauge },
  { key: 'prompts', label: 'Prompt 库', icon: Library },
  { key: 'monitor', label: '运行监控', icon: Activity },
  { key: 'history', label: '历史与错误', icon: History }
];

export default function Sidebar({ current, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark">
          <Waves size={20} />
        </div>
        <div className="brandText">
          <strong>API Pressure Lab</strong>
          <span>本机压测控制台</span>
        </div>
      </div>
      <nav className="nav">
        {PAGES.map((page) => {
          const Icon = page.icon;
          const active = current === page.key;
          return (
            <button
              key={page.key}
              type="button"
              className={`navItem${active ? ' active' : ''}`}
              onClick={() => onNavigate(page.key)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{page.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
