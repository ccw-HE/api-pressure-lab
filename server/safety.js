const blockedTerms = [
  '血腥',
  '杀戮',
  '屠杀',
  '自杀',
  '未成年',
  '儿童',
  '色情',
  '性行为',
  '仇恨',
  '歧视',
  '炸弹',
  '毒品',
  '诈骗',
  '赌博',
  '恐怖',
  '政治动员',
  '极端主义',
  '武器',
  '器官',
  '虐待'
];

const safeInstruction =
  '请延续下面的中文长篇片段。要求：保持积极向上、温和安全、尊重他人、强调合作与成长；只描写日常协作、学习改进、自然观察、服务体验和社区建设等适合普通工作场景阅读的内容。';

export function validatePromptText(text) {
  const hits = blockedTerms.filter((term) => text.includes(term));
  return {
    safe: hits.length === 0,
    hits,
    checkedTerms: blockedTerms.length
  };
}

export function buildUserPrompt({ story, outputTokens = 6000, prefix = '', suffix = '' }) {
  const text = [
    prefix.trim(),
    `${safeInstruction} 输出长度约 ${outputTokens} token，语言为中文，叙事节奏舒展，结尾保持开放和正向。`,
    '正文片段：',
    story,
    suffix.trim()
  ]
    .filter(Boolean)
    .join('\n\n');
  const result = validatePromptText(text);
  if (!result.safe) {
    throw new Error(`Prompt安全检查未通过：${result.hits.join(', ')}`);
  }
  return text;
}

export function checkCustomPromptPieces(config) {
  const text = [
    config?.prompt?.systemInstruction || '',
    config?.prompt?.prefix || '',
    config?.prompt?.suffix || ''
  ].join('\n');
  return validatePromptText(text);
}

export { blockedTerms, safeInstruction };
