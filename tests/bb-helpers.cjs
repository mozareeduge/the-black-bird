'use strict';
const {expect}=require('@playwright/test');
async function gotoField(page,{mobile=false,realOnboarding=false,reduced=false}={}){if(reduced)await page.emulateMedia({reducedMotion:'reduce'});await page.goto(realOnboarding?'/?bbtest=1':'/?skipIntro=1&bbtest=1');if(realOnboarding){const enter=page.getByRole('button',{name:/enter/i}).first();await expect(enter).toBeVisible();await enter.click();}await page.waitForFunction(()=>{const s=window.__bbTest?.getState();return s&&document.querySelectorAll('g.node').length===50&&s.lifecycle.phase==='focused'&&!!s.reading.anchorId;},{timeout:12000});await page.waitForFunction(()=>window.__bbDesign?.fieldFitted?.()===true,{timeout:8000}).catch(()=>{});await waitForCameraSettled(page);}
async function tagNodes(page){await page.evaluate(()=>{for(const g of document.querySelectorAll('g.node'))if(g.__data__?.id)g.setAttribute('data-bb-test-id',g.__data__.id);});}
function node(page,id){return page.locator(`g.node[data-bb-test-id="${id}"]`);}
async function waitForCameraSettled(page){await page.waitForFunction(()=>{const t=window.__bbTest?.getUiRuntime?.()?.transform;const s=t?`${t.x}|${t.y}|${t.k}`:'';if(window.__bbLastCamera===s&&window.__bbCameraStableSince&&performance.now()-window.__bbCameraStableSince>=100) return true;if(window.__bbLastCamera!==s){window.__bbLastCamera=s;window.__bbCameraStableSince=performance.now();}return false;},{timeout:4000}).catch(()=>{});}
// The focus force (4.2) heats the simulation (alphaTarget 0.16) for up to
// ~420ms after every commit; clicking while the target node is still being
// actively pulled toward its ring position is a real source of missed
// clicks, not just a test artifact. Settling on low alpha first makes a
// single real click land reliably instead of needing force+retry (4.3).
async function waitForSimSettled(page){await page.waitForFunction(()=>{try{return (window.__bbDesign?.simAlpha?.()??0) < 0.12;}catch(e){return true;}},{timeout:3000}).catch(()=>{});}
async function clickNode(page,id){
  await tagNodes(page);
  const loc=node(page,id);
  await expect(loc).toBeVisible();
  await waitForCameraSettled(page);
  await waitForSimSettled(page);
  // One real, unforced click (T-REQ-045, D-DEC-17): pointer activation goes
  // through the app's own screen-space resolution (resolveNearestVisibleNode,
  // BB-R06) exactly as a real reader's click would -- never a forced-option
  // or retry-until-active bypass. Authored-position focus rings (F04) can
  // legitimately place two nodes' hit-circles close enough that Playwright's
  // locator-level actionability check sees a DIFFERENT node's hit-circle as
  // the topmost element at the target's bounding-box center and refuses to
  // dispatch at all -- the same ambiguity a real mouse click at that exact
  // pixel would have. A real user resolves that by clicking at the point
  // they see the node, and the app's own click handler already resolves
  // pointer ambiguity from that real screen point; page.mouse.click at the
  // target's own precise, measured center reproduces that real interaction
  // instead of asking Playwright to arbitrate DOM stacking order first.
  const hit=loc.locator('.node-hit,.bb-hit,.node-core,.bb-body').first();
  await hit.scrollIntoViewIfNeeded();
  const box=await hit.boundingBox();
  if(!box) throw new Error(`clickNode: ${id} has no measurable hit target`);
  await page.mouse.click(box.x+box.width/2, box.y+box.height/2);
  const activeId=await page.evaluate(()=>window.__bbTest?.getUiRuntime?.()?.focusedId);
  if(activeId===id) return;
  const diag=await page.evaluate((targetId)=>{
    const ui=window.__bbTest?.getUiRuntime?.()||{};
    const g=[...document.querySelectorAll('g.node')].find(x=>x.__data__?.id===targetId);
    const box=g?g.getBoundingClientRect():null;
    return {activeId:ui.focusedId,transform:ui.transform,simAlpha:window.__bbDesign?.simAlpha?.(),targetBox:box?{x:box.x,y:box.y,w:box.width,h:box.height}:null};
  },id);
  throw new Error(`clickNode: a real click landed but did not commit ${id}. diagnostics=${JSON.stringify(diag)}`);
}
async function appState(page){return page.evaluate(()=>{const s=window.__bbTest?.getState?.()||{};const ui=window.__bbTest?.getUiRuntime?.()||{};return{phase:s.lifecycle?.phase,surface:s.responsive?.surface,activeId:ui.focusedId,routeIds:(s.history?.route||[]).map(e=>e.id),soloIds:s.solo?.active?[...s.solo.members].sort():null,overlay:ui.chromeOverlay,aboutOpen:s.overlay?.kind==='about',transform:ui.transform?{x:ui.transform.x,y:ui.transform.y,k:ui.transform.k}:null};});}
async function noGeometryErrors(page){const bad=await page.evaluate(()=>[...document.querySelectorAll('line,path,circle,rect')].filter(el=>[...el.attributes].some(a=>/NaN|Infinity/.test(a.value))).map(el=>el.outerHTML.slice(0,160)));expect(bad).toEqual([]);}
module.exports={gotoField,tagNodes,node,clickNode,appState,noGeometryErrors};
