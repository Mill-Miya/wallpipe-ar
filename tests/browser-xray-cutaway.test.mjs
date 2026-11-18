import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try {
 const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8765/tests/xray-cutaway-fixture.html',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.__xrayFixture||window.__xrayFixtureError,null,{timeout:45000});
 const failure=await page.evaluate(()=>window.__xrayFixtureError);
 assert(!failure,'X-ray shader/render fixture failed: '+failure);
 const v=await page.evaluate(()=>window.__xrayFixture);
 assert.equal(errors.length,0,errors.join('\n'));
 assert(v.frontCount>0&&v.backCount===v.frontCount);
 assert.equal(v.frontOpacity,.33);assert.equal(v.rearOpacity,1);
 assert.equal(v.centerZ,.06);assert(v.fluidVisible);
 const difference=(a,b)=>Math.max(...a.slice(0,3).map((x,i)=>Math.abs(x-b[i])));
 const frontDiff=difference(v.frontWater,v.frontDry);
 const rearDiff=difference(v.rearWater,v.rearDry);
 const shellDiff=difference(v.frontWater,v.exposedWater);
 assert(frontDiff>12,'Fluid must be visible THROUGH front shell, not just on pipe exterior: '+JSON.stringify(v));
 assert(rearDiff<6,'Opaque rear must conceal internal water when viewed from behind: '+JSON.stringify(v));
 assert(shellDiff>4,'Front material must actually cover the fluid rather than disappear: '+JSON.stringify(v));
 const curveDiff=difference(v.elbow.bendWet,v.elbow.bendDry);
 const crossingDiff=difference(v.elbow.shortcutWet,v.elbow.shortcutDry);
 assert(curveDiff>10,'Fluid must be visible inside the curved elbow: '+JSON.stringify(v.elbow));
 assert(crossingDiff<7,'Water must NOT cut straight through the elbow corner: '+JSON.stringify(v.elbow));
 assert(v.elbow.curveRadius>.03,'Use the physical authored elbow radius');
 await page.screenshot({path:'/tmp/wallpipe-xray-water-core.png',fullPage:true});
 console.log('PASS real WebGL X-ray: interior visible from lever front but hidden behind opaque rear',JSON.stringify({frontDiff,rearDiff,shellDiff,...v}));
}finally{await browser.close();}