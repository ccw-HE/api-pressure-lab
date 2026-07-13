// 全局状态：config / prompts / metrics(SSE) / runs + 保存与运行控制动作。
// 通过 Context 提供给三栏应用壳与各页面，避免跨页面 prop drilling。
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  fetchConfig,
  fetchPrompts,
  fetchRunSnapshot,
  fetchRuns,
  clearRunLogs,
  saveConfigToServer,
  runControl,
  openMetricsStream
} from '../api/client.js';

const StoreContext = createContext(null);

const LOCAL_CONFIG_KEY = 'api-pressure-lab-config';
const LOCAL_METRICS_KEY = 'api-pressure-lab-metrics';

function readLocal(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 浏览器存储可能被禁用，忽略。
  }
}

function clearLocal(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 忽略
  }
}

function hasMetricTotals(metrics) {
  return Boolean(
    metrics &&
      ((metrics.elapsedMs || 0) > 0 ||
        (metrics.sent || 0) > 0 ||
        (metrics.succeeded || 0) > 0 ||
        (metrics.failed || 0) > 0 ||
        (metrics.inputTokens || 0) > 0 ||
        (metrics.outputTokens || 0) > 0)
  );
}

function isConfigObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeConfigObject(serverValue, localValue) {
  return {
    ...(isConfigObject(serverValue) ? serverValue : {}),
    ...(isConfigObject(localValue) ? localValue : {})
  };
}

// 保存后用本地明文密钥覆盖服务端返回的脱敏 key，避免界面丢失已填写的 key。
function preserveLocalSecrets(serverConfig, localConfig) {
  const localById = new Map((localConfig?.apis || []).map((api) => [api.id, api]));
  return {
    ...serverConfig,
    apis: (serverConfig.apis || []).map((api) => {
      const local = localById.get(api.id);
      if (local?.apiKey && !local.apiKey.startsWith('sk-...')) {
        return { ...api, apiKey: local.apiKey };
      }
      return api;
    })
  };
}

export function mergeClientConfig(serverConfig, localConfig) {
  if (!isConfigObject(localConfig)) {
    return serverConfig;
  }
  const serverPrompt = isConfigObject(serverConfig.prompt) ? serverConfig.prompt : {};
  const localPrompt = isConfigObject(localConfig.prompt) ? localConfig.prompt : {};
  const prompt = {
    ...serverPrompt,
    ...localPrompt,
    expectedOutput: mergeConfigObject(serverPrompt.expectedOutput, localPrompt.expectedOutput),
    weights: mergeConfigObject(serverPrompt.weights, localPrompt.weights),
    scroll: mergeConfigObject(serverPrompt.scroll, localPrompt.scroll)
  };
  const serverApis = Array.isArray(serverConfig.apis) ? serverConfig.apis : [];
  const localApis = Array.isArray(localConfig.apis) ? localConfig.apis : null;

  return {
    ...serverConfig,
    ...localConfig,
    proxy: mergeConfigObject(serverConfig.proxy, localConfig.proxy),
    load: mergeConfigObject(serverConfig.load, localConfig.load),
    prompt,
    output: mergeConfigObject(serverConfig.output, localConfig.output),
    apis: localApis?.length
      ? localApis.slice(0, 10).map((api, index) => {
          const localApi = isConfigObject(api) ? api : {};
          const serverApi =
            serverApis.find((item) => isConfigObject(item) && item.id === localApi.id) ||
            serverApis[index] ||
            serverApis[0] ||
            {};
          return { ...serverApi, ...localApi };
        })
      : serverApis
  };
}

