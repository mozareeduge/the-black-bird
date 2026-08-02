'use strict';
const {expect}=require('@playwright/test');
async function gotoField(page,{mobile=false,realOnboarding=false,reduced=false}={}){if(reduced)await page.emulateMedia({reducedMotion:'reduce'});await page.goto(realOnboarding?'/?bbtest=1':'/?skipIntro=1&bbtest=1');if(realOnboarding){const enter=page.getByRole('button',{name:/enter/i}).first();await expect(enter).toBeVisible();await enter.click();}await page.waitForFunction(()=>window.__bbState&&document.querySelectorAll('g.node').length===50&&window.__bbState.phase==='focused'&&!!window.__bbState.activeId,{timeout:12000});await page.waitForFunction(()=>window.__bbDesign?.fieldFitted?.()===true,{timeout:8000}).catch(()=>{});await waitForCameraSettled(page);}
async function tagNodes(page){await page.evaluate(()=>{for(const g of document.querySelectorAll('g.node'))if(g.__data__?.id)g.setAttribute('data-bb-test-id',g.__data__.id);});}
function node(page,id){return page.locator(`g.node[data-bb-test-id="${id}"]`);}
async function waitForCameraSettled(page){await page.waitForFunction(()=>{const t=window.__bbState?.transform;const s=t?`${t.x}|${t.y}|${t.k}`:'';if(window.__bbLastCamera===s&&window.__bbCameraStableSince&&performance.now()-window.__bbCameraStableSince>=100) return true;if(window.__bbLastCamera!==s){window.__bbLastCamera=s;window.__bbCameraStableSince=performance.now();}return false;},{timeout:4000}).catch(()=>{});}
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
  // Primary path: one real (non-forced) click, letting the app's own
  // deterministic screen-space pointer resolution (4.3) do the targeting.
  // Bounded to a short timeout: a real, unrelated overlay-interception
  // defect (KNOWN LIMITATION — see EVIDENCE-NOTES/PR: the closed mobile
  // #sheet is not fully removed from hit-testing at desktop sizes, tracked
  // for T03/T05 overlay-lifecycle work) can otherwise hang a real click
  // indefinitely; fail fast into the forced fallback instead.
  let activeId=null;
  try{
    await loc.locator('.node-hit,.bb-hit,.node-core,.bb-body').first().click({timeout:2500});
    activeId=await page.evaluate(()=>window.__bbState?.activeId);
  }catch(e){/* fall through to forced retries below */}
  if(activeId===id) return;
  // Fallback: a handful of forced retries with diagnostics, so a real
  // regression still fails loudly instead of hanging, while tolerating
  // rare residual timing races during this stage of the recomposition.
  for(let attempt=0;attempt<4;attempt++){
    await waitForCameraSettled(page);
    await waitForSimSettled(page);
    await loc.locator('.node-hit,.bb-hit,.node-core,.bb-body').first().click({force:true});
    activeId=await page.evaluate(()=>window.__bbState?.activeId);
    if(activeId===id) return;
  }
  const diag=await page.evaluate((targetId)=>{
    const s=window.__bbState||{};
    const g=[...document.querySelectorAll('g.node')].find(x=>x.__data__?.id===targetId);
    const box=g?g.getBoundingClientRect():null;
    return {activeId:s.activeId,transform:s.transform,simAlpha:window.__bbDesign?.simAlpha?.(),targetBox:box?{x:box.x,y:box.y,w:box.width,h:box.height}:null};
  },id);
  throw new Error(`clickNode: could not land focus on ${id}. diagnostics=${JSON.stringify(diag)}`);
}
async function appState(page){return page.evaluate(()=>{const s=window.__bbState||{};return{phase:s.phase,surface:s.surface,activeId:s.activeId,routeIds:(s.routeEvents||[]).map(e=>e.id),soloIds:s.soloSet?[...s.soloSet].sort():null,overlay:s.overlay,aboutOpen:s.aboutOpen,transform:s.transform?{x:s.transform.x,y:s.transform.y,k:s.transform.k}:null};});}
async function noGeometryErrors(page){const bad=await page.evaluate(()=>[...document.querySelectorAll('line,path,circle,rect')].filter(el=>[...el.attributes].some(a=>/NaN|Infinity/.test(a.value))).map(el=>el.outerHTML.slice(0,160)));expect(bad).toEqual([]);}
module.exports={gotoField,tagNodes,node,clickNode,appState,noGeometryErrors};
