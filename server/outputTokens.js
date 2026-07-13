// 期望输出 token 规则（计划书 §7.1）
// 期望输出 token 是写入 Prompt 的目标值，不是请求体里的 max_tokens。
// 用户设置最小值、最大值、步长；候选值必须是整齐的整数阶梯；抽样采用正态分布（中间高、两边低）。

// 生成候选阶梯值：从 min 起，按 step 递增，直到 max（含）。
// 例如 min=1500 max=3000 step=500 -> [1500, 2000, 2500, 3000]
export function buildOutputTokenCandidates({ min, max, step }) {
  const lo = Math.max(0, Math.round(Number(min) || 0));
  const hi = Math.max(lo, Math.round(Number(max) || 0));
  const st = Math.max(1, Math.round(Number(step) || 1));
  const candidates = [];
  for (let value = lo; value <= hi; value += st) {
    candidates.push(value);
  }
  // 保证至少包含一个候选值。
  if (candidates.length === 0) candidates.push(lo);
  // 若 max 未被步长整除且未包含，补上 max，保持"整齐"由用户配置负责。
  if (candidates[candidates.length - 1] !== hi && hi > candidates[candidates.length - 1]) {
    candidates.push(hi);
  }
  return candidates;
}

// 标准正态随机数（Box-Muller 变换）。
function standardNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 从候选阶梯中按正态分布抽样一个索引（中间高、两边低）。
// 均值落在候选数组中点，标准差取长度的 1/4，使两端仍有一定概率但明显低于中间。
export function sampleNormalIndex(length) {
  if (length <= 1) return 0;
  const mean = (length - 1) / 2;
  const std = Math.max(0.5, length / 4);
  let idx = Math.round(mean + standardNormal() * std);
  if (idx < 0) idx = 0;
  if (idx > length - 1) idx = length - 1;
  return idx;
}

// 抽取一个期望输出 token 值（候选阶梯 + 正态分布抽样）。
export function sampleExpectedOutputTokens(expectedOutput) {
  const candidates = buildOutputTokenCandidates(expectedOutput || {});
  const index = sampleNormalIndex(candidates.length);
  return candidates[index];
}
