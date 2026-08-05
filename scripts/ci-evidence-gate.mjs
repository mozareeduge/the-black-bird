import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = path.join(ROOT, 'candidate-evidence');

function sha256(filePath) {
  return crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
}
function pngDimensions(filePath) {
  const buf = readFileSync(filePath);
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  return null;
}
function jpegDimensions(filePath) {
  const buf = readFileSync(filePath);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1]; i += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const size = buf.readUInt16BE(i);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 5), buf.readUInt16BE(i + 3)];
    i += Math.max(size, 2);
  }
  return null;
}
function videoDurationSeconds(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}
function candidateSha() {
  return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
}

function main() {
  const errors = [];
  const head = candidateSha();
  const manifestPath = path.join(EVIDENCE, 'manifest.json');
  const humanReviewPath = path.join(EVIDENCE, 'human-review.json');
  if (!existsSync(manifestPath)) {
    console.log(JSON.stringify({ valid: false, errors: ['missing candidate-evidence/manifest.json'], candidate_sha: head }, null, 2));
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.candidate_sha !== head) errors.push('evidence manifest SHA does not equal candidate HEAD');

  const entries = manifest.entries || [];
  const seenIds = new Set();
  const seenImageBytes = new Set();
  const seenVideoBytes = new Set();
  for (const e of entries) {
    const eid = String(e.id);
    if (seenIds.has(eid)) errors.push('duplicate evidence id: ' + eid);
    seenIds.add(eid);

    const rel = String(e.path || '');
    if (path.isAbsolute(rel) || rel.split(path.sep).includes('..')) { errors.push('unsafe evidence path: ' + eid); continue; }
    const p = path.join(EVIDENCE, rel);
    if (!existsSync(p) || statSync(p).isSymbolicLink()) { errors.push('missing or symlink file: ' + rel); continue; }
    if (e.candidate_sha !== head) errors.push('mixed SHA: ' + eid);
    const actual = sha256(p);
    if (e.sha256 !== actual) errors.push('hash mismatch: ' + eid);

    const klass = e.artifact_class;
    if (klass === 'application-capture' || klass === 'screenshot') {
      if (seenImageBytes.has(actual)) errors.push('duplicate screenshot bytes: ' + actual);
      seenImageBytes.add(actual);
      const dims = pngDimensions(p) || jpegDimensions(p);
      if (!dims) { errors.push('invalid image stream: ' + eid); continue; }
      const expected = e.pixel_dimensions || dims;
      if (dims[0] !== expected[0] || dims[1] !== expected[1]) errors.push('image dimensions metadata mismatch: ' + eid);
      if (dims[0] < 320 || dims[1] < 480) errors.push('undersized screenshot dimensions: ' + eid);
    } else if (klass === 'motion' || klass === 'video') {
      if (seenVideoBytes.has(actual)) errors.push('duplicate video bytes: ' + actual);
      seenVideoBytes.add(actual);
      const duration = videoDurationSeconds(p);
      if (duration === null) errors.push('unprobeable video: ' + eid);
      else if (duration < 8.0 || duration > 20.0) errors.push('video duration outside 8-20s: ' + eid);
      else if (Math.abs((e.duration_s ?? duration) - duration) > 0.75) errors.push('video duration metadata mismatch: ' + eid);
    } else if (statSync(p).size === 0) {
      errors.push('empty evidence file: ' + eid);
    }
  }

  if (existsSync(humanReviewPath)) {
    const human = JSON.parse(readFileSync(humanReviewPath, 'utf8'));
    const dims = human.dimensions || {};
    for (const v of Object.values(dims)) {
      if (v !== 'pending_user_review' && v !== null) errors.push('agent attempted artistic acceptance');
    }
  } else {
    errors.push('missing candidate-evidence/human-review.json');
  }

  const out = { valid: errors.length === 0, errors, candidate_sha: head, entries_checked: entries.length };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.valid ? 0 : 1);
}

main();
