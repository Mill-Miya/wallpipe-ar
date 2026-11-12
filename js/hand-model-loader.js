/** Load MediaPipe HandLandmarker with pinned, published SDK and visible failure stages.
 * No camera stream is opened here. XR owns the camera and provides the video.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeHandModelLoader=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const VERSION='0.10.35';
 const MODEL_URL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
 const PROVIDERS=[
  {name:'jsDelivr',base:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION},
  {name:'unpkg',base:'https://unpkg.com/@mediapipe/tasks-vision@'+VERSION}
 ];
 function timeout(promise,ms,stage){
  if(!(ms>0))return promise;
  let timeoutId;
  return Promise.race([
   promise,
   new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error(stage+' timeout')),ms);})
  ]).finally(()=>clearTimeout(timeoutId));
 }
 function getExports(mod){
  if(mod?.FilesetResolver&&mod?.HandLandmarker)return mod;
  if(mod?.default?.FilesetResolver&&mod?.default?.HandLandmarker)return mod.default;
  return null;
 }
 async function load({importer=url=>import(url),onStage=()=>{},preferGPU=false,timeoutMs=16000,modelUrl=MODEL_URL}={}){
  const failures=[];
  for(const provider of PROVIDERS){
   let sdk=null;
   // Some MediaPipe bundles expose named exports and others expose a default object.
   for(const url of [provider.base+'/vision_bundle.mjs',provider.base]){
    onStage('SDK',provider.name+' から手認識ライブラリを取得中…');
    try{
     const result=await timeout(Promise.resolve().then(()=>importer(url)),timeoutMs,'SDK');
     sdk=getExports(result);
     if(sdk)break;
     throw new Error('FilesetResolver / HandLandmarker not exported');
    }catch(error){failures.push('SDK / '+provider.name+': '+String(error?.message||error).slice(0,180));}
   }
   if(!sdk)continue;
   let vision;
   onStage('WASM',provider.name+' の推論エンジンを読み込み中…');
   try{
    vision=await timeout(sdk.FilesetResolver.forVisionTasks(provider.base+'/wasm'),timeoutMs,'WASM');
   }catch(error){failures.push('WASM / '+provider.name+': '+String(error?.message||error).slice(0,180));continue;}
   const delegates=preferGPU?['GPU','CPU']:['CPU','GPU'];
   for(const delegate of delegates){
    onStage('MODEL',delegate+'推論モデルを初期化中…');
    try{
     const options={
      baseOptions:{modelAssetPath:modelUrl,delegate},
      runningMode:'VIDEO',numHands:1,
      minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
     };
     const landmarker=await timeout(sdk.HandLandmarker.createFromOptions(vision,options),timeoutMs,'MODEL');
     if(!landmarker||typeof landmarker.detectForVideo!=='function')throw new Error('Invalid HandLandmarker instance');
     onStage('READY',delegate+'で手認識の準備が完了');
     return {landmarker,provider:provider.name,delegate,version:VERSION};
    }catch(error){failures.push('MODEL / '+provider.name+' '+delegate+': '+String(error?.message||error).slice(0,180));}
   }
  }
  const last=failures.at(-1)||'Unknown dependency failure';
  const error=new Error('Hand initialization failed: '+last);
  error.code='HAND_MODEL_INIT_FAILED';
  error.stage=last.split(' / ')[0]||'SDK';
  error.details=failures;
  throw error;
 }
 return Object.freeze({VERSION,MODEL_URL,PROVIDERS,getExports,load});
});
