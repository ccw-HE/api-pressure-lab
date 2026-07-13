import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export async function readRunSummaries(runsDir, limit = 30) {
  const files = await listRunLogFiles(runsDir);
  const recentFiles = (
    await Promise.all(files.map(async (file) => ({ file, modifiedAt: (await stat(path.join(runsDir, file))).mtimeMs })))
  )
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, limit)
    .map((entry) => entry.file);
  const runs = await Promise.all(
    recentFiles.map(async (file) => {
      const full = path.join(runsDir, file);
      const raw = await readFile(full, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const entries = lines.flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
      return summarizeRun(file, entries);
    })
  );

  return runs
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit);
}

export async function clearRunLogFiles(runsDir) {
  const root = path.resolve(runsDir);
  const files = await listRunLogFiles(root);
  let deleted = 0;

  for (const file of files) {
    const full = path.resolve(root, file);
    if (!isChildPath(root, full)) {
      continue;
    }
    await unlink(full);
    deleted += 1;
  }

  return { deleted };
}

async function listRunLogFiles(runsDir) {
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function summarizeRun(file, entries) {
  const first = entries[0] || {};
  const success = entries.filter((entry) => entry.ok).length;
  const failed = entries.length - success;
  const durations = entries.filter((entry) => entry.durationMs).map((entry) => entry.durationMs);
  const errors = entries.reduce((acc, entry) => {
    if (entry.ok) return acc;
    const message = entry.error || '未知错误';
    acc[message] = (acc[message] || 0) + 1;
    return acc;
  }, {});
  return {
    file,
    runId: first.runId || file.replace('.jsonl', ''),
    startedAt: first.time || '',
    total: entries.length,
    success,
    failed,
    errors,
    averageDurationMs: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0
  };
}

function isChildPath(root, full) {
  const relative = path.relative(root, full);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
