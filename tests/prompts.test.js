import { describe, expect, it } from 'vitest';
import {
  getPromptCatalog,
  getSortedPromptCatalog,
  buildPromptById,
  getPromptQualityReport,
  generateStoryText,
  tierOfTokens,
  PROMPT_TIERS,
  PROMPT_MAX_TOKENS
} from '../server/prompts.js';
import { validatePromptText } from '../server/safety.js';

describe('prompt catalog (100 条 4 分区)', () => {
  it('固定为 100 条，分区计数为 20/30/30/20', () => {
    const catalog = getPromptCatalog();
    expect(catalog).toHaveLength(100);
    const byTier = {};
    for (const item of catalog) {
      byTier[item.tier] = (byTier[item.tier] || 0) + 1;
    }
    expect(byTier).toEqual({ '2-5w': 20, '5-10w': 30, '10-15w': 30, '15-20w': 20 });
  });

  it('estimatedTokens 均为整齐的 500 阶梯值且落在分区范围内', () => {
    for (const item of getPromptCatalog()) {
      expect(item.estimatedTokens % 500).toBe(0);
      const tier = PROMPT_TIERS.find((t) => t.key === item.tier);
      expect(item.estimatedTokens).toBeGreaterThanOrEqual(tier.minTokens);
      expect(item.estimatedTokens).toBeLessThanOrEqual(tier.maxTokens);
    }
  });

  it('每条 Prompt 具备全部 9 项元信息', () => {
    const requiredKeys = [
      'id',
      'title',
      'estimatedTokens',
      'summary',
      'requestHeadersPreview',
      'requestBodyJsonPreview',
      'requestParamsPreview',
      'structure',
      'safetyStatus'
    ];
    for (const item of getPromptCatalog()) {
      for (const key of requiredKeys) {
        expect(item[key], `缺少元信息 ${key}`).toBeDefined();
      }
    }
  });

  it('目录包含多维内容元数据，且每个分区至少覆盖 6 种任务类型', () => {
    const requiredKeys = [
      'archetype',
      'format',
      'structureId',
      'complexity',
      'noiseLevel',
      'languageMix',
      'contentFingerprint'
    ];
    for (const item of getPromptCatalog()) {
      for (const key of requiredKeys) expect(item[key]).toBeTruthy();
    }
    for (const tier of PROMPT_TIERS) {
      const archetypes = new Set(
        getPromptCatalog().filter((item) => item.tier === tier.key).map((item) => item.archetype)
      );
      expect(archetypes.size).toBeGreaterThanOrEqual(6);
    }
  });

  it('同一个 promptId 确定性生成，且正文没有固定段落编号', () => {
    const id = getPromptCatalog()[12].id;
    const first = buildPromptById(id, { outputTokens: 2000 }).text;
    const second = buildPromptById(id, { outputTokens: 2000 }).text;
    expect(second).toBe(first);
    expect(first).not.toMatch(/第[一二三四五六七八九十\d]+段/);
  });

  it('全库正文没有段落编号或旧模板句式', () => {
    for (const item of getPromptCatalog()) {
      const text = generateStoryText(item.id, 3000);
      expect(text, item.id).not.toMatch(/第[一二三四五六七八九十百千万\d]+段/);
      expect(text, item.id).not.toContain('段，关于');
      expect(text, item.id).not.toContain('在接下来的记录中');
    }
  });

  it('不存在覆盖大量 Prompt 的固定长句模板', () => {
    const sentenceOwners = new Map();
    for (const item of getPromptCatalog()) {
      const sentences = new Set(
        generateStoryText(item.id, 3000)
          .split(/[。！？\n]+/)
          .map((sentence) => sentence.trim())
          .filter((sentence) => sentence.length >= 24)
      );
      for (const sentence of sentences) {
        if (!sentenceOwners.has(sentence)) sentenceOwners.set(sentence, new Set());
        sentenceOwners.get(sentence).add(item.id);
      }
    }
    const common = [...sentenceOwners.entries()]
      .filter(([, owners]) => owners.size > 12)
      .map(([sentence, owners]) => ({ sentence, count: owners.size }));
    expect(common).toEqual([]);
  });

  it('结构蓝图占比受控，目录前缀相似度低于阈值', () => {
    const report = getPromptQualityReport();
    expect(report.maxStructureShare).toBeLessThanOrEqual(0.15);
    expect(report.maxPrefixSimilarity).toBeLessThan(0.8);
    expect(report.repeatedPhrases).toEqual([]);
  });

  it('有序库按 estimatedTokens 升序排列', () => {
    const sorted = getSortedPromptCatalog();
    expect(sorted).toHaveLength(100);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].estimatedTokens).toBeGreaterThanOrEqual(sorted[i - 1].estimatedTokens);
    }
  });

  it('tierOfTokens 正确映射 token 到分区', () => {
    expect(tierOfTokens(30000)).toBe('2-5w');
    expect(tierOfTokens(80000)).toBe('5-10w');
    expect(tierOfTokens(120000)).toBe('10-15w');
    expect(tierOfTokens(190000)).toBe('15-20w');
    expect(tierOfTokens(PROMPT_MAX_TOKENS + 50000)).toBe('15-20w');
  });

  it('生成正文安全且长度合理', () => {
    const sample = buildPromptById(getPromptCatalog()[0].id, { outputTokens: 2000 });
    expect(sample.text.length).toBeGreaterThan(10000);
    expect(validatePromptText(sample.text).safe).toBe(true);
  });
});
