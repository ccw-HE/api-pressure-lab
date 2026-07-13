// 通用表单控件：文本/数字输入、下拉、开关、卡片标题。
import React from 'react';

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && (
        <span>
          {label}
          {hint && <span className="hint"> · {hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

export function TextField({ label, hint, value, onChange, placeholder, type = 'text' }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function NumberField({ label, hint, value, onChange, min, max, step }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

export function SelectField({ label, hint, value, onChange, options }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function CardHead({ icon: Icon, title, note }) {
  return (
    <div className="cardHead">
      {Icon && (
        <div className="icon">
          <Icon size={18} />
        </div>
      )}
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
    </div>
  );
}

// 页面外壳：统一的页面标题区 + 内容容器。
export function Page({ title, subtitle, children }) {
  return (
    <div className="page">
      <div className="pageHeader">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// 卡片容器：可选带头部（图标 + 标题 + 说明）。
export function Card({ title, icon, note, children, className = '' }) {
  return (
    <div className={`card ${className}`.trim()}>
      {title && <CardHead icon={icon} title={title} note={note} />}
      {children}
    </div>
  );
}
