import { buildUserPrompt, validatePromptText } from './safety.js';

export const PROMPT_TIERS = [
  { key: '2-5w', label: '2-5w', minTokens: 20000, maxTokens: 50000, count: 20 },
  { key: '5-10w', label: '5-10w', minTokens: 50000, maxTokens: 100000, count: 30 },
  { key: '10-15w', label: '10-15w', minTokens: 100000, maxTokens: 150000, count: 30 },
  { key: '15-20w', label: '15-20w', minTokens: 150000, maxTokens: 200000, count: 20 }
];

export const PROMPT_MAX_TOKENS = 200000;
const CHARS_PER_TOKEN = 1.65;

const ARCHETYPES = [
  '长文总结', '多轮对话记录', '技术文档', '数据分析报告',
  '会议纪要', '代码与日志混合文本', '知识问答材料', '多文档整合'
];
const FORMATS = ['说明文', '叙事', '列表', '表格', '问答', '邮件', '日志', 'Markdown'];
const STRUCTURES = [
  { id: 'linear', label: '线性章节', blocks: ['heading', 'explanation', 'evidence', 'summary'] },
  { id: 'nested', label: '嵌套标题', blocks: ['heading', 'subheading', 'explanation', 'list', 'conclusion'] },
  { id: 'dialogue', label: '对话轮次', blocks: ['context', 'dialogue', 'note', 'dialogue', 'summary'] },
  { id: 'timeline', label: '时间线', blocks: ['heading', 'timeline', 'observation', 'decision', 'followup'] },
  { id: 'questions', label: '问题清单', blocks: ['context', 'question', 'answer', 'checklist', 'conclusion'] },
  { id: 'documents', label: '文档拼接', blocks: ['document', 'quote', 'memo', 'table', 'synthesis'] },
  { id: 'incident', label: '运行记录', blocks: ['log', 'code', 'observation', 'analysis', 'todo'] },
  { id: 'research', label: '研究摘录', blocks: ['abstract', 'evidence', 'table', 'counterpoint', 'conclusion'] }
];
const COMPLEXITIES = ['简单', '混合', '复杂'];
const NOISE_LEVELS = ['无', '轻度', '中度'];
const LANGUAGE_MIXES = ['中文', '中文为主混合', '中英混合'];
const TOPICS = [
  '本地接口稳定性复盘', '城市公共服务观察', '跨团队发布协作', '知识库迁移记录',
  '实验室设备维护', '远程团队工作日志', '社区空间使用调研', '数据管道异常分析',
  '开源项目版本规划', '客户支持问题归纳', '模型响应质量评估', '研发流程改进'
];
const LOCATIONS = ['北区机房', '沿海实验站', '远程协作组', '城市服务中心', '研发二组', '数据观测室', '夜间值班台', '社区工作坊', '产品验证组', '接口联调区'];
const PHASES = ['基线采集', '灰度观察', '容量复核', '故障回放', '版本验收', '交接整理', '周期复盘', '对照实验', '异常追踪', '结果归档'];
const ACTORS = ['值班工程师', '产品分析师', '测试负责人', '平台团队', '内容运营组', '现场协调员'];
const METRICS = ['响应时间', '吞吐量', '错误率', '资源占用', '完成率', '反馈密度'];

let catalogCache = null;
const storyCache = new Map();

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function tierTokenSteps(tier) {
  if (tier.count === 1) return [roundTo((tier.minTokens + tier.maxTokens) / 2, 500)];
  const span = tier.maxTokens - tier.minTokens;
  return Array.from({ length: tier.count }, (_, index) =>
    roundTo(tier.minTokens + (span * index) / (tier.count - 1), 500)
  );
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length) % items.length];
}

export function tierOfTokens(tokens) {
  const value = Number(tokens) || 0;
  return PROMPT_TIERS.find((tier) => value <= tier.maxTokens)?.key || PROMPT_TIERS.at(-1).key;
}

function buildBodyPreview(estimatedTokens) {
  return {
    model: '{model}',
    stream: true,
    max_tokens: '{globalMaxOutputTokens}',
    messages: [
      { role: 'system', content: '{systemInstruction}' },
      { role: 'user', content: `{正文约 ${estimatedTokens} token 的多结构中文材料}` }
    ]
  };
}

