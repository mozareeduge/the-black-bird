import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA, CANONICAL_DATA_SHA256 } from '../../src/data/canonical-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const moduleSource = readFileSync(path.join(root, 'src/data/canonical-data.js'), 'utf8');
const embedded = moduleSource.match(/export const DATA = (\{[\s\S]*\});\n?$/);
const lockedHash = readFileSync(path.join(root, 'src/data/canonical-data.sha256'), 'utf8').trim();
const contract = JSON.parse(
  readFileSync(path.join(root, '.bb-authority/contracts/canonical-node-index.json'), 'utf8')
);

test('embedded DATA literal is present and hash-locked', () => {
  assert.ok(embedded, 'export const DATA = {...}; block not found');
  const hash = createHash('sha256').update(embedded[1]).digest('hex');
  assert.equal(hash, CANONICAL_DATA_SHA256);
  assert.equal(hash, lockedHash);
});

test('CANONICAL_DATA_SHA256 matches the authority-expected hash', () => {
  assert.equal(CANONICAL_DATA_SHA256, contract.expected_data_sha256);
});

test('exactly 50 nodes across the six canonical types, no duplicates', () => {
  const ids = DATA.nodes.map((n) => n.id);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  const types = [...new Set(DATA.nodes.map((n) => n.type))].sort();
  assert.deepEqual(types, ['FO', 'MNO', 'NameO', 'RNO', 'RefO', 'RelO'].sort());
});

test('node ids and order match the authority canonical index', () => {
  const ids = DATA.nodes.map((n) => n.id);
  const expectedIds = contract.nodes.slice().sort((a, b) => a.index - b.index).map((n) => n.id);
  assert.deepEqual(ids, expectedIds);
});

test('RelO ids stay opaque (label === id, shortLabel is a rel· stub)', () => {
  for (const n of DATA.nodes.filter((n) => n.type === 'RelO')) {
    assert.equal(n.label, n.id, `${n.id} label is not opaque`);
    assert.match(n.shortLabel, /^rel·/, `${n.id} shortLabel is not opaque`);
    assert.ok(DATA.relations[n.id], `${n.id} has no relations entry`);
  }
});

test('relation participants and text pointers resolve to real node ids', () => {
  const idset = new Set(DATA.nodes.map((n) => n.id));
  for (const [rid, participants] of Object.entries(DATA.relations)) {
    assert.ok(idset.has(rid), `relation key ${rid} is not a node id`);
    for (const p of participants) assert.ok(idset.has(p), `${rid} references missing participant ${p}`);
  }
  for (const [tid, t] of Object.entries(DATA.texts)) {
    assert.ok(idset.has(tid), `text key ${tid} is not a node id`);
    for (const p of [...(t.objects || []), ...(t.refs || [])]) {
      assert.ok(idset.has(p), `${tid} references missing pointer ${p}`);
    }
  }
});
