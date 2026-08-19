import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const j = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const errors = [];
const expectedTypes = ['RNO','MNO','FO','NameO','RefO','RelO'];
const expectedRouteFields = ['sequence','id','type','label','fromId','source','committedAt'];

const closure = j('tests/contracts/final-closure-contract.json');
const state = j('tests/contracts/state-contract.json');
const algo = j('tests/contracts/algorithm-contracts.json');

const sameSet = (a,b) => Array.isArray(a) && a.length===b.length && [...a].sort().join('|') === [...b].sort().join('|');
if (!sameSet(closure.canonical_object_types, expectedTypes)) {
  errors.push(`final-closure canonical_object_types mismatch: ${JSON.stringify(closure.canonical_object_types)} expected ${JSON.stringify(expectedTypes)}`);
}
const h = state.initial?.history;
if (!h || !Array.isArray(h.route) || h.nextSequence !== 1) {
  errors.push('state-contract history must be {route: [], nextSequence: 1}');
}
if (!sameSet(algo.route?.eventFields, expectedRouteFields)) {
  errors.push(`algorithm-contract route.eventFields mismatch: ${JSON.stringify(algo.route?.eventFields)} expected ${JSON.stringify(expectedRouteFields)}`);
}
if (algo.route?.semanticLimit !== null) errors.push('algorithm-contract route.semanticLimit must be null');

const out={valid:errors.length===0, errors, expected:{canonical_object_types:expectedTypes, route_event_fields:expectedRouteFields}};
console.log(JSON.stringify(out,null,2));
process.exit(out.valid?0:1);
