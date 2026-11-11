'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const Engine=require(path.join(root,'js/piping-engine.js'));
const G=require(path.join(root,'js/gesture-control.js'));
const page=fs.readFileSync(path.join(root,'ar-hand.html'),'utf8');
const app=fs.readFileSync(path.join(root,'js/ar-hand.js'),'utf8');
function failIfMissing(strings,body,where){for(const s of strings)assert.ok(body.includes(s),`${where}: missing ${s}`)}
failIfMissing(['@8thwall/engine-binary@1','three.module.js','js/ar-hand.js','XR Engineライセンス','arCanvas','id="place"','id="start"'],page,'HTML');
failIfMissing(['XR8.Threejs.xrScene','XR8.XrController.updateCameraProjectionMatrix','scale:\'absolute\'','onAttach:({video:sourceVideo})','detectForVideo(video,now)','anchor.position.copy','anchor.rotation.set','anchor.localToWorld','Gestures.step','Engine.solveFlow'],app,'AR integration');
// World placement must be user-triggered: attaching a video alone must not auto-anchor.
assert(/ui\.place\.addEventListener\('click',placeModel\)/.test(app));
assert(/if\(!tracking\|\|!camera\|\|!anchor\)/.test(app));
assert(/anchor\.visible=false/.test(app));
let networkCases=0;
for(const mode of ['water','air','plant']){
 for(let seed=1;seed<=120;seed++){
  const net=Engine.makeNetwork({mode,surface:'wall',seed});
  assert.equal(net.valves.length,3);
  for(const state of [[1,1,1],[0,0,0],[.15,.35,.8],[0,1,1],[1,0,1],[1,1,0]]){
   const r=Engine.solveFlow(net,state);
   assert(Number.isFinite(r.total)&&r.total>=0);
   assert.equal(r.terminalFlows.length,3);
   assert(r.terminalFlows.every(f=>Number.isFinite(f)&&f>=-1e-6));
   if(state.every(v=>v===0))assert(r.terminalFlows.every(f=>Math.abs(f)<1e-6));
   networkCases++;
  }
 }
}
const pts=Array.from({length:21},()=>({x:200,y:180}));
pts[0]={x:200,y:240};pts[9]={x:200,y:180};pts[4]={x:201,y:172};pts[8]={x:202,y:174};
let g=G.createState();
let ev=G.step(g,pts,[{x:201,y:173},{x:450,y:450},{x:500,y:500}],[1,1,1],1000);
assert.equal(ev.kind,'grab');assert.equal(ev.index,0);
pts[9]={x:225,y:185};
ev=G.step(g,pts,[{x:201,y:173},{x:450,y:450},{x:500,y:500}],[1,1,1],1120);
assert.equal(ev.kind,'rotate');assert(ev.value<=1&&ev.value>=0);
ev=G.step(g,null,[],[1,1,1],1200);assert.equal(ev.kind,'lost');
console.log(`PASS: ${networkCases} network states, world-anchor API invariants, input gesture controls, license & disclosure`);
