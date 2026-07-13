// 应用壳（计划书 §4、§14）：三栏布局 = 左侧 Sidebar + 中间 Workspace + 右侧 StatusRail。
// 左侧是真实的页面切换入口（非锚点导航），中间一次只渲染当前选中页面。
import React, { lazy, Suspense, useState } from 'react';
import { StoreProvider, useStore } from './state/store.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusRail from './components/StatusRail.jsx';
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const ApiConfigPage = lazy(() => import('./pages/ApiConfigPage.jsx'));
const LoadPage = lazy(() => import('./pages/LoadPage.jsx'));
const PromptPage = lazy(() => import('./pages/PromptPage.jsx'));
const MonitorPage = lazy(() => import('./pages/MonitorPage.jsx'));
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));

// 页面注册表：id → 组件。Sidebar 与此共享同一份 id 定义。
const PAGES = {
  overview: OverviewPage,
  apis: ApiConfigPage,
  load: LoadPage,
  prompts: PromptPage,
  monitor: MonitorPage,
  history: HistoryPage
};

function Shell() {
  const { config, metrics, bootError } = useStore();
  // 当前页面 id，默认「总览」。这是真实页面切换的唯一状态源。
  const [page, setPage] = useState('overview');

  if (bootError) {
    return (
      <div className="bootScreen">
        <div className="bootCard error">
          <strong>启动失败</strong>
          <p>{bootError}</p>
        </div>
      </div>
    );
  }

  if (!config || !metrics) {
    return (
      <div className="bootScreen">
        <div className="bootCard">
          <span className="bootSpinner" />
          <strong>正在启动 API Pressure Lab…</strong>
        </div>
      </div>
    );
  }

  const CurrentPage = PAGES[page] || OverviewPage;

  return (
    <div className="appShell">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="workspace" id="main-content">
        <Suspense fallback={<div className="pageLoading">正在装载工作区...</div>}>
          <CurrentPage onNavigate={setPage} />
        </Suspense>
      </main>
      <StatusRail />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
