const {test,expect}=require('@playwright/test');const {gotoField}=require('./bb-helpers.cjs');
test.describe('app shell containment',()=>{
 for(const vp of [{width:1440,height:960},{width:1280,height:800},{width:1024,height:640}]){
  test(`rail, main, and reader panel never exceed the viewport at ${vp.width}x${vp.height}`,async({page})=>{await page.setViewportSize(vp);await gotoField(page);const h=await page.evaluate(()=>({app:document.querySelector('#app').getBoundingClientRect().height,rail:document.querySelector('.rail').getBoundingClientRect().height,main:document.querySelector('.main').getBoundingClientRect().height,panel:document.querySelector('.panel').getBoundingClientRect().height}));for(const k of ['app','rail','main','panel'])expect(h[k],`${k} height`).toBeLessThanOrEqual(vp.height+1);});
 }
 test('keyboard Tab traversal through every node never scrolls the app shell',async({page})=>{await page.setViewportSize({width:1280,height:800});await gotoField(page);let maxScroll=0;for(let i=0;i<58;i++){await page.keyboard.press('Tab');const st=await page.evaluate(()=>document.querySelector('#app').scrollTop);maxScroll=Math.max(maxScroll,st);}expect(maxScroll).toBe(0);});
});
