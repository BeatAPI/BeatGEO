import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { normalizeSeoSnapshot } from './seo.mjs';

export async function readSavedSeoEvidence(dataDir, runId) {
  const valid = id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  async function read(id) {
    if (!valid(id)) throw new Error('Invalid SEO run id.');
    const meta = JSON.parse(await readFile(path.join(dataDir, id, 'meta.json'), 'utf8'));
    if (meta.status !== 'complete' || meta.synthetic) throw new Error('Choose a completed non-demo SEO run.');
    const file = path.join(dataDir, id, 'seo-input.json');
    if ((await stat(file)).size > 10 * 1024 * 1024) throw new Error('SEO snapshot exceeds the read limit.');
    const snapshot = normalizeSeoSnapshot(JSON.parse(await readFile(file, 'utf8')));
    if (snapshot.synthetic) throw new Error('Demo evidence cannot be used as real search evidence.');
    return { runId: id, snapshot };
  }
  if (runId) return read(runId);
  let entries;
  try { entries = await readdir(dataDir); } catch (error) { if(error.code === 'ENOENT') return null; throw error; }
  const candidates = [];
  for (const id of entries.filter(valid)) {
    try {
      const meta = JSON.parse(await readFile(path.join(dataDir, id, 'meta.json'), 'utf8'));
      if (!meta.synthetic && meta.status === 'complete') candidates.push({id, date: meta.createdAt});
    } catch { /* In-progress or damaged runs are not usable evidence. */ }
  }
  candidates.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return candidates.length ? read(candidates[0].id) : null;
}
