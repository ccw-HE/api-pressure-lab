// 双端 token 滑条：可拖动 + 可清空重写 + 支持 0 档位。
import React, { useEffect, useMemo, useState } from 'react';
import { buildCandidates } from '../utils/format.js';

export default function DualRangeSlider({
  min,
  max,
  step,
  absMin = 0,
  absMax = 65535,
  sliderStep = 500,
  minLabel = '最小值',
  maxLabel = '最大值',
  stepLabel = '步长',
  showStepInput = true,
  hint = '候选值按步长生成整齐整数阶梯，运行时按正态分布抽样（中间高、两边低）。',
  onChange
}) {
  const safeMin = normalizeNumber(min, absMin);
  const safeMax = Math.max(safeMin, normalizeNumber(max, safeMin));
  const safeStep = Math.max(1, Number(step) || 1);
  const safeSliderStep = Math.max(1, Number(sliderStep) || safeStep);
  const candidates = useMemo(() => buildCandidates(safeMin, safeMax, safeStep), [safeMin, safeMax, safeStep]);
  const visibleCandidates = candidates.length > 14
    ? [...candidates.slice(0, 12), '…', candidates[candidates.length - 1]]
    : candidates;
  const [draft, setDraft] = useState({
    min: String(safeMin),
    max: String(safeMax),
    step: String(safeStep)
  });

  useEffect(() => {
    setDraft({ min: String(safeMin), max: String(safeMax), step: String(safeStep) });
  }, [safeMin, safeMax, safeStep]);

  function patch(next) {
    onChange({ min: safeMin, max: safeMax, step: safeStep, ...next });
  }

  // 左端不得超过右端，右端不得小于左端。
  function setMin(value) {
    const v = clamp(value, absMin, safeMax);
    patch({ min: v });
  }
  function setMax(value) {
    const v = clamp(value, safeMin, absMax);
    patch({ max: v });
  }
  function setStep(value) {
    patch({ step: Math.max(1, Math.round(Number(value) || 1)) });
  }

  const range = absMax - absMin || 1;
  const leftPct = ((safeMin - absMin) / range) * 100;
  const rightPct = ((safeMax - absMin) / range) * 100;

  function updateDraft(key, value) {
    setDraft((old) => ({ ...old, [key]: value }));
    if (value === '' || value === '-' || !Number.isFinite(Number(value))) {
      return;
    }
    if (key === 'min') setMin(Number(value));
    if (key === 'max') setMax(Number(value));
    if (key === 'step') setStep(value);
  }

  function restoreDraft(key) {
    setDraft((old) => ({
      ...old,
      [key]: key === 'step' ? String(safeStep) : key === 'min' ? String(safeMin) : String(safeMax)
    }));
  }

  return (
    <div className="dualRange">
      <div className="dualRangeInputs">
        <label className="miniField">
          <span>{minLabel}</span>
          <input
            type="number"
            value={draft.min}
            min={absMin}
            max={safeMax}
            onBlur={() => restoreDraft('min')}
            onChange={(e) => updateDraft('min', e.target.value)}
          />
        </label>
        <label className="miniField">
          <span>{maxLabel}</span>
          <input
            type="number"
            value={draft.max}
            min={safeMin}
            max={absMax}
            onBlur={() => restoreDraft('max')}
            onChange={(e) => updateDraft('max', e.target.value)}
          />
        </label>
        {showStepInput && (
          <label className="miniField">
            <span>{stepLabel}</span>
            <input
              type="number"
              value={draft.step}
              min={1}
              onBlur={() => restoreDraft('step')}
              onChange={(e) => updateDraft('step', e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="dualRangeTrack">
        <div className="dualRangeFill" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
        <input
          className="dualRangeThumb"
          type="range"
          min={absMin}
          max={absMax}
          step={safeSliderStep}
          value={safeMin}
          onChange={(e) => setMin(Number(e.target.value))}
        />
        <input
          className="dualRangeThumb"
          type="range"
          min={absMin}
          max={absMax}
          step={safeSliderStep}
          value={safeMax}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </div>

      <div className="candidateChips">
        {visibleCandidates.map((value, index) => (
          <span key={`${value}-${index}`} className="candidateChip">{value}</span>
        ))}
      </div>
      {hint ? <p className="hintText">{hint}</p> : null}
    </div>
  );
}

function clamp(value, lo, hi) {
  const n = Math.round(Number(value) || 0);
  return Math.max(lo, Math.min(hi, n));
}

function normalizeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
