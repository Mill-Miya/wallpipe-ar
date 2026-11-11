/* Gesture controller for a camera-overlay experiment. No spatial hand/depth matching. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeGesture=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
 const deltaAngle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
 function createState(){return{held:-1,pinched:false,previousAngle:0,accum:0,startValue:0,hover:-1,hoverSince:0,hoverFired:false,cooldownUntil:0};}
 function reset(state){Object.assign(state,createState());return state;}
 function nearest(point,valves,radius=72){let index=-1,best=radius;for(let i=0;i<valves.length;i++){const d=distance(point,valves[i]);if(d<best){best=d;index=i;}}return index;}
 function isOpenHand(points){
  const wrist=points[0],index=points[8],indexJoint=points[6],middle=points[12],middleJoint=points[10];
  const palm=distance(points[0],points[9]);
  return palm>10 && distance(index,wrist)>distance(indexJoint,wrist)*1.08 &&
    distance(middle,wrist)>distance(middleJoint,wrist)*1.08 &&
    distance(points[4],index)>.58*palm;
 }
 function step(state,points,valves,openings,now){
  if(!points||points.length<21){state.held=-1;state.pinched=false;state.hover=-1;state.hoverFired=false;return{kind:'lost'};}
  const palm=distance(points[0],points[9]);
  if(palm<7){return{kind:'unreliable'};}
  const tip={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
  const close=distance(points[4],points[8]) < palm*(state.pinched?.52:.36);
  const rotation=angle(points[0],points[9]);
  // Projected hand/valve centers differ from physical grip points. Allow a wider,
  // but bounded, image-space interaction zone; the nearest valve wins.
  const nearby=nearest(tip,valves,Math.max(92,Math.min(158,palm*1.4)));
  if(close){
   state.hover=-1;state.hoverFired=false;
   if(!state.pinched){
    state.pinched=true;state.held=nearby;state.previousAngle=rotation;state.accum=0;
    if(nearby>=0){state.startValue=openings[nearby];return{kind:'grab',index:nearby,point:tip};}
    return{kind:'pinch-outside',point:tip};
   }
   if(state.held>=0){
    state.accum+=deltaAngle(state.previousAngle,rotation);state.previousAngle=rotation;
    const value=clamp(state.startValue+state.accum/(Math.PI/2),0,1);
    return{kind:'rotate',index:state.held,value,point:tip};
   }
   return{kind:'pinch-outside',point:tip};
  }
  if(state.pinched){const released=state.held;state.held=-1;state.pinched=false;state.hover=-1;return{kind:'release',index:released,point:tip};}
  if(now<state.cooldownUntil)return{kind:'cooldown',point:tip};
  const hover=nearby>=0&&isOpenHand(points)?nearby:-1;
  if(hover!==state.hover){state.hover=hover;state.hoverSince=now;state.hoverFired=false;}
  if(hover>=0){
   const elapsed=now-state.hoverSince;
   if(elapsed>=1400&&!state.hoverFired){
    state.hoverFired=true;state.cooldownUntil=now+900;
    return{kind:'dwell-toggle',index:hover,value:openings[hover]>.5?0:1,point:tip};
   }
   return{kind:'hover',index:hover,progress:clamp(elapsed/1400,0,1),point:tip};
  }
  return{kind:'tracking',point:tip};
 }
 return Object.freeze({createState,reset,step,nearest,deltaAngle,isOpenHand});
});
