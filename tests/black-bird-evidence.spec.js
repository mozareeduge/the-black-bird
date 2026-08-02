const {test,expect}=require('@playwright/test');const fs=require('fs'),path=require('path');const {gotoField,clickNode,appState}=require('./bb-helpers.cjs');
const out=path.resolve(__dirname,'../test-results/black-bird-evidence');const rows=[];test.beforeAll(()=>fs.mkdirSync(out,{recursive:true}));
async function capture(page,id,file){const state=await appState(page);const design=await page.evaluate(()=>window.__bbDesign?.snapshot());await page.screenshot({path:path.join(out,file),fullPage:false});rows.push({scenario_id:id,file,viewport:page.viewportSize(),state,design,captured_at:new Date().toISOString()});}
test('generate named candidate evidence matrix',async({page})=>{
 test.setTimeout(120_000);
 const runs=[
  ['SCN-01',{width:1440,height:900},async()=>gotoField(page,{realOnboarding:true,reduced:true}),'01-desktop-first-aperture.png'],
  ['SCN-02',{width:1280,height:800},async()=>{await gotoField(page);await clickNode(page,'FO.CORPSE');},'02-desktop-fo-warm-cold.png'],
  ['SCN-07',{width:1280,height:800},async()=>{await gotoField(page);await clickNode(page,'RelO.R4CB4A8D8');},'07-desktop-relo-clearing.png'],
  ['SCN-08',{width:1280,height:800},async()=>{await gotoField(page);await clickNode(page,'FO.CORPSE');await clickNode(page,'FO.BURIAL');},'08-desktop-afterglow-wear.png'],
  ['SCN-10',{width:1280,height:800},async()=>{await gotoField(page);await clickNode(page,'FO.CORPSE');await page.locator('[data-action="about"]').click();},'10-desktop-about-purity.png'],
  ['SCN-12',{width:1024,height:640},async()=>{await gotoField(page);await clickNode(page,'RelO.R4CB4A8D8');},'12-short-landscape-clearing.png'],
  ['SCN-13',{width:390,height:844},async()=>gotoField(page,{realOnboarding:true,reduced:true}),'13-mobile-first-field.png'],
  ['SCN-14',{width:390,height:844},async()=>{await gotoField(page);await clickNode(page,'FO.CORPSE');},'14-mobile-field-selection.png'],
  ['SCN-15',{width:390,height:844},async()=>{await gotoField(page);await clickNode(page,'FO.CORPSE');await page.locator('[data-mobile="read"]').click();},'15-mobile-read-same-object.png'],
  ['SCN-18',{width:1280,height:800},async()=>{await page.emulateMedia({reducedMotion:'reduce'});await gotoField(page,{reduced:true});await clickNode(page,'FO.CORPSE');await clickNode(page,'FO.BURIAL');},'18-reduced-motion-end-state.png']];
 for(const [id,vp,flow,file] of runs){await page.setViewportSize(vp);await flow();await page.waitForFunction(()=>window.__bbDesign?.contractVersion==='2.0.0');await capture(page,id,file);}
 expect(rows.length).toBe(runs.length);
});
test.afterAll(()=>{const index={schema_version:'1.0.0',candidate_commit:process.env.GITHUB_SHA||null,scenario_count:rows.length,rows};fs.writeFileSync(path.join(out,'evidence-index.json'),JSON.stringify(index,null,2)+'\n');});