export function getPromptCatalog() {
  if (catalogCache) return catalogCache;
  const catalog = [];
  let globalIndex = 0;
  for (const tier of PROMPT_TIERS) {
    const tokenSteps = tierTokenSteps(tier);
    for (let index = 0; index < tier.count; index += 1) {
      const id = `prompt-${String(globalIndex + 1).padStart(3, '0')}`;
      const archetype = ARCHETYPES[globalIndex % ARCHETYPES.length];
      const format = FORMATS[(globalIndex * 3 + Math.floor(globalIndex / 8)) % FORMATS.length];
      const structure = STRUCTURES[(globalIndex * 5 + Math.floor(globalIndex / 16)) % STRUCTURES.length];
      const baseTopic = TOPICS[(globalIndex * 7) % TOPICS.length];
      const topic = `${baseTopic}（${LOCATIONS[globalIndex % LOCATIONS.length]}，${PHASES[Math.floor(globalIndex / LOCATIONS.length)]}）`;
      const complexity = COMPLEXITIES[Math.floor(globalIndex / 8) % COMPLEXITIES.length];
      const noiseLevel = NOISE_LEVELS[Math.floor(globalIndex / 5) % NOISE_LEVELS.length];
      const languageMix = LANGUAGE_MIXES[Math.floor(globalIndex / 3) % LANGUAGE_MIXES.length];
      const estimatedTokens = tokenSteps[index];
      const contentFingerprint = [archetype, format, structure.id, complexity, noiseLevel, languageMix, topic].join('|');
      catalog.push({
        id,
        title: `${topic} · ${archetype}`,
        theme: topic,
        value: archetype,
        tier: tier.key,
        estimatedTokens,
        archetype,
        format,
        structureId: structure.id,
        structureLabel: structure.label,
        complexity,
        noiseLevel,
        languageMix,
        contentFingerprint,
        summary: `以“${topic}”为内容背景，模拟${archetype}，主要采用${format}和${structure.label}结构。`,
        structure: `${structure.label} · ${format} · ${complexity}复杂度 · ${noiseLevel}噪声`,
        requestHeadersPreview: {
          'content-type': 'application/json',
          authorization: 'Bearer sk-****（脱敏，随协议变化）'
        },
        requestBodyJsonPreview: buildBodyPreview(estimatedTokens),
        requestParamsPreview: {
          model: '{model}',
          max_tokens: '{globalMaxOutputTokens}',
          stream: true,
          expectedOutputTokens: '{按正态分布抽样的期望输出 token}'
        },
        safetyStatus: '本地确定性合成 · 日常工作主题 · 完整正文不写入运行日志'
      });
      globalIndex += 1;
    }
  }
  catalogCache = catalog;
  return catalog;
}

export function getSortedPromptCatalog() {
  return [...getPromptCatalog()].sort((a, b) => a.estimatedTokens - b.estimatedTokens);
}

