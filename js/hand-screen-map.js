/* Map MediaPipe normalized video landmarks onto the AR canvas in CSS pixels.
 * Assumption: camera background uses center-crop/cover. UI offers correction if
 * the SDK applies an additional orientation or mirror transform.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeHandScreenMap=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function mapPoint(p,{videoWidth,videoHeight,rect,mode='normal'}){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!rect||!(videoWidth>0)||!(videoHeight>0)||!(rect.width>0)||!(rect.height>0))return null;
  let x=p.x,y=p.y,w=videoWidth,h=videoHeight;
  if(mode==='mirror')x=1-x;
  else if(mode==='cw90'){[x,y]=[1-y,x];[w,h]=[h,w];}
  else if(mode==='ccw90'){[x,y]=[y,1-x];[w,h]=[h,w];}
  else if(mode==='rotate180'){x=1-x;y=1-y;}
  const scale=Math.max(rect.width/w,rect.height/h);
  const sx=(w*scale-rect.width)/2,sy=(h*scale-rect.height)/2;
  return {x:rect.left+x*w*scale-sx,y:rect.top+y*h*scale-sy};
 }
 function mapLandmarks(points,config){
  if(!Array.isArray(points)||points.length<21)return null;
  const mapped=points.map(p=>mapPoint(p,config));
  return mapped.every(Boolean)?mapped:null;
 }
 return Object.freeze({mapPoint,mapLandmarks});
});