export function StoreProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [runs, setRuns] = useState([]);
  const [message, setMessage] = useState('');
  const [bootError, setBootError] = useState('');
  const [saving, setSaving] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const configRef = useRef(config);
  const lastMetricsStatusRef = useRef('');
  const metricsStorageTimerRef = useRef(null);
  configRef.current = config;

  useEffect(() => {
    let disposed = false;
    async function boot() {
      try {
        const [serverConfig, promptList, snapshot] = await Promise.all([
          fetchConfig(),
          fetchPrompts(),
          fetchRunSnapshot()
        ]);
        if (disposed) return;
        setConfig(mergeClientConfig(serverConfig, readLocal(LOCAL_CONFIG_KEY)));
        setPrompts(promptList);
        const localMetrics = readLocal(LOCAL_METRICS_KEY);
        const initialMetrics = hasMetricTotals(snapshot) ? snapshot : localMetrics || snapshot;
        lastMetricsStatusRef.current = initialMetrics?.status || '';
        setMetrics(initialMetrics);
        fetchRuns()
          .then((runList) => {
            if (!disposed) setRuns(runList);
          })
          .catch(() => {
            if (!disposed) setRuns([]);
          });
      } catch (error) {
        if (!disposed) setBootError(error.message || String(error));
      }
    }
    boot();
    const closeStream = openMetricsStream((next) => {
      const previousStatus = lastMetricsStatusRef.current;
      lastMetricsStatusRef.current = next.status || '';
      if (!hasMetricTotals(next) && next.status === 'idle') {
        const local = readLocal(LOCAL_METRICS_KEY);
        if (local) {
          setMetrics(local);
          return;
        }
      }
      setMetrics(next);
      if (metricsStorageTimerRef.current) clearTimeout(metricsStorageTimerRef.current);
      metricsStorageTimerRef.current = setTimeout(() => writeLocal(LOCAL_METRICS_KEY, next), 1000);
      if (
        ['completed', 'stopped'].includes(next.status) &&
        ['running', 'paused'].includes(previousStatus)
      ) {
        fetchRuns().then(setRuns).catch(() => {});
      }
    }, setStreamConnected);
    return () => {
      disposed = true;
      if (metricsStorageTimerRef.current) clearTimeout(metricsStorageTimerRef.current);
      closeStream();
    };
  }, []);

  const saveConfig = useCallback(async () => {
    const current = configRef.current;
    if (!current) return;
    setSaving(true);
    setMessage('');
    writeLocal(LOCAL_CONFIG_KEY, current);
    try {
      const saved = await saveConfigToServer(current);
      setConfig(preserveLocalSecrets(saved, current));
      setMessage('配置已保存');
    } catch (error) {
      setMessage(`已保存到浏览器，本地文件保存失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const doRunAction = useCallback(async (action) => {
    setMessage('');
    const current = configRef.current;
    const payload = action === 'start' ? { config: current } : {};
    if (action === 'start') writeLocal(LOCAL_CONFIG_KEY, current);
    try {
      const result = await runControl(action, payload);
      lastMetricsStatusRef.current = result.status || '';
      setMetrics(result);
      if (action === 'reset-stats') clearLocal(LOCAL_METRICS_KEY);
      else writeLocal(LOCAL_METRICS_KEY, result);
      if (result.saveWarning) setMessage(result.saveWarning);
      if (['start', 'stop', 'clear'].includes(action)) {
        fetchRuns().then(setRuns).catch(() => {});
      }
    } catch (error) {
      setMessage(error.message || String(error));
    }
  }, []);

  const clearLogs = useCallback(async () => {
    setMessage('');
    try {
      const result = await clearRunLogs();
      setMetrics(result.metrics);
      setRuns(result.runs || []);
      clearLocal(LOCAL_METRICS_KEY);
      setMessage(`已清除 ${result.deleted || 0} 个历史日志`);
    } catch (error) {
      setMessage(error.message || String(error));
    }
  }, []);

  const refreshRuns = useCallback(() => {
    fetchRuns().then(setRuns).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      config,
      setConfig,
      prompts,
      metrics,
      runs,
      message,
      setMessage,
      bootError,
      saving,
      streamConnected,
      saveConfig,
      runAction: doRunAction,
      clearLogs,
      refreshRuns
    }),
    [config, prompts, metrics, runs, message, bootError, saving, streamConnected, saveConfig, doRunAction, clearLogs, refreshRuns]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

// 便捷更新工具：局部更新 config 的子块。
export function useConfigUpdaters() {
  const { setConfig } = useStore();
  return useMemo(
    () => ({
      updateLoad: (patch) => setConfig((old) => ({ ...old, load: { ...old.load, ...patch } })),
      updateProxy: (patch) => setConfig((old) => ({ ...old, proxy: { ...old.proxy, ...patch } })),
      updateOutput: (patch) => setConfig((old) => ({ ...old, output: { ...old.output, ...patch } })),
      updatePrompt: (patch) => setConfig((old) => ({ ...old, prompt: { ...old.prompt, ...patch } })),
      updateExpectedOutput: (patch) =>
        setConfig((old) => ({
          ...old,
          prompt: { ...old.prompt, expectedOutput: { ...old.prompt.expectedOutput, ...patch } }
        })),
      updateWeights: (weights) =>
        setConfig((old) => ({ ...old, prompt: { ...old.prompt, weights } })),
      updateScroll: (patch) =>
        setConfig((old) => ({
          ...old,
          prompt: { ...old.prompt, scroll: { ...old.prompt.scroll, ...patch } }
        })),
      updateApi: (index, patch) =>
        setConfig((old) => ({
          ...old,
          apis: old.apis.map((api, i) => (i === index ? { ...api, ...patch } : api))
        })),
      addApi: () =>
        setConfig((old) => ({
          ...old,
          apis: [...old.apis, emptyApi(old.apis.length)].slice(0, 10)
        })),
      removeApi: (index) =>
        setConfig((old) =>
          old.apis.length <= 1 ? old : { ...old, apis: old.apis.filter((_, i) => i !== index) }
        )
    }),
    [setConfig]
  );
}

export function emptyApi(index) {
  return {
    id: `api-${Date.now()}-${index}`,
    name: `API ${index + 1}`,
    enabled: true,
    protocol: 'openai',
    baseUrl: '',
    path: '',
    apiKey: '',
    model: '',
    stream: true,
    useProxy: true
  };
}