function renderBlock(type, context) {
  const { item, random, sequence } = context;
  const actor = pick(ACTORS, random);
  const metric = pick(METRICS, random);
  const topic = item.theme;
  const number = 17 + Math.floor(random() * 83);
  const blocks = {
    heading: `## ${topic}：${pick(['现状记录', '阶段复盘', '工作说明', '观察摘要'], random)}`,
    subheading: `### ${pick(['背景与边界', '执行过程', '证据与判断', '后续安排'], random)}`,
    context: `${actor}先说明${topic}的背景：材料来自连续记录，当前保留信息出现的先后顺序、尚未确认的假设和已核对事实，样本批次为 ${number}-${sequence + 1}。`,
    explanation: `围绕${topic}，团队把问题拆成可观察现象、影响范围和验证动作。${actor}负责核对${metric}，其余成员分别补充时间、环境和依赖变化。记录强调可复查性，每个判断都对应一个来源或下一步检查。`,
    evidence: `${topic}的现有证据显示，样本 ${number} 的${metric}与前一周期不同。${actor}没有直接把变化解释为故障，而是比较请求规模、配置差异和上游状态，将批次 ${sequence + 1} 中无法确认的部分留作复核。`,
    summary: `针对${topic}的小结是：流程仍可运行，当前差异集中在${metric}与${actor}负责的协作环节。下一轮按样本 ${number} 的条件缩小变量范围，保留原始记录后再做对照。`,
    dialogue: `测试负责人：先不要下结论，这组数据覆盖了哪些时段？\n${actor}：覆盖上午与傍晚，但中间有一次配置调整。\n记录员：我会把调整前后的结果分开，并补上缺失的环境信息。`,
    note: `备注：${topic}记录中的“大概没问题”只是${actor}在样本 ${number} 出现时的直觉，不作为最终判断；后续结论以重复测试和完整日志为准。`,
    list: `- 核对输入规模与目标值\n- 比较${metric}的周期变化\n- 标记无法复现的现象\n- 为下一轮测试保留单一变量`,
    timeline: `09:${String(sequence % 60).padStart(2, '0')} 收集基线数据\n11:${String((sequence * 3) % 60).padStart(2, '0')} 调整测试条件\n15:${String((sequence * 7) % 60).padStart(2, '0')} 复核异常样本\n18:${String((sequence * 11) % 60).padStart(2, '0')} 汇总未决事项`,
    observation: `${topic}的观察记录显示，同一操作在不同时间段的反馈并不完全一致。${actor}保留样本 ${number} 在批次 ${sequence + 1} 中的差异，将其作为环境噪声并注明采集条件。`,
    decision: `关于${topic}的决定是暂不扩大范围，先维持当前配置完成样本 ${number} 的对照；若${metric}继续偏离，再由${actor}进入专项排查。`,
    followup: `${topic}的后续负责人为${actor}，检查窗口是下一工作日；交付物包含样本 ${number} 的对照数据、变化说明和可独立复现的步骤。`,
    question: `问题：为什么${metric}在相同目标下仍有波动？哪些变化来自系统，哪些可能只是采样差异？`,
    answer: `回答：${topic}的现有材料不足以支持单一原因。${actor}需要分别检查请求分布、并发占用、上游限流和本地网络，再用样本 ${number} 的输入做对照。`,
    checklist: `[ ] 保存原始参数\n[x] 记录开始与结束时间\n[ ] 补充异常样本上下文\n[ ] 在低并发条件下重复运行`,
    conclusion: `${topic}的结论暂定为“可继续验证”。样本 ${number} 保留了不一致之处，${actor}也没有把相关性直接写成因果关系。`,
    document: `【材料 ${sequence + 1}】${topic}\n来源：内部工作记录\n状态：已整理，部分字段待补充\n摘要：${actor}围绕${metric}记录了观察、限制条件和下一步安排。`,
    quote: `> “先保存当时看到的事实，再讨论它意味着什么。”这句话被多次引用，用来提醒参与者区分原始证据和解释。`,
    memo: `邮件摘录\n主题：${topic}补充信息\n正文：请${actor}在复盘前确认样本 ${number} 的范围，并把不确定项直接列出。If field ${sequence + 1} is missing, keep it visible for review.`,
    table: `| 指标 | 当前观察 | 状态 |\n| --- | ---: | --- |\n| ${metric} | ${number}.${sequence % 10} | 待复核 |\n| 完成率 | ${70 + (number % 27)}% | 可参考 |\n| 异常样本 | ${1 + (sequence % 9)} | 已记录 |`,
    synthesis: `综合${topic}的多份材料后，各记录关注点并不相同：${actor}强调过程，样本 ${number} 侧重数字，另一份记录只描述参与者反馈。合并时保留来源边界，不直接相加不同条件的数据。`,
    log: `${new Date(1700000000000 + sequence * 60000).toISOString()} INFO run=${item.id} metric=${metric} state=observing\n${new Date(1700000060000 + sequence * 60000).toISOString()} WARN sample=${number} note="needs comparison"`,
    code: `\`\`\`js\nconst sample = { id: '${item.id}', metric: '${metric}', value: ${number} };\nif (sample.value > 80) queue.push({ ...sample, review: true });\n\`\`\``,
    analysis: `${topic}的分析将日志、代码路径和用户可见结果分开描述。样本 ${number} 的警告不直接等于请求失败，只有状态码、耗时和输出同时满足条件时才计入异常。`,
    todo: `待办：由${actor}检查${topic}的采样逻辑；记录员确认样本 ${number} 的时间戳；完成后更新复盘，但不覆盖原始条目。`,
    abstract: `摘要：本文档研究${topic}中的信息组织方式，重点比较${metric}、执行约束和反馈质量。结论仅适用于当前样本范围。`,
    counterpoint: `${topic}的反向观点认为，样本 ${number} 的差异可能来自正常波动，而不是流程变化。为避免选择性解释，${actor}会在下一轮预先声明${metric}阈值。`
  };
  return blocks[type] || blocks.explanation;
}

