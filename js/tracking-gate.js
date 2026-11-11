/* Prevent one-frame SLAM status changes from arming hand interactions. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeTrackingGate=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function createState(){return{good:0,bad:0,stable:false};}
 function update(state,status,goodFrames=10,badFrames=3){
  if(status==='NORMAL'){
   state.good=Math.min(goodFrames,state.good+1);
   state.bad=0;
   if(state.good>=goodFrames)state.stable=true;
  }else{
   state.bad=Math.min(badFrames,state.bad+1);
   state.good=0;
   if(state.bad>=badFrames)state.stable=false;
  }
  return state.stable;
 }
 return Object.freeze({createState,update});
});
