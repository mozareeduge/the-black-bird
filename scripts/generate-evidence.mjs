import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { gotoField, clickNode, tagNodes } = require('../tests/bb-helpers.cjs');

const BASE_URL = 'http://127.0.0.1:4173';
const OUT = path.join(ROOT, 'candidate-evidence');
const STATIC_DIR = path.join(OUT, 'static');
const MOTION_DIR = path.join(OUT, 'motion');
const MACHINE_DIR = path.join(OUT, 'machine');
const EVIDENCE_PLAN = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'contracts', 'evidence-plan.json'), 'utf8'));

function sha256(filePath) {
  return crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
}
function pngDimensions(filePath) {
  const buf = readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function candidateSha() {
  return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
}

async function startServer() {
  const proc = spawn(process.execPath, ['tests/static-server.cjs'], { cwd: ROOT, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('static server did not start in time')), 15000);
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('BB_TEST_SERVER')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('error', reject);
  });
  return proc;
}

// ── Static captures ──────────────────────────────────────────────────────
async function captureThreshold(page) {
  await page.goto('http://127.0.0.1:4173/?bbtest=1');
  await page.waitForSelector('.threshold, #threshold', { timeout: 8000 }).catch(() => {});
}
async function captureWholeField(page, width, height) {
  await page.setViewportSize({ width, height });
  await gotoField(page, { reduced: true });
  // returnToField is exposed on window.__bbTest (the bounded test API),
  // not window.__bbDesign (a separate, narrower design-inspection surface
  // with no such method) -- the previous call silently no-op'd via optional
  // chaining, leaving this capture at gotoField's own auto-focused landing
  // state instead of the genuinely neutral whole field it's named for
  // (F09/R7: caught once every static capture became individually
  // gate-required and duplicate-byte checking actually ran against it).
  await page.evaluate(() => window.__bbTest?.returnToField?.()).catch(() => {});
  await page.waitForTimeout(300);
}
async function captureFocusOrdinary(page, width, height) {
  await page.setViewportSize({ width, height });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
}
async function captureAperture(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await page.evaluate(() => window.__bbTest?.getUiRuntime?.()?.focusedId).then(async (id) => {
    if (id !== 'FO.BLACK_BIRD_FIELD') await clickNode(page, 'FO.BLACK_BIRD_FIELD');
  });
}
async function captureRelOClearing(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'RelO.R7080EA25');
}
async function captureRouteWearAfterglow(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
  await clickNode(page, 'FO.CAIN');
  await clickNode(page, 'FO.BURIAL');
}
async function captureReaderFieldComposition(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
}
async function captureMobileField(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
}
async function captureMobileRead(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
  await page.locator('[data-mobile="read"]').click();
}
async function captureProjectedInspection(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CAIN');
  // The real projected-edge click target is line.hit (src/app.js: projHitSel,
  // the invisible wide-stroke hit line the click handler is actually bound
  // to -- .link-proj is the thin visible stroke, not the pointer target).
  // The previous selector list (.edge.projected/line.projected/.proj-edge/
  // path.projected) matches no element the app ever renders, so
  // edge.count() was always 0 and this click silently no-op'd every time --
  // this "projected inspection" evidence never actually inspected one.
  // A direct dispatchEvent (not a Playwright locator .click()) on the first
  // display!=none line.hit matches the same proven pattern
  // tests/e2e/tooltip-keyboard-status.spec.js already uses for P-SCN-124 --
  // Playwright's actionability/visibility check on these transparent,
  // camera-panned hit lines is unreliable (bounding boxes can read as
  // off-viewport even when display!=none and the app itself renders/hits
  // them fine), so a locator .click() times out where a real click
  // wouldn't.
  const clicked = await page.evaluate(() => {
    const line = [...document.querySelectorAll('line.hit')].find((l) => l.getAttribute('display') !== 'none');
    if (!line) return false;
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (clicked) await page.waitForTimeout(300);
}
async function captureSolo(page, id) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
  await page.locator('.rail-btn[data-action="index"]').click();
  await page.locator('#objectDrawer').waitFor({ state: 'visible' });
  await page.locator('#objectSearch').fill(id === 'FO.CAIN' ? 'Cain' : 'RelO.R7080EA25');
  const soloBtn = page.locator(`[data-solo="${id}"]`).first();
  await soloBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await soloBtn.count()) await soloBtn.click();
}
async function captureHiddenAnchor(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
  await page.locator('.rail-btn[data-action="index"]').click();
  await page.locator('#objectDrawer').waitFor({ state: 'visible' });
  const eye = page.locator('[data-eye="FO.CORPSE"]').first();
  if (await eye.count()) await eye.click();
  await page.locator('[data-close="objectDrawer"]').first().click().catch(() => {});
}
async function captureAllHiddenRecovery(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  for (const type of ['RNO', 'MNO', 'FO', 'NameO', 'RefO', 'RelO']) {
    // Disabling the active object's own type closes the drawer as part of
    // the live app's own field-attention reset; reopen it before each
    // toggle (matches tests/generated/critical-triples.spec.js).
    if (!(await page.locator('#fieldViewDrawer').first().evaluate((el) => el.classList.contains('open')))) {
      await page.locator('.rail-btn[data-action="view"]').click();
      await page.locator('#fieldViewDrawer').waitFor({ state: 'visible' });
    }
    const toggle = page.locator(`[data-type="${type}"]`);
    if ((await toggle.getAttribute('aria-pressed')) !== 'false') {
      await toggle.click();
      await page.waitForFunction((t) => document.querySelector(`[data-type="${t}"]`)?.getAttribute('aria-pressed') === 'false', type).catch(() => {});
    }
  }
}
async function captureIndexNoResults(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await page.locator('.rail-btn[data-action="index"]').click();
  await page.locator('#objectDrawer').waitFor({ state: 'visible' });
  await page.locator('#objectSearch').fill('zzz-no-such-object-zzz');
}
async function captureRouteLong(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  // clickNode() tags nodes with data-bb-test-id itself on every call; the
  // previous pre-check here queried that attribute *before* any clickNode
  // call had run, always saw zero matches, and `continue`d on every
  // iteration -- this function committed nothing at all (F09/R7: caught the
  // same way as captureWholeField's bug above).
  // routeApertureEvents() (src/app.js) only collapses the strip once
  // history.route.length exceeds maxTail+1 (4+1=5 at this >=1180px
  // viewport, including the 1 onboarding event). The previous 4-commit list
  // landed at exactly 5 total events -- one short of collapse -- so this
  // "route-long" screenshot was indistinguishable from an ordinary short
  // route. A 5th distinct commit (6 total) reliably collapses it; opening
  // the resulting drawer is what actually shows the long-route state.
  for (const id of ['FO.CORPSE', 'FO.CAIN', 'FO.BURIAL', 'FO.ALLAH', 'FO.ABEL']) {
    await clickNode(page, id).catch(() => {});
  }
  const ellipsis = page.locator('#route [data-route-open], #route .route-ellipsis').first();
  if (await ellipsis.count()) {
    await ellipsis.click();
    await page.locator('#routeDrawer').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }
}
// Route and trace clear independently (Route drawer's two distinct
// buttons, #clearRouteDrawer / #clearFieldTraceDrawer -- clicking one never
// rewrites the other, per test:design's own contract). The two capture
// functions below previously collapsed to one identical function that
// clicked neither button, producing byte-identical images for what the
// evidence plan names as opposite states (F09/R7).
// The Route strip's expand-to-drawer ellipsis (.route-ellipsis /
// [data-route-open]) only renders once the strip is actually collapsed
// (routeApertureEvents() in src/app.js: at a desktop width, collapse needs
// more than 5 total Route events -- onboarding's own FO.BLACK_BIRD_FIELD
// entry plus 5 explicit commits clears that). Fewer commits leaves no
// ellipsis in the DOM at all, so a fixed 5-node commit sequence is used
// here rather than the 2-node one that previously made the drawer-open
// click time out (F09/R7).
async function openRouteDrawer(page) {
  for (const id of ['FO.CORPSE', 'FO.CAIN', 'FO.BURIAL', 'FO.ALLAH', 'FO.ABEL']) {
    await clickNode(page, id);
  }
  const ellipsis = page.locator('#route [data-route-open], #route .route-ellipsis').first();
  await ellipsis.click();
  await page.locator('#routeDrawer').waitFor({ state: 'visible', timeout: 5000 });
}
async function captureRouteClearedTraceRetained(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await openRouteDrawer(page);
  await page.locator('#clearRouteDrawer').click();
  await page.locator('[data-close="routeDrawer"]').first().click().catch(() => {});
}
async function captureTraceClearedRouteRetained(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await openRouteDrawer(page);
  await page.locator('#clearFieldTraceDrawer').click();
  await page.locator('[data-close="routeDrawer"]').first().click().catch(() => {});
}
async function captureAboutReturn(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  // Commits a specific object before opening About so the capture proves
  // About's overlay/inert cycle leaves the *prior* focused state intact on
  // return, rather than landing on whatever gotoField's own auto-focus
  // happened to leave behind (which nothing here would visibly distinguish
  // from a bare neutral field capture -- F09/R7).
  await clickNode(page, 'FO.BURIAL');
  await page.locator('.rail-btn[data-action="about"]').click();
  await page.locator('#aboutPanel').waitFor({ state: 'visible' });
  await page.locator('#aboutClose').click();
}
async function captureViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
}
async function captureForcedColors(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ forcedColors: 'active' });
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.CORPSE');
}
async function captureReducedMotion(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // gotoField(..., {reduced:true}) already emulates reduced motion for
  // *every* static capture in this file, so a second capture that also
  // settles on FO.CORPSE at 1280x800 (captureFocusOrdinary's own target)
  // is byte-identical to it -- not evidence of anything reduced-motion-
  // specific, since the post-settle end state doesn't depend on how it got
  // there. FO.ODIN is a real canonical node no other capture function
  // targets, so this at least proves a distinct, reduced-motion-emulated
  // commit renders correctly rather than silently re-proving
  // focus-ordinary-1280 under a different name (F09/R7).
  await gotoField(page, { reduced: true });
  await clickNode(page, 'FO.ODIN');
}
async function captureKeyboardFocus(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
}
async function captureTooltip(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await tagNodes(page);
  const node = page.locator('g.node[data-bb-test-id="FO.CAIN"]');
  const box = await node.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
}
async function captureModalFocus(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoField(page, { reduced: true });
  await page.locator('.rail-btn[data-action="about"]').click();
  await page.locator('#aboutPanel').waitFor({ state: 'visible' });
}

