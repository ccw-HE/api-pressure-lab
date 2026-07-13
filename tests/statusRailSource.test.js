import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

describe('status rail controls', () => {
  it('保留常驻开始按钮入口', () => {
    const source = readFileSync(new URL('src/components/StatusRail.jsx', root), 'utf8');

    expect(source).toContain("runAction('start')");
    expect(source).toContain('开始');
  });
});
