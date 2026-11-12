import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({
 headless:true,
 args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[],consoleErrors=[],failedRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
page.on('requestfailed',r=>failedRequests.push(r.url()+' '+r.failure()?.errorText));
const waitReady=async (name)=>{
 await page.waitForFunction(()=>{
   const str=document.querySelector('#status')?.textContent||'';
   return /読込完了：/.test(str)||/でエラー|読み込めません/.test(str);
 },null,{timeout:40000});
 const status=await page.locator('#status').innerText();
 assert.match(status,/読込完了：/,name+' failed: '+status);
 const metrics=await page.locator('#metrics').innerText();
 const match=metrics.match(/設備ライン：([0-9]+)本 \/ バルブ表示：([0-9]+)/);
 assert(match,name+' missing metrics: '+metrics);
 assert.equal(Number(match[1]),Number(match[2]),name+' mismatched valve models');
 return {count:Number(match[1]),metrics};
};
try{
 await page.goto('http://127.0.0.1:8765/pipe-preview.html',{waitUntil:'domcontentloaded',timeout:40000});
 await waitReady('initial water');
 await page.locator('button[data-mode="air"]').click();
 await waitReady('HVAC');
 await page.locator('button[data-mode="plant"]').click();
 const totals=new Set(),palettes=new Set(),routes=new Set(),types=new Set();
 for(let i=0;i<18;i++){
   if(i>0)await page.locator('#regenerate').click();
   const out=await waitReady('factory regeneration '+i);
   assert(out.count>=2&&out.count<=5);
   totals.add(out.count);
   const palette=out.metrics.match(/配色：([^\n]+)/)?.[1]?.split(' / ')[0];
   if(palette)palettes.add(palette);
   const route=out.metrics.match(/構成：([^\n]+)/)?.[1];
   if(route)routes.add(route);
   for(const name of ['仕切弁','ボール弁','バタフライ弁','調節弁'])if(out.metrics.includes(name))types.add(name);
 }
 assert(totals.size>=3,'Only '+totals.size+' line counts seen');
 assert(palettes.size>=3,'Only '+palettes.size+' paint schemes seen');
 assert(routes.size>=9,'Only '+routes.size+' route schemes seen');
 assert.equal(types.size,4,'All authored valve styles should be encountered');
 assert.equal(errors.length,0,'Browser exceptions: '+errors.join(' / '));
 assert.equal(failedRequests.length,0,'Resource fetch failures: '+failedRequests.slice(0,3).join(' / '));
 const pixels=await page.evaluate(()=>{
   const canvas=document.querySelector('#canvas'),ctx=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
   return {width:canvas?.width||0,height:canvas?.height||0,gl:!!ctx};
 });
 assert(pixels.width>200&&pixels.height>200&&pixels.gl,'Three.js WebGL canvas not active');
 await page.screenshot({path:'/tmp/wallpipe-factory-browser.png',fullPage:true});
 console.log('PASS real Chromium GLB preview: factory counts', [...totals], 'palettes',palettes.size,'route styles',routes.size,'valve styles',types.size,'canvas',pixels);
}finally{
 if(errors.length)console.error('Page errors',errors);
 if(consoleErrors.length)console.error('Browser console errors',consoleErrors.slice(0,10));
 if(failedRequests.length)console.error('Failed requests',failedRequests.slice(0,10));
 await browser.close();
}
