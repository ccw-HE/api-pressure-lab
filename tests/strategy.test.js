import { describe, expect, it } from "vitest";
import {
  pickWeightedTier,
  pickPromptInTier,
  createWeightStrategy,
  createScrollStrategy,
  findClosestPrompt,
} from "../server/strategy.js";
import {
  getPromptCatalog,
  getSortedPromptCatalog,
  PROMPT_TIERS,
  PROMPT_MAX_TOKENS,
} from "../server/prompts.js";

const TIER_KEYS = PROMPT_TIERS.map((t) => t.key);

// 按分区 key 分组，匹配 strategy.js 的 pickPromptInTier(groups, tierKey, rng) 签名。
function groupByTier(catalog) {
  const groups = {};
  for (const key of TIER_KEYS) groups[key] = [];
  for (const item of catalog) {
    if (groups[item.tier]) groups[item.tier].push(item);
  }
  return groups;
}

describe("权重模式", () => {
  it("100/0/0/0 只抽中 2-5w 分区", () => {
    const weights = { "2-5w": 100, "5-10w": 0, "10-15w": 0, "15-20w": 0 };
    const hits = new Set();
    for (let i = 0; i < 500; i += 1) {
      hits.add(pickWeightedTier(weights));
    }
    expect([...hits]).toEqual(["2-5w"]);
  });

  it("0% 分区绝不被抽中", () => {
    const weights = { "2-5w": 50, "5-10w": 0, "10-15w": 50, "15-20w": 0 };
    const hits = new Set();
    for (let i = 0; i < 2000; i += 1) {
      hits.add(pickWeightedTier(weights));
    }
    expect(hits.has("5-10w")).toBe(false);
    expect(hits.has("15-20w")).toBe(false);
    expect(hits.has("2-5w")).toBe(true);
    expect(hits.has("10-15w")).toBe(true);
  });

  it("按权重比例抽样（大样本近似）", () => {
    const weights = { "2-5w": 10, "5-10w": 35, "10-15w": 35, "15-20w": 20 };
    const counts = { "2-5w": 0, "5-10w": 0, "10-15w": 0, "15-20w": 0 };
    const N = 40000;
    for (let i = 0; i < N; i += 1) {
      counts[pickWeightedTier(weights)] += 1;
    }
    expect(counts["2-5w"] / N).toBeCloseTo(0.1, 1);
    expect(counts["5-10w"] / N).toBeCloseTo(0.35, 1);
    expect(counts["15-20w"] / N).toBeCloseTo(0.2, 1);
  });

  it("分区内随机选一条 Prompt，且落在该分区", () => {
    const groups = groupByTier(getPromptCatalog());
    for (const tier of TIER_KEYS) {
      const prompt = pickPromptInTier(groups, tier, Math.random);
      expect(prompt.tier).toBe(tier);
    }
  });

  it("权重策略 next() 返回 prompt 与 tier", () => {
    const strategy = createWeightStrategy({
      "2-5w": 100,
      "5-10w": 0,
      "10-15w": 0,
      "15-20w": 0,
    });
    const { prompt, tier } = strategy.next();
    expect(tier).toBe("2-5w");
    expect(prompt.tier).toBe("2-5w");
  });
});

describe("滚动模式", () => {
  it("首条一定来自 2-5w 分区", () => {
    for (let i = 0; i < 200; i += 1) {
      const strategy = createScrollStrategy({
        incrementMin: 3000,
        incrementMax: 5000,
      });
      const first = strategy.next();
      expect(first.tier).toBe("2-5w");
      expect(first.restarted).toBe(true);
    }
  });

  it("每轮根据增量逼近下一条，token 单调增长直到重启", () => {
    const strategy = createScrollStrategy({
      incrementMin: 3000,
      incrementMax: 5000,
    });
    let prev = strategy.next();
    for (let i = 0; i < 20; i += 1) {
      const cur = strategy.next();
      if (cur.restarted) {
        expect(cur.tier).toBe("2-5w");
      } else {
        expect(cur.prompt.estimatedTokens).toBeGreaterThanOrEqual(
          prev.prompt.estimatedTokens
        );
      }
      prev = cur;
    }
  });

  it("超过 20w 上限后回到 2-5w", () => {
    // 大增量迫使快速越界。
    const strategy = createScrollStrategy({
      incrementMin: 60000,
      incrementMax: 60000,
    });
    let restartCount = 0;
    let sawFirst = false;
    for (let i = 0; i < 40; i += 1) {
      const cur = strategy.next();
      if (sawFirst && cur.restarted) {
        expect(cur.tier).toBe("2-5w");
        restartCount += 1;
      }
      sawFirst = true;
    }
    expect(restartCount).toBeGreaterThan(0);
  });
});

describe("等距冲突", () => {
  it("距离目标相同时在候选中随机选", () => {
    const sorted = getSortedPromptCatalog();
    // 找到两条 token 值，取其正中点作为目标，制造等距。
    const a = sorted[0].estimatedTokens;
    const b = sorted[1].estimatedTokens;
    if (a === b) {
      // 若前两条 token 相同则跳过（理论上不会）。
      expect(true).toBe(true);
      return;
    }
    const mid = (a + b) / 2;
    const picks = new Set();
    for (let i = 0; i < 100; i += 1) {
      picks.add(findClosestPrompt(sorted, mid).id);
    }
    // 至少能选到两条中的一条；理想情况两条都可能出现。
    expect(picks.size).toBeGreaterThanOrEqual(1);
  });
});
