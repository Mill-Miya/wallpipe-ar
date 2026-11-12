/* WallPipe AR: approximate hand foreground compositing.
 * The existing XR video is clipped to a palm/finger landmark mask and
 * redrawn on top of the virtual mesh. This does NOT estimate 3D hand depth
 * or segment the exact silhouette. No additional camera permission/stream.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeHandOcclusion=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const CHAINS=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
 const PALM=[0,1,2,5,9,13,17];
 const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
 function valid(points){return Array.isArray(points)&&points.length>=21&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));}
 function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
 function geometry(points){
  if(!valid(points))return null;
  const width=distance(points[5],points[17]);
  if(!(width>8&&width<2000))return null;
  const radius=clamp(width*.115,5,26);
  const segments=[];
  for(const [chainIndex,chain] of CHAINS.entries()){
   for(let j=0;j<chain.length-1;j++){
    segments.push({
     a:points[chain[j]],b:points[chain[j+1]],
     r:radius*(chainIndex===0?1.0:1.12)*(1-j*.13)
    });
   }
  }
  return {palm:PALM.map(i=>points[i]),segments,width,radius};
 }
 function frameTransform(videoWidth,videoHeight,viewportWidth,viewportHeight,mode='normal'){
  if(![videoWidth,videoHeight,viewportWidth,viewportHeight].every(n=>Number.isFinite(n)&&n>0))return null;
  const turns=mode==='cw90'||mode==='ccw90';
  const drawnWidth=turns?videoHeight:videoWidth,drawnHeight=turns?videoWidth:videoHeight;
  const scale=Math.max(viewportWidth/drawnWidth,viewportHeight/drawnHeight);
  const rotation=mode==='cw90'?Math.PI/2:mode==='ccw90'?-Math.PI/2:mode==='rotate180'?Math.PI:0;
  return {scale,rotation,mirror:mode==='mirror',imageWidth:videoWidth*scale,imageHeight:videoHeight*scale};
 }
 function clear(canvas){
  if(!canvas||typeof canvas.getContext!=='function')return;
  const ctx=canvas.getContext('2d');if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);}
 }
 function circlePath(ctx,x,y,r){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);}
 function capsulePath(ctx,a,b,r){
  const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle)*r,ny=Math.cos(angle)*r;
  ctx.moveTo(a.x+nx,a.y+ny);
  ctx.lineTo(b.x+nx,b.y+ny);
  // The far cap must bulge *forward* along a->b, not back into the bone.
  ctx.arc(b.x,b.y,r,angle+Math.PI/2,angle-Math.PI/2,true);
  ctx.lineTo(a.x-nx,a.y-ny);
  // The wrist cap must bulge backward, maintaining a true capsule silhouette.
  ctx.arc(a.x,a.y,r,angle+Math.PI*1.5,angle+Math.PI/2,true);
  ctx.closePath();
 }
 function render(canvas,video,points,{mode='normal',pixelRatio=1.25}={}){
  if(!canvas||!video||!valid(points)){clear(canvas);return false;}
  const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height;
  if(!(width>0&&height>0)||!(video.videoWidth>0&&video.videoHeight>0)||video.readyState<2){clear(canvas);return false;}
  const g=geometry(points),transform=frameTransform(video.videoWidth,video.videoHeight,width,height,mode);
  if(!g||!transform){clear(canvas);return false;}
  const dpr=clamp(pixelRatio,1,1.5),pxW=Math.round(width*dpr),pxH=Math.round(height*dpr);
  if(canvas.width!==pxW)canvas.width=pxW;
  if(canvas.height!==pxH)canvas.height=pxH;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return false;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,pxW,pxH);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.save();ctx.beginPath();
  const palm=g.palm;
  ctx.moveTo(palm[0].x-rect.left,palm[0].y-rect.top);
  for(let i=1;i<palm.length;i++)ctx.lineTo(palm[i].x-rect.left,palm[i].y-rect.top);
  ctx.closePath();
  // Each bone is a rounded, slightly tapered capsule. Subpaths form a
  // union for clipping, preserving gaps between separated fingers.
  for(const segment of g.segments){
   const a={x:segment.a.x-rect.left,y:segment.a.y-rect.top};
   const b={x:segment.b.x-rect.left,y:segment.b.y-rect.top};
   capsulePath(ctx,a,b,segment.r);
  }
  for(const i of [4,8,12,16,20])circlePath(ctx,points[i].x-rect.left,points[i].y-rect.top,g.radius*.76);
  ctx.clip();
  ctx.translate(width/2,height/2);
  ctx.rotate(transform.rotation);
  if(transform.mirror)ctx.scale(-1,1);
  ctx.drawImage(video,-transform.imageWidth/2,-transform.imageHeight/2,transform.imageWidth,transform.imageHeight);
  ctx.restore();
  return true;
 }
 return Object.freeze({geometry,frameTransform,render,clear});
});
