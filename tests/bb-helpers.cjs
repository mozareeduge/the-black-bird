'use strict';
const {expect}=require('@playwright/test');
async function gotoField(page,{mobile=false,realOnboarding=false,reduced=false}={}){if(reduced)await page.emulateMedia({reducedMotion:'reduce'});await page.goto(realOnboarding?'/?bbtest=1':'/?skipIntro=1&bbtest=1');if(realOnboarding){const enter=page.getByRole('button',{name:/enter/i}).first();await expect(enter).toBeVisible();await enter.click();}await page.waitForFunction(()=>window.__bbState&&document.querySelectorAll('g.node').length===50&&window.__bbState.phase==='focused'&&!!window.__bbState.activeId,{timeout:12000});}
async function tagNodes(page){await page.evaluate(()=>{for(const g of document.querySelectorAll('g.node'))if(g.__data__?.id)g.setAttribute('data-bb-test-id',g.__data__.id);});}
function node(page,id){return page.locator(`g.node[data-bb-test-id="${id}"]`);}
async function clickNode(page,id){await tagNodes(page);const loc=node(page,id);await expect(loc).toBeVisible();await loc.locator('.node-hit,.bb-hit,.node-core,.bb-body').first().click({force:true});}
async function appState(page){return page.evaluate(()=>{const s=window.__bbState||{};return{phase:s.phase,surface:s.surface,activeId:s.activeId,routeIds:(s.routeEvents||[]).map(e=>e.id),soloIds:s.soloSet?[...s.soloSet].sort():null,overlay:s.overlay,aboutOpen:s.aboutOpen,transform:s.transform?{x:s.transform.x,y:s.transform.y,k:s.transform.k}:null};});}
async function noGeometryErrors(page){const bad=await page.evaluate(()=>[...document.querySelectorAll('line,path,circle,rect')].filter(el=>[...el.attributes].some(a=>/NaN|Infinity/.test(a.value))).map(el=>el.outerHTML.slice(0,160)));expect(bad).toEqual([]);}
module.exports={gotoField,tagNodes,node,clickNode,appState,noGeometryErrors};
