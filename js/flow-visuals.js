/* Independent fluid-flow visualisation for generated WallPipe AR networks.
 * Each water terminal owns an outlet jet. Flow bars run along every routed
 * segment and use the solver's actual edge.flow rather than valve index order.
 * All positions are derived from network nodes. Nothing opens a camera.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeFlowVisuals=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function describeOutlets(network){
  if(!network||!Array.isArray(network.terminals)||!Array.isArray(network.nodes))throw new Error('Invalid piping network');
  return network.terminals.map((terminal,index)=>{
   const n=network.nodes[terminal.nodeId];
   if(!n)throw new Error('Outlet is missing network node '+terminal.nodeId);
   return Object.freeze({index,nodeId:terminal.nodeId,valveIndex:terminal.valveIndex,label:terminal.label,x:n.x,y:n.y});
  });
 }
 function outletStates(summary,baseline,mode='water'){
  if(!summary||!Array.isArray(summary.terminalFlows)||!Array.isArray(baseline)||baseline.length!==summary.terminalFlows.length)throw new Error('Outlet flow vector mismatch');
  return summary.terminalFlows.map((v,i)=>{
   const flow=Number.isFinite(v)?Math.max(0,v):0;
   const maxFlow=Math.max(1e-7,Number(baseline[i])||0);
   const ratio=clamp(flow/maxFlow,0,1.5);
   const strength=Math.sqrt(ratio);
   return Object.freeze({
    index:i,flow,ratio,strength,
    visible:mode==='water'&&flow>1e-5,
    length:0.09+0.27*clamp(strength,0,1.2),
    width:0.60+0.55*clamp(strength,0,1.2),
    opacity:0.40+0.28*clamp(strength,0,1.2)
   });
  });
 }
 function create({THREE,network,parent,point,mode='water',baseColor=0x2b8ea1,baseline}={}){
  if(!THREE||!network||!parent||typeof point!=='function')throw new Error('Flow visuals need Three.js, a network and a 3D anchor');
  const descriptors=describeOutlets(network);
  const ref=Array.isArray(baseline)?baseline:descriptors.map(()=>1);
  if(ref.length!==descriptors.length)throw new Error('Baseline must match terminal count');
  const root=new THREE.Group();root.name='wallpipe-flow-bars-and-outlets';
  parent.add(root);
  const barGeo=new THREE.CylinderGeometry(.008,.008,1,10,1,false);
  const jetGeo=new THREE.CylinderGeometry(.015,.019,1,12,1,true);
  const streakGeo=new THREE.CylinderGeometry(.005,.005,1,8,1,false);
  const pathMat=new THREE.MeshBasicMaterial({color:baseColor,transparent:true,opacity:.86,depthWrite:false,side:THREE.DoubleSide});
  const waterColor=mode==='water'?0x48bfe0:baseColor;
  const streakMat=new THREE.MeshBasicMaterial({color:0xc8f3fb,transparent:true,opacity:.84,depthWrite:false,side:THREE.DoubleSide});
  const barMarkers=[];
  const up=new THREE.Vector3(0,1,0);
  for(const edge of network.edges){
   const a=point(network.nodes[edge.a]),b=point(network.nodes[edge.b]);
   const r=clamp(edge.diameter*.00172,.014,.052);
   // Rendering on the near pipe surface instead of inside opaque metal
   // keeps the short traveling bars visible in the AR world view.
   a.z+=r+.009;b.z+=r+.009;
   const difference=new THREE.Vector3().subVectors(b,a),length=difference.length();
   if(length<=.0001)continue;
   const marker=new THREE.Mesh(barGeo,pathMat);
   marker.name='flow-path-'+edge.id;
   marker.quaternion.setFromUnitVectors(up,difference.clone().normalize());
   marker.scale.y=Math.min(.10,Math.max(.025,length*.24));
   marker.visible=false;root.add(marker);
   barMarkers.push({edge,a,b,length,mesh:marker});
  }
  const outlets=[];
  if(mode==='water'){
   for(const d of descriptors){
    const p=point(network.nodes[d.nodeId],.085);
    const group=new THREE.Group();group.name='water-outlet-'+d.index;group.position.copy(p);root.add(group);
    const jetMat=new THREE.MeshBasicMaterial({color:waterColor,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
    const column=new THREE.Mesh(jetGeo,jetMat);column.name='water-column-'+d.index;group.add(column);
    const streaks=[];
    for(let i=0;i<2;i++){
     const stripe=new THREE.Mesh(streakGeo,streakMat);
     stripe.name='water-highlight-'+d.index+'-'+i;
     stripe.position.z=.013;
     stripe.scale.y=.041;
     group.add(stripe);streaks.push(stripe);
    }
    group.visible=false;
    outlets.push({index:d.index,valveIndex:d.valveIndex,group,column,streaks,material:jetMat,length:.12,strength:0});
   }
  }
  let active=true,lastStates=outletStates({terminalFlows:ref.map(()=>0)},ref,mode);
  function sync(summary){
   if(!active)return [];
   const states=outletStates(summary,ref,mode);
   lastStates=states;
   for(const o of outlets){
    const state=states[o.index];
    o.group.visible=state.visible;
    o.length=state.length;
    o.strength=state.strength;
    o.column.scale.set(state.width,state.length,state.width);
    o.column.position.y=-state.length*.5-.019;
    o.material.opacity=state.opacity;
   }
   return states;
  }
  function animate(now){
   if(!active)return;
   const t=Number.isFinite(now)?now*.001:0;
   for(const entry of barMarkers){
    const flow=entry.edge.flow;
    entry.mesh.visible=Number.isFinite(flow)&&Math.abs(flow)>0.0001;
    if(!entry.mesh.visible)continue;
    const speed=clamp(.28+Math.sqrt(Math.abs(flow))*1.5,.28,1.4);
    const progress=((t*speed+entry.edge.id*.213)%1+1)%1;
    const p=flow>=0?progress:1-progress;
    entry.mesh.position.copy(entry.a).lerp(entry.b,p);
   }
   for(const outlet of outlets){
    if(!outlet.group.visible)continue;
    const speed=clamp(.55+outlet.strength*1.9,.5,3);
    for(let i=0;i<outlet.streaks.length;i++){
     const stripe=outlet.streaks[i];
     const p=((t*speed+i*.50)%1+1)%1;
     stripe.position.y=-.022-outlet.length*p;
     stripe.scale.y=Math.min(.045,outlet.length*.24);
    }
   }
  }
  function dispose(){
   if(!active)return;active=false;
   root.parent?.remove(root);
   for(const entry of barMarkers)entry.mesh.visible=false;
   for(const o of outlets)o.group.visible=false;
   for(const g of [barGeo,jetGeo,streakGeo])g.dispose();
   for(const m of [pathMat,streakMat,...outlets.map(o=>o.material)])m.dispose();
  }
  return Object.freeze({
   root,barMarkers,outlets,descriptors,baseline:[...ref],
   sync,animate,dispose,getStates:()=>lastStates
  });
 }
 return Object.freeze({describeOutlets,outletStates,create});
});
