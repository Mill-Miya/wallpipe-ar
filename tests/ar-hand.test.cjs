'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const Engine=require(path.join(root,'js/piping-engine.js'));
const G=require(path.join(root,'js/gesture-control.js'));
const page=fs.readFileSync(path.join(root,'ar-hand.html'),'utf8');
const app=fs.readFileSync(path.join(root,'js/ar-hand.js'),'utf8');
const screenMap=fs.readFileSync(path.join(root,'js/hand-screen-map.js'),'utf8');
const trackingGate=fs.readFileSync(path.join(root,'js/tracking-gate.js'),'utf8');
function failIfMissing(strings,body,where){for(const s of strings)assert.ok(body.includes(s),`${where}: missing ${s}`)}
failIfMissing(['@8thwall/engine-binary@1','three.module.js','js/ar-hand.js','XR Engineライセンス','arCanvas','id="place"','id="start"'],page,'HTML');
failIfMissing(['XR8.Threejs.xrScene','XR8.XrController.updateCameraProjectionMatrix','scale:\'absolute\'','onAttach:({video:sourceVideo,stream:sourceStream})','detectForVideo(video,now)','anchor.position.copy','anchor.rotation.set','anchor.localToWorld','Gestures.step','Engine.solveFlow'],app,'AR integration');
failIfMissing(['id="quickAction"','id="handTransform"','id="handRetry"','js/hand-screen-map.js','js/tracking-gate.js'],page,'Alignment and quick launch');
failIfMissing(['HandMap.mapLandmarks','TrackingGate.update','addValveLabel','updateQuickAction','onDetach:()=>','video.videoWidth','junctionShape','jointRadius','visibilitychange','handInitFailed'],app,'Tracking, cleanup, and hand alignment');
assert(app.includes("if(video&&!landmarker&&!loadingHand)initializeHandTracking()"),'Hand model should initialize after placement');
assert(!app.includes("onAttach:({video:sourceVideo})=>{video=sourceVideo||null;initializeHandTracking()"),'Do not start MediaPipe before AR placement');
failIfMissing(['Math.max(rect.width/w,rect.height/h)','cw90','ccw90','mirror'],screenMap,'Cover crop and orientation');
failIfMissing(['@8thwall/xrextras@1','id="rescan"','id="placeDistance"','id="placeHeight"','id="targetReticle"','arCanvas'],page,'XR camera recovery and placement');
failIfMissing(['XRExtras.FullWindowCanvas.pipelineModule','ui.rescan.addEventListener','anchor.position.y+=Number(ui.height.value)','Number(ui.distance.value)','ui.reticle.classList.add','ui.distance.disabled=true'],app,'World-space placement controls');
// The new valve silhouettes live in authored, independently generated GLB assets.
const assetLoader=fs.readFileSync(path.join(root,'js/valve-assets.js'),'utf8');
const generator=fs.readFileSync(path.join(root,'tools/generate_valves.py'),'utf8');
failIfMissing(['ValveAssets.loadValveModel','attachAuthoredValve','valveRevision','mount.scale.setScalar','v.handle.userData.pivotHeight'],app,'Authored valve integration');
failIfMissing(['GLTFLoader','actuator_','disc_','../assets/valves/','clone()'],assetLoader,'Detailed mesh loader');
failIfMissing(['revolution(','elliptical_loft(','handwheel(','flange(','for kind in'],generator,'Custom mesh generation');
assert(!app.includes('function makeValve(i){'),'Do not regress to primitive-only valve bodies');
assert(page.includes('width:100vw!important')&&page.includes('height:100dvh!important'),'Fullscreen canvas layout must remain enabled');

// Regression: iPhone landscape/portrait image alignment, smaller initial model,
 // and visible diagnostics are required before claiming AR hand usability.
failIfMissing(['id="handHud"','id="placeScale"','id="placeDistance"','value="1.3"','value="1.40"'],page,'AR viewport and hand visibility');
failIfMissing(['handStatus','ownedVideo.srcObject=sourceStream','anchor.scale.setScalar(Number(ui.scale.value))','ui.scale.disabled=false','lastInference=now'],app,'Hand feed and placement scale');
assert(page.includes('v0.9.4'),'AR exploratory layout release marker must match');
failIfMissing(['id="handOcclusion"','id="handOcclusionToggle"','js/hand-occlusion.js'],page,'Hand foreground overlay UI');
failIfMissing(['js/hand-model-loader.js','id="presetExplore"','id="presetOverview"','id="handFailureDetails"'],page,'Hand loader and AR exploration controls');
failIfMissing(['HandLoader.load','preferGPU:false','ui.handFailureDetails.textContent','selectViewPreset','anchor.scale.setScalar(Number(ui.scale.value))'],app,'Pinned hand SDK and spatial exploration integration');
failIfMissing(['HandOcclusion.render','paintHandOcclusion(points)','clearHandOcclusion()'],app,'Hand foreground integration');
failIfMissing(['goodFrames=10','badFrames=3',"status==='NORMAL'"],trackingGate,'SLAM hysteresis');
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
