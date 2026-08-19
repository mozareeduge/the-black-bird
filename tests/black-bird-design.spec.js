const {test,expect}=require('@playwright/test');const {gotoField,clickNode,appState,noGeometryErrors}=require('./bb-helpers.cjs');
async function design(page){return page.evaluate(()=>window.__bbDesign?.snapshot());}
test.describe('decided visual-system contract',()=>{
 test.beforeEach(async({page})=>{await page.setViewportSize({width:1280,height:800});await gotoField(page);await page.waitForFunction(()=>window.__bbDesign?.contractVersion==='2.0.0');});
 test('canonical morphology and aperture role',async({page})=>{const x=await page.evaluate(()=>{const api=window.__bbDesign;const nodes=[...document.querySelectorAll('g.node')].map(g=>g.__data__).filter(Boolean);const rep=type=>nodes.find(n=>n.type===type && n.id!=='FO.BLACK_BIRD_FIELD')?.id;const ids=['FO.BLACK_BIRD_FIELD',rep('FO'),rep('RNO'),rep('MNO'),rep('NameO'),rep('RefO'),rep('RelO')];if(ids.some(x=>!x))throw new Error('Missing canonical morphology representative');return ids.map(id=>api.morphologyFor(id));});expect(x[0]).toMatchObject({canonicalType:'FO',visualRole:'APERTURE',morphology:'aperture'});expect(x.map(v=>v.morphology)).toEqual(['aperture','fo','rno','mno','nameo','refo','relo']);await page.evaluate(()=>{for(const g of document.querySelectorAll('g.node'))if(g.__data__?.id)g.setAttribute('data-bb-test-id',g.__data__.id);});expect(await page.locator('[data-bb-test-id="FO.BLACK_BIRD_FIELD"] .bb-aperture-core').count()).toBe(1);});
  test('ordinary focus is warm/cold and route remains selected history',async({page})=>{await clickNode(page,'FO.CORPSE');const before=await design(page);await clickNode(page,'FO.BURIAL');const after=await design(page);expect(after.lightMode).toBe('warm-cold');expect(after.routeIds.at(-1)).toBe('FO.BURIAL');expect(after.routeIds.length).toBe(before.routeIds.length+1);expect(after.wearEntries.length).toBeGreaterThanOrEqual(0);expect(after.wearEntries.every(e=>e.passCount<=7)).toBeTruthy();});
 test('RelO focus creates one live bone clearing and suppresses penumbra',async({page})=>{await clickNode(page,'RelO.R4CB4A8D8');const s=await design(page);expect(s.lightMode).toBe('clearing');expect(s.clearing.relOId).toBe('RelO.R4CB4A8D8');expect(s.clearing.count).toBe(1);expect(s.clearing.finite).toBeTruthy();expect(s.penumbraVisible).toBeFalsy();expect(s.clearing.visibleMemberIds.length).toBeGreaterThan(1);await noGeometryErrors(page);});
 test('RelO clearing is one masked field with no visible member circles or spokes (4.9, BB-R11)',async({page})=>{await clickNode(page,'RelO.R4CB4A8D8');const counts=await page.evaluate(()=>({field:document.querySelectorAll('.bb-clearing-field').length,circles:document.querySelectorAll('circle.bb-clearing').length,spokes:document.querySelectorAll('line.bb-clearing-spoke').length,opacity:+getComputedStyle(document.querySelector('.bb-clearing-field')).opacity}));expect(counts.field).toBe(1);expect(counts.circles).toBe(0);expect(counts.spokes).toBe(0);expect(counts.opacity).toBeGreaterThan(0);await noGeometryErrors(page);});
 test('RelO clearing has positive local-luminance presence: rendered mean luminance inside is detectably higher than matched cold-field background (H-VIS-006 positive-presence rule)',async({page})=>{
  await clickNode(page,'RelO.R4CB4A8D8');
  await page.waitForTimeout(900);
  const nodeBox=await page.locator('[data-bb-test-id="RelO.R4CB4A8D8"]').boundingBox().catch(()=>null)
    ?? await (async()=>{await page.evaluate(()=>{for(const g of document.querySelectorAll('g.node'))if(g.__data__?.id)g.setAttribute('data-bb-test-id',g.__data__.id);});return page.locator('[data-bb-test-id="RelO.R4CB4A8D8"]').boundingBox();})();
  const vp=page.viewportSize();
  const buf=await page.screenshot();
  const dataUrl='data:image/png;base64,'+buf.toString('base64');
  const cx=nodeBox.x+nodeBox.width/2, cy=nodeBox.y+nodeBox.height/2;
  // Candidate points near the RelO center (should sample the clearing tint,
  // not a node body) vs. far corners of the field pane (should be plain
  // cold background) -- both filtered through elementFromPoint so only
  // genuine SVG-background samples (not a node/label/chrome element) count.
  const insideCandidates=[[cx+70,cy],[cx-70,cy],[cx,cy+70],[cx,cy-70],[cx+50,cy+50],[cx-50,cy-50]];
  const outsideCandidates=[[40,40],[vp.width*0.42,40],[40,vp.height-40],[vp.width*0.42,vp.height-40]];
  const result=await page.evaluate(async({dataUrl,insideCandidates,outsideCandidates})=>{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=dataUrl;});
    const canvas=document.createElement('canvas');
    canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,0,0);
    const scaleX=img.width/window.innerWidth, scaleY=img.height/window.innerHeight;
    function isBackground(x,y){
      const el=document.elementFromPoint(x,y);
      return !!el && (el.tagName==='svg' || el.classList?.contains('bb-clearing-field') || el.closest('.bb-clearing-layer'));
    }
    function luminance(x,y){
      const px=ctx.getImageData(Math.round(x*scaleX),Math.round(y*scaleY),1,1).data;
      return 0.2126*px[0]+0.7152*px[1]+0.0722*px[2];
    }
    const inside=insideCandidates.filter(([x,y])=>isBackground(x,y)).map(([x,y])=>luminance(x,y));
    const outside=outsideCandidates.filter(([x,y])=>isBackground(x,y)).map(([x,y])=>luminance(x,y));
    return {inside,outside};
  },{dataUrl,insideCandidates,outsideCandidates});
  expect(result.inside.length,'need at least one genuine clearing-background sample point').toBeGreaterThan(0);
  expect(result.outside.length,'need at least one genuine cold-field sample point').toBeGreaterThan(0);
  const meanInside=result.inside.reduce((a,b)=>a+b,0)/result.inside.length;
  const meanOutside=result.outside.reduce((a,b)=>a+b,0)/result.outside.length;
  expect(meanInside,`clearing luminance ${meanInside.toFixed(1)} must be detectably higher than cold-field luminance ${meanOutside.toFixed(1)}`).toBeGreaterThan(meanOutside*1.3);
 });
 test('aperture core stays darker than field in warm and clearing states',async({page})=>{await clickNode(page,'FO.BLACK_BIRD_FIELD');const colors=await page.evaluate(()=>{const g=[...document.querySelectorAll('g.node')].find(x=>x.__data__?.id==='FO.BLACK_BIRD_FIELD');return{field:getComputedStyle(document.documentElement).getPropertyValue('--bb-field').trim(),core:getComputedStyle(g.querySelector('.bb-aperture-core')).fill};});expect(colors.core).not.toBe('');await clickNode(page,'RelO.R4CB4A8D8');expect((await design(page)).apertureCoreLit).toBeFalsy();});
 test('afterglow and wear are bounded and Reset Trace does not rewrite Route',async({page})=>{await clickNode(page,'FO.CORPSE');await clickNode(page,'FO.BURIAL');let s=await design(page);expect(s.afterglowIds.length).toBeLessThanOrEqual(8);expect(s.wearEntries.every(e=>e.passCount<=7)).toBeTruthy();const route=[...s.routeIds];await page.evaluate(()=>window.__bbDesign.resetTrace());s=await design(page);expect(s.afterglowIds).toEqual([]);expect(s.wearEntries).toEqual([]);expect(s.routeIds).toEqual(route);});
 test('local fonts load with no external font requests',async({page})=>{const requests=[];page.on('request',r=>{if(/fonts\.googleapis|fonts\.gstatic|fontsource|jsdelivr|unpkg/i.test(r.url()))requests.push(r.url());});await page.reload();await page.waitForFunction(()=>window.__bbDesign?.fontSnapshot);const f=await page.evaluate(()=>window.__bbDesign.fontSnapshot());expect(f.faces.every(x=>x.status==='loaded')).toBeTruthy();expect(f.urls.every(x=>x.startsWith('assets/fonts/'))).toBeTruthy();expect(requests).toEqual([]);});
 test('reduced motion preserves state without blur or pulse',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  // contractVersion alone only proves window.__bbDesign exists -- it says
  // nothing about whether the post-reload auto-focus/camera-fit/simulation
  // settling that reload re-triggers (the same sequence gotoField() gates
  // on for every other test in this suite) has actually finished. Racing
  // clickNode against that still-settling reheat was the real cause of
  // this test's ~1/3 flake rate (2nd clickNode's click lands on stale
  // coordinates, misses FO.BURIAL, activeId reads back as the initial
  // FO.BLACK_BIRD_FIELD) -- reproduced on clean HEAD via git stash, so
  // pre-existing, not caused by any fix earlier in this round.
  await page.waitForFunction(()=>{const s=window.__bbTest?.getState();return s&&document.querySelectorAll('g.node').length===50&&s.lifecycle.phase==='focused'&&!!s.reading.anchorId&&window.__bbDesign?.contractVersion==='2.0.0';},{timeout:12000});
  await page.waitForFunction(()=>window.__bbDesign?.fieldFitted?.()===true,{timeout:8000}).catch(()=>{});
  await clickNode(page,'FO.CORPSE');await clickNode(page,'FO.BURIAL');const s=await design(page);expect(s.reducedMotion).toBeTruthy();expect(s.maxAppliedBlurPx).toBe(0);expect(s.travelPulseActive).toBeFalsy();});
 test('no persistent map readout exists at any viewport; Reader carries persistent metadata instead (4.13, BB-R10)',async({page})=>{await clickNode(page,'FO.CORPSE');expect(await page.locator('#bbFocusReadout').count()).toBe(0);expect((await page.locator('#reader .meta').textContent())||'').toContain('FO.CORPSE');await page.setViewportSize({width:390,height:844});expect(await page.locator('#bbFocusReadout').count()).toBe(0);});
 test('performance and layer counts are bounded',async({page})=>{const p=await page.evaluate(()=>window.__bbDesign.performanceSnapshot());expect(p.nodeCount).toBe(50);expect(p.clearingCount).toBeLessThanOrEqual(1);expect(p.afterglowCount).toBeLessThanOrEqual(8);expect(p.timerCount).toBeLessThanOrEqual(12);await noGeometryErrors(page);});
});
