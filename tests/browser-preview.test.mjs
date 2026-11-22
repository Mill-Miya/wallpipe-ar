import assert from 'node:assert/strict';
import {chromium} from 'playwright';

for(const mobile of [false,true]){
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(mobile)await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{value:'iPhone Safari'}));
  await page.goto('http://127.0.0.1:8765/pipe-preview.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#app').dataset.preview==='true');
  await page.locator('#collapse').click();
  assert(await page.locator('.maker img').evaluate(img=>img.naturalWidth>0));
  assert(await page.locator('.return-ar').isVisible());
  for(const mode of ['water','air','plant']){
   await page.locator('[data-mode="'+mode+'"]').click();
   for(let i=0;i<6;i++){
    await page.locator('#regen').click();
    const count=await page.locator('#valveSelect option').count();
    assert(mode==='plant'?count>=2&&count<=5:count===3);
    await page.locator('#toggle').click();
    assert.equal(await page.locator('#opening').inputValue(),'0');
   }
  }
  await page.evaluate(async()=>Promise.all(['ball','gate','control','butterfly'].map(type=>window.WallPipeValveAssets.loadValveModel(type))));
  assert(await page.locator('#arCanvas').evaluate(canvas=>Boolean(canvas.getContext('webgl2'))));
  const overflow=await page.locator('#panel').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  assert(overflow.scroll<=overflow.width,'Panel should not scroll horizontally');
  await page.screenshot({path:mobile?'/tmp/wallpipe-unified-mobile.png':'/tmp/wallpipe-unified-desktop.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS unified '+(mobile?'mobile':'desktop')+' preview, modes, regeneration, opening, GLB and panel width');
 }finally{await browser.close();}
}
const browser=await chromium.launch({headless:true,args:['--disable-webgl']});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8765/pipe-preview.html');
 await page.getByText('3D表示を開始できません。',{exact:false}).waitFor();
 console.log('PASS preview explains unavailable WebGL');
}finally{await browser.close();}