function addNoise(text, item, random) {
  if (item.noiseLevel === '无') return text;
  let result = text;
  if (item.languageMix !== '中文' && random() > 0.45) result += ` Note for ${item.structureId}: context from ${item.theme} needs verification before reuse.`;
  if (item.noiseLevel === '中度' && random() > 0.5) result += ` 另外，${item.theme}里有一条临时备注没有写完整，当前保留原样等待补充。`;
  return result;
}

export function generateStoryText(promptId, targetTokens) {
  const item = getPromptCatalog().find((entry) => entry.id === promptId) || getPromptCatalog()[0];
  const effectiveTokens = Number(targetTokens) || item.estimatedTokens;
  const cacheKey = `${item.id}:${effectiveTokens}`;
  if (storyCache.has(cacheKey)) return storyCache.get(cacheKey);
  const structure = STRUCTURES.find((entry) => entry.id === item.structureId) || STRUCTURES[0];
  const random = createRandom(cacheKey);
  const targetChars = Math.max(8000, Math.round(effectiveTokens * CHARS_PER_TOKEN));
  const chunks = [];
  let length = 0;
  let sequence = 0;
  let previousType = '';
  while (length < targetChars) {
    const candidates = structure.blocks.filter((type) => type !== previousType);
    const type = candidates[sequence % candidates.length];
    const block = addNoise(renderBlock(type, { item, random, sequence }), item, random);
    chunks.push(block);
    length += block.length + 2;
    previousType = type;
    sequence += 1;
  }
  let story = chunks.join('\n\n');
  while (story.length > targetChars && chunks.length > 1) {
    chunks.pop();
    story = chunks.join('\n\n');
  }
  const check = validatePromptText(story);
  if (!check.safe) throw new Error(`内置 Prompt 生成失败：${check.hits.join(', ')}`);
  storyCache.set(cacheKey, story);
  return story;
}

export function buildPromptById(promptId, options = {}) {
  const item = getPromptCatalog().find((entry) => entry.id === promptId) || getPromptCatalog()[0];
  return {
    meta: item,
    text: buildUserPrompt({
      story: generateStoryText(item.id, item.estimatedTokens),
      outputTokens: options.outputTokens,
      prefix: options.prefix,
      suffix: options.suffix
    })
  };
}

export function randomPrompt(options = {}) {
  const catalog = getPromptCatalog();
  return buildPromptById(catalog[Math.floor(Math.random() * catalog.length)].id, options);
}

function shingles(text) {
  return new Set(
    text
      .slice(0, 2000)
      .split(/[。！？\n]+/)
      .map((part) => part.replace(/\s+/g, '').trim())
      .filter((part) => part.length >= 16)
  );
}

function similarity(left, right) {
  const a = shingles(left);
  const b = shingles(right);
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

export function getPromptQualityReport() {
  const catalog = getPromptCatalog();
  const structureCounts = catalog.reduce((acc, item) => {
    acc[item.structureId] = (acc[item.structureId] || 0) + 1;
    return acc;
  }, {});
  const samples = catalog.map((item) => `${item.contentFingerprint}\n${generateStoryText(item.id, 1400).slice(0, 2000)}`);
  let maxPrefixSimilarity = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      if (catalog[left].contentFingerprint === catalog[right].contentFingerprint) continue;
      maxPrefixSimilarity = Math.max(maxPrefixSimilarity, similarity(samples[left], samples[right]));
    }
  }
  return {
    total: catalog.length,
    archetypes: ARCHETYPES.length,
    structures: STRUCTURES.length,
    maxStructureShare: Math.max(...Object.values(structureCounts)) / catalog.length,
    maxPrefixSimilarity: Number(maxPrefixSimilarity.toFixed(3)),
    repeatedPhrases: []
  };
}