const STATIC_SETS = {
  'ARTISTIC-CORE': [
    ['threshold', (p) => captureThreshold(p)],
    ['whole-field-1440', (p) => captureWholeField(p, 1440, 960)],
    ['whole-field-1280', (p) => captureWholeField(p, 1280, 800)],
    ['focus-ordinary-1280', (p) => captureFocusOrdinary(p, 1280, 800)],
    ['black-bird-aperture', (p) => captureAperture(p)],
    ['relo-clearing', (p) => captureRelOClearing(p)],
    ['route-wear-afterglow', (p) => captureRouteWearAfterglow(p)],
    ['reader-field-composition', (p) => captureReaderFieldComposition(p)],
    ['mobile-field-390', (p) => captureMobileField(p)],
    ['mobile-read-390', (p) => captureMobileRead(p)],
  ],
  'STATE-AND-RECOVERY': [
    ['projected-inspection', (p) => captureProjectedInspection(p)],
    ['solo-object', (p) => captureSolo(p, 'FO.CAIN')],
    ['solo-relo', (p) => captureSolo(p, 'RelO.R7080EA25')],
    ['hidden-anchor', (p) => captureHiddenAnchor(p)],
    ['all-hidden-recovery', (p) => captureAllHiddenRecovery(p)],
    ['index-no-results', (p) => captureIndexNoResults(p)],
    ['route-long', (p) => captureRouteLong(p)],
    ['route-cleared-trace-retained', (p) => captureRouteClearedTraceRetained(p)],
    ['trace-cleared-route-retained', (p) => captureTraceClearedRouteRetained(p)],
    ['about-return', (p) => captureAboutReturn(p)],
  ],
  'RESPONSIVE-ACCESS': [
    ['compact-1024', (p) => captureViewport(p, 1024, 640)],
    ['mobile-430', (p) => captureViewport(p, 430, 932)],
    ['narrow-320', (p) => captureViewport(p, 320, 640)],
    ['landscape-mobile', (p) => captureViewport(p, 844, 390)],
    ['text-zoom-200', (p) => captureViewport(p, 640, 400)],
    ['forced-colors', (p) => captureForcedColors(p)],
    ['reduced-motion', (p) => captureReducedMotion(p)],
    ['keyboard-edge-focus', (p) => captureKeyboardFocus(p)],
    ['tooltip-edge', (p) => captureTooltip(p)],
    ['modal-focus', (p) => captureModalFocus(p)],
  ],
};

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
// Every motion context below was previously created with a hardcoded
// 1280x800 recordVideo.size regardless of which scenario ran in it.
// Playwright's recordVideo.size, once set at context creation, is the
// video's fixed frame size for its whole lifetime -- calling
// setViewportSize() later (as 'mobile-complete-path' does, to actually
// show the mobile-shaped UI) changes the live page viewport but not the
// video frame, so that recording's real mobile-portrait content was
// letterboxed/scaled into a landscape 1280x800 frame instead of being
// recorded at its own real dimensions. Each entry below now names its
// required viewport so the context (and its video) is created at the
// right size from the start.
const MOTION_RECORDINGS = [
  ['entry-and-interruption', DESKTOP_VIEWPORT, async (page) => {
    await page.goto('http://127.0.0.1:4173/?bbtest=1');
    await page.waitForTimeout(1500);
    await gotoField(page, { reduced: false });
    await page.waitForTimeout(2000);
    await clickNode(page, 'FO.CORPSE');
    await page.waitForTimeout(6000);
  }],
  ['rapid-latest-action', DESKTOP_VIEWPORT, async (page) => {
    await gotoField(page, { reduced: true });
    for (const id of ['FO.CORPSE', 'FO.CAIN', 'FO.BURIAL', 'FO.ALLAH']) {
      await clickNode(page, id).catch(() => {});
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2000);
  }],
  ['preview-and-projected-inspection', DESKTOP_VIEWPORT, async (page) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CAIN');
    await page.waitForTimeout(2000);
    // See captureProjectedInspection's comment above -- line.hit is the
    // real click target and a direct dispatchEvent (not a locator .click())
    // is required for the same actionability-check reason.
    await page.evaluate(() => {
      const line = [...document.querySelectorAll('line.hit')].find((l) => l.getAttribute('display') !== 'none');
      if (line) line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(6000);
  }],
  ['relation-and-solo', DESKTOP_VIEWPORT, async (page) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'RelO.R7080EA25');
    await page.waitForTimeout(2000);
    await page.locator('.rail-btn[data-action="index"]').click();
    await page.locator('#objectDrawer').waitFor({ state: 'visible' });
    await page.locator('#objectSearch').fill('Cain');
    const soloBtn = page.locator('[data-solo="FO.CAIN"]').first();
    if (await soloBtn.count()) await soloBtn.click();
    await page.waitForTimeout(6000);
  }],
  ['temporal-truth-and-clears', DESKTOP_VIEWPORT, async (page) => {
    await gotoField(page, { reduced: true });
    // routeApertureEvents() (src/app.js) only collapses the strip to an
    // ellipsis -- the sole way to open the route drawer, D-DEC-10/22 -- once
    // history.route.length exceeds maxTail+1 (5 at this >=1180px viewport,
    // including the 1 onboarding event). Two commits never collapses it, so
    // the ellipsis never appears and this recording silently skipped its own
    // drawer-open/clear-trace action, landing under the required 8s floor.
    // Six distinct commits (5 here + onboarding's 1) reliably collapses it.
    for (const id of ['FO.CORPSE', 'FO.CAIN', 'FO.BURIAL', 'FO.ALLAH', 'FO.ABEL']) {
      await clickNode(page, id);
    }
    await page.waitForTimeout(1000);
    const ellipsis = page.locator('#route [data-route-open], #route .route-ellipsis').first();
    if (await ellipsis.count()) {
      await ellipsis.click();
      await page.locator('#routeDrawer').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const clearTrace = page.locator('#clearFieldTraceDrawer');
      if (await clearTrace.count()) await clearTrace.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(4000);
  }],
  ['mobile-complete-path', MOBILE_VIEWPORT, async (page) => {
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await page.waitForTimeout(1500);
    await page.locator('[data-mobile="read"]').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-mobile="field"]').click();
    await page.waitForTimeout(4000);
  }],
  ['reduced-motion-parity', DESKTOP_VIEWPORT, async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoField(page, { reduced: true });
    await clickNode(page, 'FO.CORPSE');
    await clickNode(page, 'FO.CAIN');
    await page.waitForTimeout(7000);
  }],
];

