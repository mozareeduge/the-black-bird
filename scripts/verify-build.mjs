import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build, ROOT } from './build.mjs';

const LOADING_LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'preload',
  'modulepreload',
  'prefetch',
  'dns-prefetch',
  'manifest',
]);

function isExternal(url) {
  return /^(https?:)?\/\//i.test(url.trim());
}

function checkNoExternalRuntimeRequests(html) {
  const errors = [];

  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/gi)) {
    if (isExternal(m[1])) errors.push(`external script src: ${m[1]}`);
  }
  for (const m of html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"[^>]*>/gi)) {
    if (isExternal(m[1])) errors.push(`external img src: ${m[1]}`);
  }
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const tag = m[1];
    const relMatch = tag.match(/\srel="([^"]+)"/i);
    const hrefMatch = tag.match(/\shref="([^"]+)"/i);
    if (!relMatch || !hrefMatch) continue;
    const rels = relMatch[1].toLowerCase().split(/\s+/);
    if (rels.some((r) => LOADING_LINK_RELS.has(r)) && isExternal(hrefMatch[1])) {
      errors.push(`external <link rel="${relMatch[1]}"> href: ${hrefMatch[1]}`);
    }
  }
  for (const m of html.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
    for (const um of m[0].matchAll(/url\(['"]?([^'")]+)['"]?\)/gi)) {
      if (isExternal(um[1])) errors.push(`external @font-face url: ${um[1]}`);
    }
  }
  if (/\bfetch\s*\(\s*['"`]https?:\/\//.test(html)) errors.push('literal fetch() call to an external URL found');
  if (/\bnew\s+(XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(html)) {
    errors.push('XMLHttpRequest/WebSocket/EventSource construction found');
  }
  return errors;
}

function checkRequiredContentPresent(html) {
  const errors = [];
  const required = [
    'The Black Bird',
    'Mohammad Zare',
    'RIGHTS.md'.replace('RIGHTS.md', 'github.com/mozareeduge/the-black-bird'),
    'poem.theblackbirdfield.com',
  ];
  for (const needle of required) {
    if (!html.includes(needle)) errors.push(`missing required public content: ${needle}`);
  }
  return errors;
}

function main() {
  const errors = [];

  const first = build().html;
  const second = build().html;
  if (first !== second) errors.push('two consecutive builds are not byte-identical');

  const currentIndexPath = path.join(ROOT, 'index.html');
  let currentIndex = null;
  try {
    currentIndex = readFileSync(currentIndexPath, 'utf8');
  } catch {
    errors.push(`committed ${currentIndexPath} is missing; run npm run build first`);
  }
  if (currentIndex !== null && currentIndex !== first) {
    errors.push('committed index.html does not match the deterministic build output; run npm run build');
  }

  errors.push(...checkNoExternalRuntimeRequests(first));
  errors.push(...checkRequiredContentPresent(first));

  if (errors.length) {
    process.stderr.write(errors.map((e) => `FAIL ${e}`).join('\n') + '\n');
    process.exit(1);
  }
  process.stdout.write(`PASS build is deterministic, self-contained, and preserves required public content (${Buffer.byteLength(first, 'utf8')} bytes)\n`);
}

main();
