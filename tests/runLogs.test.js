import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearRunLogFiles, readRunSummaries } from '../server/runLogs.js';

describe('run log helpers', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'api-pressure-runs-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('只删除 runs 目录下的 jsonl 日志文件', async () => {
    await writeFile(path.join(dir, 'a.jsonl'), '{"ok":true}\n', 'utf8');
    await writeFile(path.join(dir, 'b.txt'), 'keep', 'utf8');

    const result = await clearRunLogFiles(dir);

    expect(result).toEqual({ deleted: 1 });
    await expect(readFile(path.join(dir, 'a.jsonl'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(dir, 'b.txt'), 'utf8')).resolves.toBe('keep');
  });

  it('读取历史摘要时按开始时间倒序返回', async () => {
    await writeFile(
      path.join(dir, 'old.jsonl'),
      `${JSON.stringify({ runId: 'old', time: '2026-06-06T23:00:00.000Z', ok: true, durationMs: 1000 })}\n`,
      'utf8'
    );
    await writeFile(
      path.join(dir, 'new.jsonl'),
      `${JSON.stringify({ runId: 'new', time: '2026-06-07T00:00:00.000Z', ok: false, error: 'fetch failed' })}\n`,
      'utf8'
    );

    const runs = await readRunSummaries(dir);

    expect(runs.map((run) => run.runId)).toEqual(['new', 'old']);
    expect(runs[1]).toMatchObject({ total: 1, success: 1, failed: 0, averageDurationMs: 1000 });
    expect(runs[0].errors).toEqual({ 'fetch failed': 1 });
  });
});
