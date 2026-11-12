'use strict';
const assert=require('node:assert/strict');
const M=require('../js/hand-screen-map.js'),T=require('../js/tracking-gate.js');
const rect={left:10,top:20,width:360,height:640};
const video={videoWidth:1280,videoHeight:720,rect};
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const mode of ['normal','mirror','cw90','ccw90','rotate180']){
 const center=M.mapPoint({x:.5,y:.5},{...video,mode});near(center.x,190);near(center.y,340);
}
// Landscape camera scaled to fill portrait canvas: horizontal crop is deliberate.
let p=M.mapPoint({x:0,y:.5},video);assert(p.x<10);near(p.y,340);
p=M.mapPoint({x:0,y:.5},{...video,mode:'mirror'});assert(p.x>370);
const rotated=M.mapPoint({x:.1,y:.2},{...video,mode:'cw90'});
const control=M.mapPoint({x:.8,y:.1},{videoWidth:720,videoHeight:1280,rect});
near(rotated.x,control.x);near(rotated.y,control.y);
assert.equal(M.mapPoint({x:0,y:0},{videoWidth:0,videoHeight:100,rect}),null);
assert.equal(M.mapLandmarks([{x:0,y:0}],video),null);
let gate=T.createState();for(let i=0;i<9;i++)assert.equal(T.update(gate,'NORMAL'),false);
assert.equal(T.update(gate,'NORMAL'),true);
assert.equal(T.update(gate,'LIMITED'),true);assert.equal(T.update(gate,'LIMITED'),true);
assert.equal(T.update(gate,'LIMITED'),false);
for(let i=0;i<10;i++)T.update(gate,'NORMAL');assert.equal(gate.stable,true);
// Rescan is an explicit restart, not a one-frame LIMITED event. The first
// NORMAL frame after rescan must not bypass the ten-frame stability gate.
assert.equal(T.reset(gate),gate);
assert.deepEqual(gate,{good:0,bad:0,stable:false});
assert.equal(T.update(gate,'NORMAL'),false);
for(let i=0;i<9;i++)T.update(gate,'NORMAL');
assert.equal(gate.stable,true);
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/ar-hand.js'),'utf8');
assert.match(app,/ui\.rescan\.addEventListener\('click',[\s\S]*?TrackingGate\.reset\(trackingGate\)/,'AR rescan must reset the hysteresis state');
console.log('PASS: crop, 4 alignment corrections, invalid inputs and SLAM tracking hysteresis');
