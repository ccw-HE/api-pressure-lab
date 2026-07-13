import { describe, expect, it } from 'vitest';
import { buildLocalQualityReport, resolveBodySamples } from '../src/utils/promptPreview.js';

describe('prompt preview body samples', () => {
  it('直接使用新版后端返回的 bodySamples', () => {
    const samples = { start: '开头', middle: '中段', end: '结尾' };
    expect(resolveBodySamples({ bodySamples: samples })).toEqual(samples);
  });

  it('兼容旧后端的 bodyText，并生成首中尾抽样', () => {
    const bodyText = Array.from({ length: 5000 }, (_, index) => String(index % 10)).join('');
    const samples = resolveBodySamples({ bodyText });

    expect(samples.start).toBe(bodyText.slice(0, 1200));
    expect(samples.middle).toHaveLength(1200);
    expect(samples.end).toBe(bodyText.slice(-1200));
  });

  it('没有正文时返回 null', () => {
    expect(resolveBodySamples({})).toBeNull();
  });

  it('旧后端没有质量接口时可从目录生成本地报告', () => {
    const report = buildLocalQualityReport([
      { structureId: 'linear', archetype: '长文总结' },
      { structureId: 'dialogue', archetype: '多轮对话记录' }
    ]);
    expect(report.total).toBe(2);
    expect(report.maxStructureShare).toBe(0.5);
    expect(report.source).toBe('local');
  });
});
