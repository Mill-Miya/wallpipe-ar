/* WallPipe AR: true invisible hand-shaped depth mask.
 * Unlike copying the camera video into a foreground canvas, this mesh writes
 * ONLY depth at hand pixels. The already-rendered XR camera feed stays intact.
 * A separate monochrome CanvasTexture controls where virtual meshes cannot draw.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeHandDepthMask=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const PALM=[0,1,2,5,9,13,17];
 const CHAINS=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
 const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
 function validLandmarks(points){
  return Array.isArray(points)&&points.length>=21&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
 function getHandShape(points){
  if(!validLandmarks(points))return null;
  const width=Math.hypot(points[5].x-points[17].x,points[5].y-points[17].y);
  if(!(width>8&&width<2000))return null;
  return {width,radius:clamp(width*.115,5,26)};
 }
 // canvas is used only as a black/white texture. It is never shown on top
 // of the user-facing camera feed and never samples video pixels.
 function drawMask(canvas,points,rect,{pixelRatio=.75}={}){
  if(!canvas||!rect||!(rect.width>0&&rect.height>0))return false;
  const hand=getHandShape(points);
  if(!hand)return false;
  const scale=clamp(pixelRatio,.35,1.0);
  const w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));
  if(canvas.width!==w)canvas.width=w;
  if(canvas.height!==h)canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return false;
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,rect.width,rect.height);
  const local=p=>({x:p.x-rect.left,y:p.y-rect.top});
  ctx.fillStyle='#fff';
  ctx.beginPath();
  let a=local(points[PALM[0]]);
  ctx.moveTo(a.x,a.y);
  for(let i=1;i<PALM.length;i++){a=local(points[PALM[i]]);ctx.lineTo(a.x,a.y);}
  ctx.closePath();ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=0;i<CHAINS.length;i++){
   const chain=CHAINS[i];
   for(let j=0;j<chain.length-1;j++){
    const from=local(points[chain[j]]),to=local(points[chain[j+1]]);
    ctx.lineWidth=2*hand.radius*(i===0?1:1.12)*(1-j*.13);
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();
   }
  }
  ctx.fillStyle='#fff';
  for(const index of [4,8,12,16,20]){
   const tip=local(points[index]);
   ctx.beginPath();ctx.arc(tip.x,tip.y,hand.radius*.76,0,Math.PI*2);ctx.fill();
  }
  return true;
 }
 function quadVertices(inverseProjection,THREE,clipZ=-.96){
  const coords=[[-1,-1],[1,-1],[-1,1],[1,1]];
  return coords.map(([x,y])=>{
   const point=new THREE.Vector4(x,y,clipZ,1).applyMatrix4(inverseProjection);
   const w=point.w||1;
   return [point.x/w,point.y/w,point.z/w];
  });
 }
 function create({THREE,camera,canvas}){
  if(!THREE||!camera||!canvas)throw new Error('Depth mask needs Three.js camera and mask canvas');
  const texture=new THREE.CanvasTexture(canvas);
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  const material=new THREE.MeshBasicMaterial({
   color:0xffffff,alphaMap:texture,alphaTest:.55,
   colorWrite:false,depthWrite:true,depthTest:true,
   transparent:false,side:THREE.DoubleSide,blending:THREE.NoBlending,
   toneMapped:false
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
  geometry.setIndex([0,1,2,2,1,3]);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='wallpipe-hand-depth-only-mask';
  mesh.renderOrder=-10000;
  mesh.frustumCulled=false;
  mesh.visible=false;
  camera.add(mesh);
  let disposed=false;
  function update(points,rect){
   if(disposed)return false;
   if(!drawMask(canvas,points,rect)){mesh.visible=false;return false;}
   const inverse=camera.projectionMatrix.clone().invert();
   const verts=quadVertices(inverse,THREE);
   const pos=geometry.getAttribute('position');
   verts.forEach((v,i)=>pos.setXYZ(i,v[0],v[1],v[2]));
   pos.needsUpdate=true;
   // Camera is the parent, so the geometry follows the actual XR projection
   // on every update, while always remaining in front of physical pipe meshes.
   texture.needsUpdate=true;
   mesh.visible=true;
   return true;
  }
  function clear(){mesh.visible=false;}
  function dispose(){
   if(disposed)return;
   disposed=true;camera.remove(mesh);
   geometry.dispose();material.dispose();texture.dispose();
  }
  return Object.freeze({update,clear,dispose,mesh,texture,material});
 }
 return Object.freeze({validLandmarks,getHandShape,drawMask,quadVertices,create});
});