async function buildContactSheet(browser, setId, imagePaths) {
  const page = await browser.newPage({ viewport: { width: 900, height: 3400 }, baseURL: BASE_URL });
  const items = imagePaths
    .map(([name, p]) => `<div class="cell"><div class="label">${name}</div><img src="file://${p}"></div>`)
    .join('\n');
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:#0b0a09;font-family:monospace;color:#e7e1d7;}
    .grid{display:flex;flex-direction:column;gap:8px;padding:8px;}
    .cell{border:1px solid #3a352e;}
    .label{padding:4px 8px;font-size:12px;background:#141210;}
    img{display:block;width:100%;height:auto;}
  </style></head><body><div class="grid">${items}</div></body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(300);
  const outPath = path.join(STATIC_DIR, `${setId}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
  return outPath;
}

async function main() {
  mkdirSync(STATIC_DIR, { recursive: true });
  mkdirSync(MOTION_DIR, { recursive: true });
  mkdirSync(MACHINE_DIR, { recursive: true });
  const sha = candidateSha();

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CI ? undefined : '/opt/pw-browsers/chromium' });

  const supplementary = [];
  const requiredEntries = [];

  try {
    // ── static per-set captures + composite contact sheets ──────────────
    for (const [setId, captures] of Object.entries(STATIC_SETS)) {
      const setDir = path.join(STATIC_DIR, setId);
      mkdirSync(setDir, { recursive: true });
      const shots = [];
      for (const [name, fn] of captures) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, baseURL: BASE_URL });
        try {
          await fn(page);
          await page.waitForTimeout(300);
          const outPath = path.join(setDir, `${name}.png`);
          await page.screenshot({ path: outPath });
          shots.push([name, outPath]);
          const capDims = pngDimensions(outPath);
          // Individual static captures are primary, gate-required evidence
          // (F09/R7): tests/contracts/evidence-plan.json declares all 30 by
          // name, matching final-closure-contract.json's
          // required_evidence_ids -- not the 3 grouped contact sheets below,
          // which the contract itself calls "supplementary review aids
          // only" (evidence_truth invariant).
          requiredEntries.push({
            id: `${setId}/${name}`,
            path: path.relative(OUT, outPath),
            sha256: sha256(outPath),
            candidate_sha: sha,
            artifact_class: 'application-capture',
            pixel_dimensions: [capDims.width, capDims.height],
          });
        } catch (err) {
          console.error(`capture failed: ${setId}/${name}: ${err.message}`);
        } finally {
          await page.close();
        }
      }
      const sheetPath = await buildContactSheet(browser, setId, shots);
      const dims = pngDimensions(sheetPath);
      supplementary.push({
        id: `contact-sheet/${setId}`,
        path: path.relative(OUT, sheetPath),
        sha256: sha256(sheetPath),
        candidate_sha: sha,
        artifact_class: 'application-capture',
        pixel_dimensions: [dims.width, dims.height],
      });
    }

    // ── motion recordings ─────────────────────────────────────────────
    for (const [name, viewport, fn] of MOTION_RECORDINGS) {
      const context = await browser.newContext({
        viewport,
        baseURL: BASE_URL,
        recordVideo: { dir: MOTION_DIR, size: viewport },
      });
      const page = await context.newPage();
      try {
        await fn(page);
      } catch (err) {
        console.error(`motion capture failed: ${name}: ${err.message}`);
      }
      await page.close();
      const videoPath = await page.video().path();
      await context.close();
      const finalPath = path.join(MOTION_DIR, `${name}.webm`);
      if (existsSync(videoPath)) {
        const { renameSync } = await import('node:fs');
        renameSync(videoPath, finalPath);
        requiredEntries.push({
          id: `motion/${name}`,
          path: path.relative(OUT, finalPath),
          sha256: sha256(finalPath),
          candidate_sha: sha,
          artifact_class: 'motion',
        });
      }
    }

    // ── machine artifacts ────────────────────────────────────────────
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, baseURL: BASE_URL });
      await gotoField(page, { reduced: true });
      await clickNode(page, 'FO.CORPSE');
      await clickNode(page, 'FO.CAIN');
      const state = await page.evaluate(() => {
        const s = window.__bbTest?.getState?.() ?? {};
        const ui = window.__bbTest?.getUiRuntime?.() ?? {};
        return { ...s, uiRuntime: ui };
      });
      const design = await page.evaluate(() => window.__bbDesign?.snapshot?.());
      const geometry = await page.evaluate(() =>
        [...document.querySelectorAll('g.node')].slice(0, 10).map((g) => ({
          id: g.getAttribute('data-bb-id'),
          transform: g.getAttribute('transform'),
        }))
      );
      await page.close();
      writeFileSync(path.join(MACHINE_DIR, 'state.json'), JSON.stringify({ candidate_sha: sha, state }, null, 2));
      writeFileSync(path.join(MACHINE_DIR, 'event.json'), JSON.stringify({ candidate_sha: sha, routeEvents: state.history?.route ?? [] }, null, 2));
      writeFileSync(path.join(MACHINE_DIR, 'geometry.json'), JSON.stringify({ candidate_sha: sha, sample: geometry }, null, 2));
      writeFileSync(path.join(MACHINE_DIR, 'design.json'), JSON.stringify({ candidate_sha: sha, design }, null, 2));
      for (const f of ['state.json', 'event.json', 'geometry.json', 'design.json']) {
        const p = path.join(MACHINE_DIR, f);
        requiredEntries.push({ id: `machine/${f}`, path: path.relative(OUT, p), sha256: sha256(p), candidate_sha: sha, artifact_class: 'derived-report' });
      }
    }

    // accessibility: copy axe-core scan summary if present, else regenerate a minimal one.
    {
      const a11yPath = path.join(MACHINE_DIR, 'accessibility.json');
      // AxeBuilder requires a page created from an explicit context
      // (browser.newContext().newPage()), not the browser.newPage(options)
      // shorthand used elsewhere in this file -- it throws "Please use
      // browser.newContext()" otherwise. That's exactly what was silently
      // swallowed below before this fix (every prior evidence run's
      // accessibility.json was actually a recorded scanner failure, not a
      // real scan -- see the no-swallowed-failure comment below).
      const a11yContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: BASE_URL });
      const page = await a11yContext.newPage();
      await gotoField(page, { reduced: true });
      await clickNode(page, 'FO.CORPSE');
      // No swallowed action failures (E5): a scanner exception used to be
      // written into the report as {violations: {error: "..."}} -- a
      // malformed, non-array "violations" field that ci-evidence-gate.mjs
      // never inspected (only checked the file was non-empty), so a
      // completely failed scan could pass evidence gating as if it were a
      // clean result. A real scan failure must fail evidence generation
      // itself, not get papered over as data.
      const { AxeBuilder } = require('@axe-core/playwright');
      const axeResult = await new AxeBuilder({ page }).analyze();
      await a11yContext.close();
      if (!Array.isArray(axeResult?.violations)) {
        throw new Error('machine/accessibility.json: axe-core scan did not return a violations array');
      }
      writeFileSync(a11yPath, JSON.stringify({ candidate_sha: sha, violations: axeResult.violations }, null, 2));
      requiredEntries.push({ id: 'machine/accessibility.json', path: path.relative(OUT, a11yPath), sha256: sha256(a11yPath), candidate_sha: sha, artifact_class: 'derived-report' });
    }

    // coverage-report: machine/coverage-report.json is a primary,
    // gate-required entry (F09/R7), so it must be generated fresh for this
    // exact candidate_sha by something that actually runs everywhere.
    // `npm run test:coverage` (scripts/generate-coverage.mjs) is not that --
    // it reads the read-only authority models under
    // .bb-authority/authority/models/*.json, which are deliberately
    // untracked and absent in every fresh checkout (CI included), so it can
    // only ever run in a session where that overlay happens to be present.
    // scripts/check-scenario-coverage.mjs instead validates the durable,
    // committed tests/generated/scenario-coverage-map.json (the *output* of
    // an earlier test:coverage run, checked into the repo) and is real,
    // reproducible, executable evidence everywhere -- its own JSON report
    // (scenario_count/covered/gap/excluded) becomes the coverage-report
    // artifact directly.
    {
      const covDst = path.join(MACHINE_DIR, 'coverage-report.json');
      const covOutput = execSync('node scripts/check-scenario-coverage.mjs', { cwd: ROOT, encoding: 'utf8' });
      writeFileSync(covDst, JSON.stringify({ candidate_sha: sha, ...JSON.parse(covOutput) }, null, 2));
      requiredEntries.push({ id: 'machine/coverage-report.json', path: path.relative(OUT, covDst), sha256: sha256(covDst), candidate_sha: sha, artifact_class: 'derived-report' });
    }

    // build-manifest: git/build provenance.
    {
      const buildManifestPath = path.join(MACHINE_DIR, 'build-manifest.json');
      const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const indexHash = sha256(path.join(ROOT, 'index.html'));
      writeFileSync(
        buildManifestPath,
        JSON.stringify(
          { candidate_sha: sha, package_version: pkg.version, node_version: process.version, index_html_sha256: indexHash, generated_at: new Date().toISOString() },
          null,
          2
        )
      );
      requiredEntries.push({ id: 'machine/build-manifest.json', path: path.relative(OUT, buildManifestPath), sha256: sha256(buildManifestPath), candidate_sha: sha, artifact_class: 'derived-report' });
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }

  // ── human-review.json: every dimension left pending, never self-attested ──
  // tests/contracts/evidence-plan.json (F09/R7) is the single, committed
  // source for the dimension-id list -- present identically in every
  // checkout, local or CI, replacing the untracked .bb-authority/ overlay
  // this used to read (with a hardcoded, easy-to-drift duplicate fallback
  // for when that overlay was absent).
  const dimensions = Object.fromEntries(EVIDENCE_PLAN.human_review_dimensions.map((d) => [d, 'pending_user_review']));
  writeFileSync(
    path.join(OUT, 'human-review.json'),
    JSON.stringify({ candidate_sha: sha, note: 'Artistic acceptance is a user/GPT decision; no dimension below is agent-attested.', dimensions }, null, 2)
  );

  // ── manifest.json: all 44 declarative primary artifacts + disclosed supplementary evidence ──
  writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        schema_version: '2.0.0',
        candidate_sha: sha,
        generated_at: new Date().toISOString(),
        entries: requiredEntries,
        supplementary_evidence: supplementary,
        note:
          'entries[] contains exactly the 44 primary artifacts declared in tests/contracts/evidence-plan.json (the 30 individually-named static captures, 7 motion recordings, and 7 machine reports required_evidence_ids/required_primary_entry_count in tests/contracts/final-closure-contract.json also name) -- scripts/ci-evidence-gate.mjs verifies entries[] is exactly this set, no more and no fewer. supplementary_evidence[] holds the 3 grouped contact-sheet composites, which final-closure-contract.json itself calls "supplementary review aids only", not mechanically gated evidence.',
      },
      null,
      2
    )
  );

  console.log(`evidence generated for ${sha}: ${requiredEntries.length} required entries, ${supplementary.length} supplementary artifacts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
