import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:360,height:240},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/tests/depth-mask-fixture.html',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.__depthMaskFixture||window.__depthMaskFixtureError,null,{timeout:30000});
 const err=await page.evaluate(()=>window.__depthMaskFixtureError);
 assert(!err,'WebGL depth mask fixture exception: '+err);
 const p=await page.evaluate(()=>window.__depthMaskFixture);
 assert(p.canvasWidth===360);
 const difference=(a,b)=>Math.max(...a.slice(0,3).map((n,i)=>Math.abs(n-b[i])));
 const backgroundDiff=difference(p.masked,p.noMask);
 assert(backgroundDiff>35,'Hand pixels must suppress opaque 3D pipe pixels. '+JSON.stringify(p));
 assert(difference(p.masked,p.outsideMasked)>35,'Depth-only hand pixel should show camera background rather than opaque scene');
 assert(difference(p.outsideMasked,p.outsideNoMask)<5,'Mask must not affect other portions of 3D model');
 assert(difference(p.restored,p.noMask)<5,'Hiding the mask must reveal the 3D model immediately');
 assert.equal(errors.length,0,'WebGL page errors '+errors.join('; '));
 await page.screenshot({path:'/tmp/wallpipe-depth-mask-webgl.png'});
 console.log('PASS WebGL depth-only hand occlusion: camera preserved, virtual mesh hidden within mask, restored after hand loss',JSON.stringify(p));
}finally{await browser.close();}
