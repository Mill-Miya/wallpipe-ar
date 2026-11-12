'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Occlusion=require('../js/hand-occlusion.js');
const points=Array.from({length:21},(_,i)=>({x:160+(i%5)*12,y:280-Math.floor(i/5)*30}));
points[5]={x:140,y:210};points[17]={x:260,y:210};
assert.equal(Occlusion.geometry(null),null);
assert.equal(Occlusion.geometry(points.slice(0,10)),null);
const shape=Occlusion.geometry(points);
assert.equal(shape.palm.length,7);
assert.equal(shape.segments.length,15);
assert(shape.radius>=5 && shape.radius<=26);
assert(shape.width===120);
const a=Occlusion.frameTransform(1280,720,390,844,'normal');
assert(a && a.imageWidth>=390 && a.imageHeight>=844);
const b=Occlusion.frameTransform(1280,720,390,844,'cw90');
assert.equal(b.rotation,Math.PI/2);
assert(b.imageHeight>=390); // Rotated image covers the viewport after transform
assert.equal(Occlusion.frameTransform(1280,720,390,844,'mirror').mirror,true);
assert.equal(Occlusion.frameTransform(0,720,390,844),null);
let draws=0,clips=0,clears=0,saveCount=0,restoreCount=0;
const ctx={
 setTransform(){},clearRect(){clears++;},save(){saveCount++;},restore(){restoreCount++;},
 beginPath(){},moveTo(){},lineTo(){},closePath(){},arc(){},clip(){clips++;},
 translate(){},rotate(){},scale(){},drawImage(){draws++;}
};
const canvas={width:0,height:0,getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}),getContext:()=>ctx};
const video={videoWidth:1280,videoHeight:720,readyState:4};
assert.equal(Occlusion.render(canvas,video,points,{mode:'normal',pixelRatio:1.25}),true);
assert.equal(draws,1);assert.equal(clips,1);
assert.equal(saveCount,restoreCount);
assert(canvas.width>=390&&canvas.height>=844);
Occlusion.clear(canvas);
assert(clears>=2);
const oldDraws=draws;
assert.equal(Occlusion.render(canvas,video,null),false);
assert.equal(draws,oldDraws,'No hand must not leave a frozen video overlay');
assert.equal(Occlusion.render(canvas,{...video,readyState:0},points),false);
assert.equal(draws,oldDraws,'Unready camera must clear overlay');
const html=fs.readFileSync('ar-hand.html','utf8');
const app=fs.readFileSync('js/ar-hand.js','utf8');
assert(html.includes('id="handOcclusion"')&&html.includes('id="handOcclusionToggle"'));
assert(html.includes('js/hand-occlusion.js'));
assert(html.includes('value="0.95"')&&html.includes('max="1.30"'));
assert(app.includes('HandOcclusion.render')&&app.includes('clearHandOcclusion()'));
assert(app.includes('paintHandOcclusion(points)'));
assert(!app.includes('navigator.mediaDevices.getUserMedia'),'Hand occlusion must reuse the XR camera');
console.log('PASS: hand contour, camera transform, clear state, optional HUD and initial AR scale');
