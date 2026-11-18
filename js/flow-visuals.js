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
   // The outlet pose belongs to the final physical pipe, not the valve.
   // A water fixture must have an explicit final edge ending at its nozzle.
   const edge=Number.isInteger(terminal.outletEdgeId)?network.edges[terminal.outletEdgeId]:null;
   if(terminal.kind==='fixture'&&(!edge||edge.b!==terminal.nodeId))throw new Error('Water outlet must end on a physical pipe edge');
   const previous=edge&&network.nodes[edge.a];
   const dx=previous?n.x-previous.x:0,dy=previous?previous.y-n.y:0;
   const length=Math.hypot(dx,dy);
   if(terminal.kind==='fixture'&&length<1)throw new Error('Water outlet has no defined pipe direction');
   const direction=length?Object.freeze({x:dx/length,y:dy/length,z:0}):null;
   return Object.freeze({index,nodeId:terminal.nodeId,valveIndex:terminal.valveIndex,label:terminal.label,x:n.x,y:n.y,outletEdgeId:terminal.outletEdgeId,direction});
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
  // Use the very same fitting plan as the authored GLB pipes. Raw node-to-node
  // cylinders would pass through the curved elbows instead of following them.
  const layout=mode==='water'?globalThis.WallPipePipeLayout?.plan(network):null;
  if(mode==='water'&&!layout)throw new Error('Water flow requires the authored pipe layout planner');
  const spans=layout?new Map(layout.spans.map(span=>[span.edgeId,span])):null;
  const root=new THREE.Group();root.name='wallpipe-flow-bars-and-outlets';
  parent.add(root);
  const coreRadius=mode==='water'?.006:.008;
  const barGeo=new THREE.CylinderGeometry(coreRadius,coreRadius,1,10,1,false);
  // A continuous, low-opacity fluid core makes the flow readable through the
  // translucent pipe wall even between moving bar pulses.
  const fluidGeo=mode==='water'?new THREE.CylinderGeometry(.010,.010,1,12,1,false):null;
  const jetGeo=new THREE.CylinderGeometry(.015,.019,1,12,1,true);
  const streakGeo=new THREE.CylinderGeometry(.005,.005,1,8,1,false);
  const pathMat=new THREE.MeshBasicMaterial({color:baseColor,transparent:true,opacity:.86,depthWrite:false,side:THREE.DoubleSide});
  const fluidMat=mode==='water'?new THREE.MeshBasicMaterial({
   color:0x32c6e9,transparent:true,opacity:.32,depthWrite:false,depthTest:true,side:THREE.DoubleSide
  }):null;
  const waterColor=mode==='water'?0x48bfe0:baseColor;
  const streakMat=new THREE.MeshBasicMaterial({color:0xc8f3fb,transparent:true,opacity:.84,depthWrite:false,side:THREE.DoubleSide});
  const barMarkers=[],coreMarkers=[],bendMarkers=[],bendGeometries=[];
  const up=new THREE.Vector3(0,1,0);
  for(const edge of network.edges){
   const span=spans?.get(edge.id);
   const a=span?new THREE.Vector3(span.a.x,span.a.y,span.a.z):point(network.nodes[edge.a]);
   const b=span?new THREE.Vector3(span.b.x,span.b.y,span.b.z):point(network.nodes[edge.b]);
   const r=clamp(edge.diameter*.00172,.014,.052);
   // Water flows inside the hollow pipe. Opaque HVAC/factory shells retain surface tracers.
   if(mode!=='water'){a.z+=r+.009;b.z+=r+.009;}
   const difference=new THREE.Vector3().subVectors(b,a),length=difference.length();
   if(length<=.0001)continue;
   const marker=new THREE.Mesh(barGeo,pathMat);
   marker.name='flow-path-'+edge.id;
   if(mode==='water')marker.renderOrder=4; // blend beneath translucent front
   marker.quaternion.setFromUnitVectors(up,difference.clone().normalize());
   marker.scale.y=mode==='water'
    ?Math.min(.075,Math.max(.006,length*.21),length*.60)
    :Math.min(.10,Math.max(.025,length*.24));
   marker.visible=false;root.add(marker);
   barMarkers.push({edge,a,b,length,mesh:marker});
   if(fluidGeo&&edge.valveIndex<0){
    const core=new THREE.Mesh(fluidGeo,fluidMat);
    core.name='flow-core-'+edge.id;
    core.quaternion.setFromUnitVectors(up,difference.clone().normalize());
    core.position.copy(a).lerp(b,.5);
    core.scale.y=length;
    core.renderOrder=3;
    core.visible=false;root.add(core);
    coreMarkers.push({edge,a,b,length,mesh:core});
   }
  }
  if(layout){
   // Elbow meshes use a quarter-circle of radius 2.45 times pipe radius.
   // Build the exact same centerline, not a quadratic approximation through
   // the node (which would put visible water outside the hollow bend).
   class ElbowCurve extends THREE.Curve{
    constructor(center,x,y,radius){
     super();this.center=center;this.x=x;this.y=y;this.radius=radius;
    }
    getPoint(t,target=new THREE.Vector3()){
     const angle=-Math.PI/2+clamp(t,0,1)*Math.PI/2;
     return target.copy(this.center)
      .addScaledVector(this.x,this.radius*Math.cos(angle))
      .addScaledVector(this.y,this.radius*Math.sin(angle));
    }
    getTangentAt(t,target=new THREE.Vector3()){
     const angle=-Math.PI/2+clamp(t,0,1)*Math.PI/2;
     return target.copy(this.x).multiplyScalar(-Math.sin(angle))
      .addScaledVector(this.y,Math.cos(angle)).normalize();
    }
   }
   for(const f of layout.fittings){
    if(f.type!=='elbow')continue;
    const adjacent=network.edges.find(e=>e.id===f.portIds[0]);
    if(!adjacent)continue;
    const n=point(network.nodes[f.nodeId]);
    const x=new THREE.Vector3(f.x.x,-f.x.y,0);
    const y=new THREE.Vector3(f.y.x,-f.y.y,0);
    const radius=f.shoulder,center=n.clone()
     .addScaledVector(x,-radius).addScaledVector(y,radius);
    const curve=new ElbowCurve(center,x,y,radius);
    const geometry=new THREE.TubeGeometry(curve,20,.010,10,false);
    bendGeometries.push(geometry);
    const core=new THREE.Mesh(geometry,fluidMat);
    core.name='flow-elbow-core-'+f.nodeId;
    core.renderOrder=3;core.visible=false;root.add(core);
    const marker=new THREE.Mesh(barGeo,pathMat);
    marker.name='flow-elbow-pulse-'+f.nodeId;
    marker.renderOrder=4;
    marker.scale.y=Math.min(.045,radius*.52);
    marker.visible=false;root.add(marker);
    bendMarkers.push({nodeId:f.nodeId,edge:adjacent,curve,radius,core,mesh:marker});
   }
  }
  const outlets=[];
  if(mode==='water'){
   for(const d of descriptors){
    // Place the jet just beyond the terminal flange along its last pipe's
    // outward direction. The local -Y axis points out of the nozzle.
    const direction=new THREE.Vector3(d.direction.x,d.direction.y,d.direction.z);
    const p=point(network.nodes[d.nodeId],.06).addScaledVector(direction,.019);
    const group=new THREE.Group();group.name='water-outlet-'+d.index;
    group.position.copy(p);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);
    root.add(group);
    const jetMat=new THREE.MeshBasicMaterial({color:waterColor,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
    const column=new THREE.Mesh(jetGeo,jetMat);column.name='water-column-'+d.index;column.renderOrder=6;group.add(column);
    const streaks=[];
    for(let i=0;i<2;i++){
     const stripe=new THREE.Mesh(streakGeo,streakMat);
     stripe.name='water-highlight-'+d.index+'-'+i;
     stripe.renderOrder=7;
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
    o.column.position.y=-state.length*.5;
    o.material.opacity=state.opacity;
   }
   return states;
  }
  function animate(now){
   if(!active)return;
   const t=Number.isFinite(now)?now*.001:0;
   for(const entry of coreMarkers){
    const flow=entry.edge.flow;
    entry.mesh.visible=Number.isFinite(flow)&&Math.abs(flow)>0.0001;
   }
   for(const entry of barMarkers){
    const flow=entry.edge.flow;
    entry.mesh.visible=Number.isFinite(flow)&&Math.abs(flow)>0.0001;
    if(!entry.mesh.visible)continue;
    const speed=clamp(.28+Math.sqrt(Math.abs(flow))*1.5,.28,1.4);
    const progress=((t*speed+entry.edge.id*.213)%1+1)%1;
    const forward=flow>=0?progress:1-progress;
    if(mode==='water'){
     // Keep both pulse endpoints inside the trimmed straight pipe span.
     const padding=Math.min(.49,(entry.mesh.scale.y*.5+.001)/entry.length);
     entry.mesh.position.copy(entry.a).lerp(entry.b,padding+(1-2*padding)*forward);
    }else entry.mesh.position.copy(entry.a).lerp(entry.b,forward);
   }
   for(const elbow of bendMarkers){
    const flow=elbow.edge.flow;
    const live=Number.isFinite(flow)&&Math.abs(flow)>0.0001;
    elbow.core.visible=live;elbow.mesh.visible=live;
    if(!live)continue;
    const speed=clamp(.28+Math.sqrt(Math.abs(flow))*1.5,.28,1.4);
    const progress=((t*speed+elbow.nodeId*.217)%1+1)%1;
    // The route is built from port 0 to port 1. Derive the solver direction
    // from port 0 so animation cannot reverse when edge IDs are reordered.
    const enters=elbow.edge.b===elbow.nodeId?flow>0:flow<0;
    const pad=Math.min(.42,(elbow.mesh.scale.y*.5+.001)/(Math.PI/2*elbow.radius));
    const u=pad+(1-2*pad)*(enters?progress:1-progress);
    elbow.mesh.position.copy(elbow.curve.getPoint(u));
    elbow.mesh.quaternion.setFromUnitVectors(up,elbow.curve.getTangentAt(u));
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
   for(const entry of coreMarkers)entry.mesh.visible=false;
   for(const entry of bendMarkers){entry.core.visible=false;entry.mesh.visible=false;}
   for(const o of outlets)o.group.visible=false;
   for(const g of [barGeo,fluidGeo,jetGeo,streakGeo,...bendGeometries])g?.dispose();
   for(const m of [pathMat,fluidMat,streakMat,...outlets.map(o=>o.material)])m?.dispose();
  }
  return Object.freeze({
   root,barMarkers,coreMarkers,bendMarkers,outlets,descriptors,baseline:[...ref],
   sync,animate,dispose,getStates:()=>lastStates
  });
 }
 return Object.freeze({describeOutlets,outletStates,create});
});
