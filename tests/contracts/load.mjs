import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Reads a committed contract fixture (tests/contracts/*.json), never the
// ephemeral .bb-authority/ overlay itself (T26, T-REQ-044) -- so unit tests
// assert against a checked-in copy of the authority contract rather than a
// hand-copied literal or the current implementation's own output.
export function readContract(name) {
  return JSON.parse(readFileSync(path.join(DIR, name), 'utf8'));
}
