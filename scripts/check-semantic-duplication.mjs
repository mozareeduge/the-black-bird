import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(ROOT,'src/app.js'),'utf8');
const errors=[];
const forbidden = [
  [/\blet\s+S\s*=\s*\{/, 'legacy mutable semantic store `S` remains'],
  [/\bcanonicalState\b/, 'parallel `canonicalState` mirror remains'],
  [/window\.__bbState\b/, 'unbounded legacy test state exposure window.__bbState remains'],
  [/\brouteEvents\b/, 'legacy routeEvents semantic store remains'],
  [/\bobjectGroups\b/, 'legacy objectGroups semantic store remains'],
  [/\bviewOptions\b/, 'legacy viewOptions semantic store remains'],
  [/\bsoloSet\b/, 'legacy soloSet semantic store remains'],
  [/\bfieldTrace\b/, 'legacy fieldTrace semantic store remains'],
  [/function\s+stableBfsPath\s*\(/, 'duplicate inline trace BFS remains'],
  [/function\s+canonicalEdgeKey\s*\(/, 'duplicate inline trace edge-key authority remains'],
  [/d3\.forceSimulation\s*\(/, 'runtime force simulation remains'],
  [/d3\.drag\s*\(/, 'public d3.drag node movement remains'],
];
for (const [re,msg] of forbidden) if (re.test(app)) errors.push(msg);
if (!/window\.__bbTest\b/.test(app)) errors.push('bounded window.__bbTest interface missing');
const out={valid:errors.length===0,errors};
console.log(JSON.stringify(out,null,2));
process.exit(out.valid?0:1);
