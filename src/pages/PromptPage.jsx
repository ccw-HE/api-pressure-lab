import React, { useMemo, useState } from 'react';
import { BarChart3, Eye, FileText, Layers, Repeat, Shuffle, Sliders } from 'lucide-react';
import { useStore, useConfigUpdaters } from '../state/store.jsx';
import { fetchPromptPreview, fetchPromptQuality } from '../api/client.js';
import { Card, Page } from '../components/Field.jsx';
import DualRangeSlider from '../components/DualRangeSlider.jsx';
import WeightSliders from '../components/WeightSliders.jsx';
import { compact, tierLabel } from '../utils/format.js';
import { buildLocalQualityReport, normalizePromptPreview, resolveBodySamples } from '../utils/promptPreview.js';

const ALL = 'all';

export default function PromptPage() {
  const { config, prompts } = useStore();
  const { updatePrompt } = useConfigUpdaters();
  const prompt = config?.prompt || {};
  const strategy = prompt.strategy || 'weight';
  const [filters, setFilters] = useState({ tier: ALL, archetype: ALL, format: ALL, structureId: ALL });
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewTab, setPreviewTab] = useState('summary');
  const [previewError, setPreviewError] = useState('');
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(false);

  const facets = useMemo(() => ({
    archetypes: unique(prompts, 'archetype'),
    formats: unique(prompts, 'format'),
    structures: unique(prompts, 'structureId')
  }), [prompts]);

  const filtered = useMemo(() => prompts.filter((item) =>
    Object.entries(filters).every(([key, value]) => value === ALL || item[key] === value)
  ), [prompts, filters]);

  async function loadPreview(id, full = false) {
    setLoading(true);
    setPreviewError('');
    try {
      const firstApi = config?.apis?.[0];
      const data = await fetchPromptPreview(id, {
        apiId: firstApi?.id,
        protocol: firstApi?.protocol,
        full: full ? 'true' : ''
      });
      setPreview(normalizePromptPreview(data));
      setSelectedId(id);
    } catch (error) {
      setPreviewError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  function randomPick() {
    if (!filtered.length) return;
    const item = filtered[Math.floor(Math.random() * filtered.length)];
    loadPreview(item.id, previewTab === 'content');
  }

  async function loadQuality() {
    setLoading(true);
    try {
      setQuality(await fetchPromptQuality());
    } catch {
      setQuality(buildLocalQualityReport(prompts));
    } finally {
      setLoading(false);
    }
  }

  const expected = prompt.expectedOutput || { min: 1500, max: 3000, step: 500 };
  const scroll = prompt.scroll || { incrementMin: 3000, incrementMax: 5000 };

  return (
    <Page title="Prompt 实验库" subtitle="多任务类型、多结构和可复现内容，用于模拟更接近真实流量的长上下文请求。">
      <div className="promptCommandBar">
        <div className="promptLibraryStats">
          <span><strong>{prompts.length}</strong> 条样本</span>
          <span><strong>{facets.archetypes.length}</strong> 类任务</span>
          <span><strong>{facets.structures.length}</strong> 种结构</span>
          <span><strong>{filtered.length}</strong> 条命中</span>
        </div>
        <div className="promptCommandActions">
          <button type="button" className="ghostBtn" onClick={randomPick} disabled={!filtered.length || loading}>
            <Shuffle size={15} />随机抽取
          </button>
          <button type="button" className="ghostBtn" onClick={loadQuality} disabled={loading}>
            <BarChart3 size={15} />重复度报告
          </button>
        </div>
      </div>

      <Card className="strategyControlCard">
        <div className="strategyTabs compactTabs">
          <StrategyButton active={strategy === 'weight'} icon={Sliders} title="权重模式" note="按四个长度分区抽样" onClick={() => updatePrompt({ strategy: 'weight' })} />
          <StrategyButton active={strategy === 'scroll'} icon={Repeat} title="滚动模式" note="模拟上下文逐轮增长" onClick={() => updatePrompt({ strategy: 'scroll' })} />
        </div>
        <div className="strategyInlineConfig">
          {strategy === 'weight' ? (
            <WeightSliders weights={prompt.weights} onChange={(weights) => updatePrompt({ weights })} />
          ) : (
            <DualRangeSlider min={scroll.incrementMin} max={scroll.incrementMax} step={500} absMin={0} absMax={200000} sliderStep={500} showStepInput={false} onChange={(next) => updatePrompt({ scroll: { ...prompt.scroll, incrementMin: next.min, incrementMax: next.max } })} />
          )}
          <div className="expectedOutputControl">
            <span>期望输出 token</span>
            <DualRangeSlider min={expected.min} max={expected.max} step={expected.step} absMin={0} sliderStep={500} onChange={(next) => updatePrompt({ expectedOutput: next })} />
          </div>
        </div>
      </Card>

      {quality && (
        <div className="qualityStrip">
          <span>结构最大占比 <strong>{Math.round(quality.maxStructureShare * 100)}%</strong></span>
          <span>最高句段相似度 <strong>{Math.round(quality.maxPrefixSimilarity * 100)}%</strong></span>
          <span>重复短语 <strong>{quality.repeatedPhrases.length}</strong></span>
        </div>
      )}

      <div className="promptWorkbench">
        <aside className="promptFilters" aria-label="Prompt 筛选">
          <h2>筛选条件</h2>
          <Filter label="长度分区" value={filters.tier} options={['2-5w', '5-10w', '10-15w', '15-20w']} onChange={(tier) => setFilters((old) => ({ ...old, tier }))} format={tierLabel} />
          <Filter label="任务类型" value={filters.archetype} options={facets.archetypes} onChange={(archetype) => setFilters((old) => ({ ...old, archetype }))} />
          <Filter label="文体" value={filters.format} options={facets.formats} onChange={(format) => setFilters((old) => ({ ...old, format }))} />
          <Filter label="结构" value={filters.structureId} options={facets.structures} onChange={(structureId) => setFilters((old) => ({ ...old, structureId }))} />
          <button type="button" className="textBtn" onClick={() => setFilters({ tier: ALL, archetype: ALL, format: ALL, structureId: ALL })}>清除筛选</button>
        </aside>

        <section className="promptResultList" aria-label="Prompt 列表">
          <div className="promptListHead"><span>样本目录</span><strong>{filtered.length}</strong></div>
          <div className="promptRows">
            {filtered.map((item) => (
              <button type="button" key={item.id} className={`promptRow ${selectedId === item.id ? 'active' : ''}`} onClick={() => loadPreview(item.id, previewTab === 'content')}>
                <div><strong>{item.title}</strong><span>{item.archetype} · {item.format}</span></div>
                <div className="promptRowMeta"><span>{tierLabel(item.tier)}</span><span>{compact(item.estimatedTokens)} token</span><span>{item.complexity}</span></div>
              </button>
            ))}
          </div>
        </section>

        <aside className="promptInspector" aria-label="Prompt 检查器">
          <div className="inspectorHead"><Eye size={16} /><strong>样本检查器</strong></div>
          {!preview ? <div className="inspectorEmpty"><Layers size={24} /><p>选择一条样本查看内容结构和请求预览。</p></div> : (
            <>
              <div className="inspectorTitle"><strong>{preview.meta?.title}</strong><span>{preview.meta?.structure}</span></div>
              <div className="inspectorTabs">
                {['summary', 'content', 'request'].map((tab) => <button type="button" key={tab} className={previewTab === tab ? 'active' : ''} onClick={() => setPreviewTab(tab)}>{tab === 'summary' ? '内容摘要' : tab === 'content' ? '正文抽样' : '请求 JSON'}</button>)}
              </div>
              {previewTab === 'summary' && <div className="inspectorBody"><p>{preview.summary}</p><dl><dt>任务</dt><dd>{preview.meta?.archetype}</dd><dt>文体</dt><dd>{preview.meta?.format}</dd><dt>语言</dt><dd>{preview.meta?.languageMix}</dd><dt>噪声</dt><dd>{preview.meta?.noiseLevel}</dd></dl></div>}
              {previewTab === 'content' && <ContentSamples preview={preview} loading={loading} onLoad={() => loadPreview(selectedId, true)} />}
              {previewTab === 'request' && <pre className="previewPre inspectorCode">{JSON.stringify(preview.requestPreview, null, 2)}</pre>}
            </>
          )}
          {previewError && <div className="inlineError">{previewError}</div>}
        </aside>
      </div>
    </Page>
  );
}

function unique(items, key) { return [...new Set(items.map((item) => item[key]).filter(Boolean))]; }
function StrategyButton({ active, icon: Icon, title, note, onClick }) { return <button type="button" className={`strategyTab ${active ? 'active' : ''}`} onClick={onClick}><Icon size={16} /><div><strong>{title}</strong><span>{note}</span></div></button>; }
function Filter({ label, value, options, onChange, format = (value) => value }) { return <label className="filterField"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value={ALL}>全部</option>{options.map((option) => <option key={option} value={option}>{format(option)}</option>)}</select></label>; }
function ContentSamples({ preview, loading, onLoad }) { const samples = resolveBodySamples(preview); if (!samples) return <div className="inspectorEmpty"><FileText size={22} /><p>完整正文较长，按需生成开头、中段和结尾抽样。</p><button type="button" className="ghostBtn" onClick={onLoad} disabled={loading}>{loading ? '生成中...' : '生成正文抽样'}</button></div>; return <div className="sampleStack">{Object.entries(samples).map(([key, value]) => <section key={key}><h4>{key === 'start' ? '开头' : key === 'middle' ? '中段' : '结尾'}</h4><pre>{value}</pre></section>)}</div>; }
