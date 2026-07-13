const SAMPLE_SIZE = 1200;

export function resolveBodySamples(preview) {
  if (preview?.bodySamples?.start || preview?.bodySamples?.middle || preview?.bodySamples?.end) {
    return preview.bodySamples;
  }
  const text = typeof preview?.bodyText === 'string' ? preview.bodyText : '';
  if (!text) return null;
  const middleStart = Math.max(0, Math.floor(text.length / 2) - Math.floor(SAMPLE_SIZE / 2));
  return {
    start: text.slice(0, SAMPLE_SIZE),
    middle: text.slice(middleStart, middleStart + SAMPLE_SIZE),
    end: text.slice(Math.max(0, text.length - SAMPLE_SIZE))
  };
}

export function normalizePromptPreview(preview) {
  const samples = resolveBodySamples(preview);
  if (!samples) return preview;
  const { bodyText: _bodyText, ...rest } = preview;
  return { ...rest, bodySamples: samples };
}

export function buildLocalQualityReport(prompts = []) {
  const structureCounts = new Map();
  const archetypes = new Set();
  for (const item of prompts) {
    const structure = item.structureId || item.structure || 'legacy';
    structureCounts.set(structure, (structureCounts.get(structure) || 0) + 1);
    archetypes.add(item.archetype || item.value || item.theme || '未分类');
  }
  const maximum = Math.max(0, ...structureCounts.values());
  return {
    source: 'local',
    total: prompts.length,
    archetypes: archetypes.size,
    structures: structureCounts.size,
    maxStructureShare: prompts.length ? maximum / prompts.length : 0,
    maxPrefixSimilarity: 0,
    repeatedPhrases: []
  };
}
