import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeObservation } from '../src/analyze.mjs';
import { captureToRecord, validateCapture } from '../src/capture.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { checkAgainstQuestions, loadRecords } from '../src/run.mjs';
import { CONFIG } from './fixtures.mjs';

const CLI = path.resolve('bin/beat-geo.mjs');
const base = () => ({
  schema: 'beat-geo/capture@1', questionId: 'q1', question: 'What is best?', engine: 'chatgpt', engineLabel: 'ChatGPT (web)', repeat: 1,
  collectedAt: '2026-01-01T00:00:00Z', answer: 'Acme is fine. Zeta too.',
  searchQueries: ['best tool'], sourceUrls: [{ url: 'https://a.example/1' }, { url: 'https://acme.example/x' }], citedUrls: [{ url: 'https://acme.example/x', title: 'Acme' }],
});

test('a capture becomes a record the normal pipeline analyzes, labelled as browser data', () => {
  const rec = captureToRecord(base());
  assert.equal(rec.source, 'browser');
  const a = analyzeObservation(parseResponse(rec.response), normalizeConfig(CONFIG));
  assert.equal(a.callCount, 1);
  assert.equal(a.sourceUrlCount, 2);
  assert.equal(a.citedUrlCount, 1);
  assert.equal(a.entities.find((e) => e.id === 'acme').mentions, 1);
});

test('a capture with no visible search evidence carries no search call', () => {
  const rec = captureToRecord({ ...base(), searchQueries: [], sourceUrls: [], citedUrls: [] });
  assert.deepEqual(rec.response.output.map((o) => o.type), ['message']);
});

test('a capture with an error becomes a failed record, not an answer', () => {
  const rec = captureToRecord({ schema: 'beat-geo/capture@1', questionId: 'q1', question: 'Q?', engine: 'x', error: { message: 'usage limit reached' } });
  assert.equal(rec.response, undefined);
  assert.equal(rec.error.message, 'usage limit reached');
});

test('validation names every problem: missing fields, non-http URLs, bad lists', () => {
  const { problems } = validateCapture({ questionId: '', question: 'q', engine: 'e', answer: '', sourceUrls: ['javascript:alert(1)'], citedUrls: 'x', searchQueries: 'y' });
  const text = problems.join(' | ');
  assert.match(text, /questionId/);
  assert.match(text, /answer/);
  assert.match(text, /sourceUrls\[0\]/);
  assert.match(text, /citedUrls must be an array/);
  assert.match(text, /searchQueries must be an array/);
  assert.throws(() => captureToRecord({ ...base(), answer: '' }), /answer/);
});

test('records loaded from nested capture folders; questions must match the declared text exactly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-'));
  await mkdir(path.join(dir, 'chatgpt'), { recursive: true });
  await writeFile(path.join(dir, 'chatgpt', 'q1.json'), JSON.stringify(base()));
  await writeFile(path.join(dir, 'chatgpt', 'q2.json'), JSON.stringify({ ...base(), questionId: 'q1', question: 'What is best?!' }));
  const records = await loadRecords(dir);
  assert.equal(records.length, 2);
  const problems = checkAgainstQuestions(records, [{ id: 'q1', text: 'What is best?' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /differs from the declared question set/);
  assert.equal(checkAgainstQuestions(records.slice(0, 1), [{ id: 'q1', text: 'What is best?' }]).length, 0);
  assert.match(checkAgainstQuestions(records, [{ id: 'other', text: 'x' }])[0], /unknown question id/);
});

test('analyze refuses captures that do not match the declared question set', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-'));
  await writeFile(path.join(dir, 'a.json'), JSON.stringify({ ...base(), question: 'Changed wording?' }));
  const qfile = path.join(dir, 'questions.json');
  await writeFile(qfile, JSON.stringify({ questions: [{ id: 'q1', text: 'What is best?' }] }));
  const code = await new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, 'analyze', '--input', path.join(dir, 'a.json'), '--questions', qfile, '--out', path.join(dir, 'out')]);
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    c.on('close', (k) => resolve({ k, err }));
  });
  assert.equal(code.k, 1);
  assert.match(code.err, /do not match the declared question set/);
});

test('caseSensitive entities do not match common words in lowercase', () => {
  const config = normalizeConfig({ brand: { name: 'Replicate', caseSensitive: true } });
  const rec = captureToRecord({ ...base(), answer: 'You can replicate results. Replicate offers hosting.', searchQueries: [], sourceUrls: [], citedUrls: [] });
  const a = analyzeObservation(parseResponse(rec.response), config);
  assert.equal(a.entities[0].mentions, 1);
});
