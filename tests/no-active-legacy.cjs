'use strict';
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
// Head correction (v4, R0): this check must inspect tracked repository
// content, not raw filesystem existence -- a host (e.g. a local Claude Code
// session) may create untracked .claude/settings.local.json for its own
// operational needs without that being repository-resident control-plane
// contamination.
const forbidden = ['CLAUDE.md', '.claude', '.mcp.json', 'AGENTS.md'];
const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const found = forbidden.filter((p) => tracked.some((t) => t === p || t.startsWith(p + '/')));
if (found.length) {
  console.error('ACTIVE_LEGACY_CONTROL_PLANE ' + found.join(','));
  process.exit(1);
}
console.log('PASS no active repository-resident Claude control plane');
