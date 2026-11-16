'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const page=fs.readFileSync('gesture-test.html','utf8');
const beginAt=page.indexOf('async function begin(){');
const trackAt=page.indexOf('function track(time){',beginAt);
const stopAt=page.indexOf('function stop(){',trackAt);
const stopEnd=page.indexOf("\n$('startBtn').addEventListener",stopAt);
assert(beginAt>0&&trackAt>beginAt&&stopAt>trackAt&&stopEnd>stopAt);
const beginSource=page.slice(beginAt,trackAt);
const stopSource=page.slice(stopAt,stopEnd);
async function verifyCameraFailure(failureStage){
 let stopped=0;
 const track={stop(){stopped++;}};
 const mediaStream={getTracks(){return [track];}};
 const controls={startBtn:{disabled:false},stopBtn:{disabled:true}};
 const video={
  srcObject:null,style:{display:'none'},
  classList:{toggle(){}},
  play(){return failureStage==='play'?Promise.reject(Object.assign(new Error('Playback denied'),{name:'NotAllowedError'})):Promise.resolve();}
 };
 let status='';
 const sandbox={
  navigator:{mediaDevices:{getUserMedia(){return failureStage==='permission'?Promise.reject(Object.assign(new Error('Camera denied'),{name:'NotAllowedError'})):Promise.resolve(mediaStream);}}},
  video,$:id=>controls[id],gesture:{reset(){}},state:{},
  setStatus(message){status=message;},
  camera:'environment',point:null
 };
 const result=await vm.runInNewContext(`(async()=>{
  let stream=null,running=false,detector=null,cameraSession=0;
  ${beginSource}
  ${stopSource}
  await begin();
  return {stream,running,startDisabled:$('startBtn').disabled,stopDisabled:$('stopBtn').disabled};
 })()`,sandbox,{filename:'gesture-camera-extracted.js'});
 assert.equal(result.running,false,'Failed startup must not enter running state');
 assert.equal(result.stream,null,'Failed startup must release stream reference');
 assert.equal(video.srcObject,null,'Failed startup must detach the camera video');
 assert.equal(video.style.display,'none','Failed startup must hide the video');
 assert.equal(result.startDisabled,false,'User must be able to retry camera startup');
 assert.equal(result.stopDisabled,true,'Stop button should be disabled after failure');
 assert.match(status,/カメラを開始できません/,'User should see original startup error');
 assert.equal(stopped,failureStage==='play'?1:0,'Acquired camera track must be stopped on playback failure');
}
async function verifyCancelledStart(stage){
 let resolvePermission,resolvePlayback,stopped=0,draws=0;
 const streamObject={getTracks(){return [{stop(){stopped++;}}];}};
 const permission=new Promise(resolve=>{resolvePermission=resolve;});
 const playback=new Promise(resolve=>{resolvePlayback=resolve;});
 const video={
  srcObject:null,style:{display:'none'},classList:{toggle(){}},
  play(){return stage==='play'?playback:Promise.resolve();}
 };
 const controls={startBtn:{disabled:false},stopBtn:{disabled:true}};
 const sandbox={
  navigator:{mediaDevices:{getUserMedia(){return stage==='permission'?permission:Promise.resolve(streamObject);}}},
  video,$:id=>controls[id],gesture:{reset(){}},state:{},camera:'environment',
  setStatus(){},requestAnimationFrame(){draws++;},track(){},point:null
 };
 const pending=vm.runInNewContext(`(async()=>{
  let stream=null,running=false,detector={},cameraSession=0;
  ${beginSource}
  ${stopSource}
  const task=begin();
  await Promise.resolve();
  stop(); // Simulate pagehide while camera permission or playback is still pending.
  await Promise.resolve();
  return {task,read:()=>({stream,running,startDisabled:$('startBtn').disabled,stopDisabled:$('stopBtn').disabled})};
 })()`,sandbox);
 const {task,read}=await pending;
 if(stage==='permission')resolvePermission(streamObject);
 else resolvePlayback();
 await task;
 const result=read();
 assert.equal(result.running,false,'Cancelled camera startup must not reactivate camera ('+stage+')');
 assert.equal(result.stream,null,'Cancelled startup must not retain a stream ('+stage+')');
 assert.equal(video.srcObject,null,'Cancelled startup must not attach video ('+stage+')');
 assert.equal(video.style.display,'none','Cancelled startup must not show video ('+stage+')');
 assert.equal(result.startDisabled,false);
 assert.equal(result.stopDisabled,true);
 assert.equal(stopped,1,'Late camera acquisition must close its track exactly once ('+stage+')');
 assert.equal(draws,0,'Cancelled camera startup must not schedule tracking');
}
(async()=>{
 await verifyCameraFailure('play');
 await verifyCameraFailure('permission');
 await verifyCancelledStart('permission');
 await verifyCancelledStart('play');
 console.log('PASS: camera startup failures release acquired tracks, reset video and controls, preserve error and permit retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
