// 权重模式 4 分区配置（计划书 §11.3）
// 每个分区提供滑动条 + 数字输入；四项合计必须 100%；任意单项可为 0%。
import React from 'react';
import { tierLabel } from '../utils/format.js';

const TIER_KEYS = ['2-5w', '5-10w', '10-15w', '15-20w'];

export default function WeightSliders({ weights, onChange }) {
  const values = TIER_KEYS.map((key) => Number(weights?.[key]) || 0);
  const total = values.reduce((sum, v) => sum + v, 0);
  const valid = total === 100;

  function setWeight(key, value) {
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    onChange({ ...weights, [key]: v });
  }

  // 一键归一：把当前比例缩放到合计 100（末项吸收取整误差）。
  function normalize() {
    if (total <= 0) {
      onChange({ '2-5w': 10, '5-10w': 35, '10-15w': 35, '15-20w': 20 });
      return;
    }
    const next = {};
    let acc = 0;
    TIER_KEYS.forEach((key, i) => {
      if (i === TIER_KEYS.length - 1) {
        next[key] = Math.max(0, 100 - acc);
      } else {
        const pct = Math.round((values[i] / total) * 100);
        next[key] = pct;
        acc += pct;
      }
    });
    onChange(next);
  }

  return (
    <div className="weightSliders">
      {TIER_KEYS.map((key) => (
        <div className="weightRow" key={key}>
          <span className="weightLabel">{tierLabel(key)}</span>
          <input
            className="weightRange"
            type="range"
            min={0}
            max={100}
            value={weights?.[key] ?? 0}
            onChange={(e) => setWeight(key, e.target.value)}
          />
          <div className="weightNumber">
            <input
              type="number"
              min={0}
              max={100}
              value={weights?.[key] ?? 0}
              onChange={(e) => setWeight(key, e.target.value)}
            />
            <span>%</span>
          </div>
        </div>
      ))}
      <div className={`weightTotal ${valid ? 'ok' : 'bad'}`}>
        <span>合计 {total}%</span>
        {valid ? (
          <span className="weightTotalTag ok">已满足 100%</span>
        ) : (
          <button type="button" className="weightNormalizeBtn" onClick={normalize}>
            一键归一到 100%
          </button>
        )}
      </div>
    </div>
  );
}
