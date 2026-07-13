// Prompt 调度双策略（计划书 §10-§12）
// 两条独立路线：权重模式（weight）与滚动模式（scroll）。
// 它们不互为主备、不互相降级、不互相兜底。
//
// 所有随机来源都通过可注入的 rng（默认 Math.random）实现，便于测试确定性。

import {
  PROMPT_TIERS,
  PROMPT_MAX_TOKENS,
  getPromptCatalog,
  getSortedPromptCatalog,
  tierOfTokens
} from './prompts.js';

const TIER_KEYS = PROMPT_TIERS.map((t) => t.key);
const FIRST_TIER_KEY = PROMPT_TIERS[0].key; // '2-5w'

// 按分区 key 分组的目录索引。
function groupByTier(catalog) {
  const groups = {};
  for (const key of TIER_KEYS) groups[key] = [];
  for (const item of catalog) {
    if (groups[item.tier]) groups[item.tier].push(item);
  }
  return groups;
}

// ---------- 权重模式 ----------

// 按 4 分区百分比抽样命中的分区 key。0% 分区绝不被抽中。
// weights 形如 { '2-5w': 10, '5-10w': 35, '10-15w': 35, '15-20w': 20 }，合计 100。
export function pickWeightedTier(weights, rng = Math.random) {
  const entries = TIER_KEYS.map((key) => [key, Math.max(0, Number(weights?.[key]) || 0)]);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) {
    // 理论上 normalizeConfig 已保证合计 100，这里做最后兜底：等概率。
    return TIER_KEYS[Math.floor(rng() * TIER_KEYS.length)] || FIRST_TIER_KEY;
  }
  let r = rng() * total;
  for (const [key, w] of entries) {
    if (w <= 0) continue; // 0% 分区跳过，绝不抽中
    r -= w;
    if (r < 0) return key;
  }
  // 浮点误差兜底：返回最后一个非 0 分区。
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i][1] > 0) return entries[i][0];
  }
  return FIRST_TIER_KEY;
}

// 在指定分区内随机选一条 Prompt。
export function pickPromptInTier(groups, tierKey, rng = Math.random) {
  const list = groups[tierKey] || [];
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

// 创建权重模式调度器（无状态，每次独立抽样）。
export function createWeightStrategy(weights, options = {}) {
  const rng = options.rng || Math.random;
  const catalog = options.catalog || getPromptCatalog();
  const groups = groupByTier(catalog);
  return {
    mode: 'weight',
    next() {
      const tier = pickWeightedTier(weights, rng);
      const prompt = pickPromptInTier(groups, tier, rng);
      return { prompt, tier };
    }
  };
}

// ---------- 滚动模式 ----------

// 在有序库中寻找 estimatedTokens 最接近 target 的一条。
// 若两条距离相同（等距冲突），在这两条中随机选一条。
export function findClosestPrompt(sortedCatalog, target, rng = Math.random) {
  if (!sortedCatalog.length) return null;
  let bestDistance = Infinity;
  const candidates = [];
  for (const item of sortedCatalog) {
    const distance = Math.abs(item.estimatedTokens - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidates.length = 0;
      candidates.push(item);
    } else if (distance === bestDistance) {
      candidates.push(item);
    }
  }
  if (candidates.length === 1) return candidates[0];
  return candidates[Math.floor(rng() * candidates.length)];
}

// 从 2-5w 分区随机抽一条作为循环首条。
function pickFirstPrompt(groups, rng) {
  return pickPromptInTier(groups, FIRST_TIER_KEY, rng);
}

// 创建滚动模式调度器（有状态：记录上一轮 token）。
// 每一轮：目标 token = 上轮 token + 随机增量；在有序库找最接近的一条。
// 若上轮 token + 增量 > 20w，则结束当前链路，重新从 2-5w 随机开始。
export function createScrollStrategy(scroll, options = {}) {
  const rng = options.rng || Math.random;
  const catalog = options.catalog || getPromptCatalog();
  const sorted = options.sortedCatalog || getSortedPromptCatalog();
  const groups = groupByTier(catalog);
  const incrementMin = Math.max(1, Number(scroll?.incrementMin) || 3000);
  const incrementMax = Math.max(incrementMin, Number(scroll?.incrementMax) || 5000);

  let lastTokens = null; // null 表示需要开启新循环

  function randomIncrement() {
    return incrementMin + rng() * (incrementMax - incrementMin);
  }

  return {
    mode: 'scroll',
    // 便于测试与状态栏展示：暴露当前 lastTokens。
    getLastTokens() {
      return lastTokens;
    },
    next() {
      // 新循环起点：从 2-5w 随机选首条。
      if (lastTokens === null) {
        const first = pickFirstPrompt(groups, rng);
        lastTokens = first ? first.estimatedTokens : null;
        return { prompt: first, tier: first ? first.tier : FIRST_TIER_KEY, restarted: true };
      }

      const target = lastTokens + randomIncrement();
      // 越界压缩：超过 20w，结束当前链路，重新从 2-5w 开始。
      if (target > PROMPT_MAX_TOKENS) {
        const first = pickFirstPrompt(groups, rng);
        lastTokens = first ? first.estimatedTokens : null;
        return { prompt: first, tier: first ? first.tier : FIRST_TIER_KEY, restarted: true };
      }

      const prompt = findClosestPrompt(sorted, target, rng);
      lastTokens = prompt ? prompt.estimatedTokens : lastTokens;
      return { prompt, tier: prompt ? prompt.tier : tierOfTokens(target), restarted: false };
    }
  };
}

// 工厂：按 config.prompt 创建对应策略调度器。
export function createStrategy(promptConfig, options = {}) {
  if (promptConfig?.strategy === 'scroll') {
    return createScrollStrategy(promptConfig.scroll, options);
  }
  return createWeightStrategy(promptConfig?.weights, options);
}

export { TIER_KEYS, FIRST_TIER_KEY };
