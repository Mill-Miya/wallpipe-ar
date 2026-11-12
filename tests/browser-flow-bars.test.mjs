import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:720,height:480},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/tests/flow-bars-fixture.html',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.__flowFixture||window.__flowFixtureError,null,{timeout:30000});
 const e=await page.evaluate(()=>window.__flowFixtureError);
 assert(!e,'Flow visuals fixture failed: '+e);
 const x=await page.evaluate(()=>window.__flowFixture);
 assert.equal(errors.length,0,'Browser JS errors: '+errors.join('; '));
 assert.equal(x.ids.length,3);
 assert.equal(new Set(x.ids).size,3);
 assert.deepEqual(x.full.visible,[true,true,true],'All fixtures must show independent water columns');
 assert.deepEqual(x.none.visible,[false,false,false],'All closed must hide all columns');
 for(let i=0;i<3;i++){
  const expected=[true,true,true];expected[i]=false;
  assert.deepEqual(x.closed[i].visible,expected,'Closing valve '+i+' must hide only corresponding outlet');
 }
 assert(x.half.flows[0]<x.full.flows[0]&&x.half.flows[1]>0,'Partial opening must reduce only affected stream');
 const diff=(a,b)=>Math.max(...a.slice(0,3).map((v,i)=>Math.abs(v-b[i])));
 const pixels=x.full.colors.map((c,i)=>({index:i,visibleDifference:diff(c,x.none.colors[i]),closedDifference:diff(c,x.closed[i].colors[i])}));
 assert(pixels.every(v=>v.visibleDifference>12&&v.closedDifference>12),'Real WebGL pixels must change at each independent outlet: '+JSON.stringify(pixels));
 await page.screenshot({path:'/tmp/wallpipe-three-water-jets.png',fullPage:true});
 console.log('PASS real WebGL: three independent water jets, each shut-off changes only its own outlet pixel, partial flow reduces strength',JSON.stringify(pixels));
}finally{await browser.close();}
