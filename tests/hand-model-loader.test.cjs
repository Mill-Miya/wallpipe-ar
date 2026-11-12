'use strict';
const assert=require('node:assert/strict');
const HandLoader=require('../js/hand-model-loader.js');
assert.equal(HandLoader.VERSION,'0.10.35','Must use a published pinned release');
assert(!HandLoader.PROVIDERS.some(x=>x.base.includes('0.10.22')));
assert.equal(HandLoader.PROVIDERS.length,2);
const stubInstance={detectForVideo() { return {landmarks:[]}; }};
const delegates=[],sourceUrls=[],stages=[];
const sdk={
 FilesetResolver:{forVisionTasks:async path=>({source:path})},
 HandLandmarker:{createFromOptions:async (vision,options)=>{
  delegates.push(options.baseOptions.delegate);
  assert(vision.source.includes('/wasm'));
  assert(options.baseOptions.modelAssetPath.endsWith('/hand_landmarker.task'));
  assert.equal(options.runningMode,'VIDEO');
  return stubInstance;
 }}
};
(async()=>{
 const result=await HandLoader.load({
  importer:async url=>{
   sourceUrls.push(url);
   if(url.includes('jsdelivr'))throw new Error('simulated CDN outage');
   return {default:sdk};
  },
  onStage:(stage)=>stages.push(stage),
  timeoutMs:1000
 });
 assert.equal(result.provider,'unpkg');
 assert.equal(result.delegate,'CPU');
 assert.equal(result.landmarker,stubInstance);
 assert.equal(delegates[0],'CPU');
 assert(stages.includes('SDK')&&stages.includes('WASM')&&stages.includes('MODEL')&&stages.includes('READY'));
 assert(sourceUrls.some(x=>x.includes('jsdelivr'))&&sourceUrls.some(x=>x.includes('unpkg')));
 const gpuFallback=await HandLoader.load({
  importer:async()=>({FilesetResolver:sdk.FilesetResolver,HandLandmarker:{createFromOptions:async(vision,opts)=>{
   if(opts.baseOptions.delegate==='CPU')throw new Error('CPU offline');
   return stubInstance;
  }}}),timeoutMs:1000
 });
 assert.equal(gpuFallback.delegate,'GPU');
 let failure;
 try{await HandLoader.load({importer:async()=>{throw new Error('not found 404')},timeoutMs:100});}
 catch(e){failure=e;}
 assert(failure&&failure.code==='HAND_MODEL_INIT_FAILED'&&failure.stage==='SDK');
 assert(failure.details.some(x=>x.includes('not found 404')));
 console.log('PASS: pinned MediaPipe SDK, alternate CDN, default exports, CPU/GPU fallbacks and failure stage');
})().catch(e=>{console.error(e);process.exitCode=1;});
