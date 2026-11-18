'use strict';
const assert=require('node:assert/strict');
const Engine=require('../js/piping-engine.js');
const Flow=require('../js/flow-visuals.js');
class Vec{
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this;}
 clone(){return new Vec(this.x,this.y,this.z);}
 subVectors(a,b){return this.copy(a).addScaledVector(b,-1);}
 addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this;}
 length(){return Math.hypot(this.x,this.y,this.z);}
 normalize(){const m=this.length()||1;this.x/=m;this.y/=m;this.z/=m;return this;}
 lerp(b,t){this.x+=(b.x-this.x)*t;this.y+=(b.y-this.y)*t;this.z+=(b.z-this.z)*t;return this;}
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
let disposed=0;
class Geo{dispose(){disposed++;}}
class Mat{constructor(opts){Object.assign(this,opts);}dispose(){disposed++;}}
class Group{
 constructor(){this.children=[];this.position=new Vec();this.visible=true;this.parent=null;this.quaternion={setFromUnitVectors:(a,b)=>{this.outletDirection=b.clone();}};}
 add(x){this.children.push(x);x.parent=this;}
 remove(x){this.children=this.children.filter(c=>c!==x);x.parent=null;}
}
class Mesh extends Group{
 constructor(geometry,material){
  super();this.geometry=geometry;this.material=material;
  this.quaternion={setFromUnitVectors(){}};
  this.scale=new Vec(1,1,1);
 }
}
const THREE={
 Group,Mesh,Vector3:Vec,CylinderGeometry:Geo,MeshBasicMaterial:Mat,DoubleSide:2
};
const point=(node,z=.06)=>new Vec(node.x*.00265,-node.y*.00265,z);
let scans=0,visibleChecks=0,barChecks=0;
for(let seed=1;seed<=240;seed++){
 const n=Engine.makeNetwork({mode:'water',surface:'wall',seed});
 const names=Flow.describeOutlets(n);
 assert.equal(names.length,n.valves.length);
 assert.equal(new Set(names.map(x=>x.nodeId)).size,n.valves.length);
 // Every water outlet is a genuine downward-facing nozzle after an offset elbow.
 // The terminal node and its final edge are the single source of visual truth.
 for(let i=0;i<n.terminals.length;i++){
  const t=n.terminals[i],last=n.edges[t.outletEdgeId],end=n.nodes[t.nodeId],from=n.nodes[last?.a];
  const valveEnd=n.nodes[n.edges[n.valves[i].edgeId].b];
  assert(last&&from&&last.b===t.nodeId,'Terminal must identify its actual last physical pipe edge');
  assert.equal(from.x,end.x,'Final outlet pipe must be vertical');
  assert(end.y>from.y,'Final outlet on a wall must point downward');
  assert.notEqual(end.x,valveEnd.x,'Fixture must exit at the offset L-tail, not directly under its valve');
  assert.equal(names[i].outletEdgeId,t.outletEdgeId);
  assert(Math.abs(names[i].direction.x)<1e-9&&Math.abs(names[i].direction.y+1)<1e-9);
 }
 const baseline=Engine.solveFlow(n,n.valves.map(()=>1)).terminalFlows;
 assert(baseline.every(f=>f>1e-6),'Each fixture must have real solver flow when all valves open');
 const parent=new Group();
 const v=Flow.create({THREE,network:n,parent,point,mode:'water',baseline});
 assert.equal(v.outlets.length,n.terminals.length,'Every fixture must own a distinct water jet');
 assert.equal(v.barMarkers.length,n.edges.length,'Every pipe edge has a moving flow bar');
 assert.equal(v.coreMarkers.length,n.edges.filter(edge=>edge.valveIndex<0).length,'All real water pipes have a visible inner fluid core');
 for(const core of v.coreMarkers){
  assert.equal(core.a.z,.06);assert.equal(core.b.z,.06);
  assert.equal(core.mesh.renderOrder,3,'Water core is drawn before moving pulses and translucent front shell');
  assert(core.length>0);
 }
 for(const m of v.barMarkers){
  assert.equal(m.a.z,.06,'Water begins on the pipe centerline');
  assert.equal(m.b.z,.06,'Water ends on the pipe centerline');
  assert.equal(m.mesh.renderOrder,4,'Internal water draws before front translucent shell');
 }
 assert.equal(new Set(v.outlets.map(o=>o.column)).size,n.terminals.length,'No shared terminal emitter');
 for(let i=0;i<v.outlets.length;i++){
  const t=n.terminals[i],end=point(n.nodes[t.nodeId],.06),o=v.outlets[i];
  assert(Math.abs(o.group.position.x-end.x)<1e-9,'Water jet must align with the L-tail outlet X');
  assert(Math.abs(o.group.position.y-(end.y-.019))<1e-9,'Water jet starts just beyond the final pipe nozzle');
  assert(Math.abs(o.group.position.z-end.z)<1e-9,'Water jet must share the pipe center depth');
  assert.equal(o.group.outletDirection.y,-1,'Water jet must flow out along the last pipe direction');
 }
 const all=Engine.solveFlow(n,n.valves.map(()=>1));
 v.sync(all);
 assert(v.outlets.every(x=>x.group.visible),'All three water outlets must run when all valves are open');
 assert(v.outlets.every(x=>x.length>.2),'Full-flow jets should be visually substantial');
 v.animate(1000);barChecks+=v.barMarkers.filter(m=>m.mesh.visible).length;
 assert(v.coreMarkers.every(c=>c.mesh.visible),'Full flow must fill all pipe interior cores');
 for(const t of n.terminals){
  assert.equal(v.barMarkers.find(b=>b.edge.id===t.outletEdgeId).mesh.visible,true,'Last elbow tail must show flow while outlet is open');
 }
 assert(barChecks>0,'Traveling flow bars should be visible');
 for(let closed=0;closed<n.valves.length;closed++){
  const op=n.valves.map((_,i)=>i===closed?0:1);
  const actual=Engine.solveFlow(n,op);
  const states=v.sync(actual);
  v.animate(1400);
  assert.equal(states.filter(x=>x.visible).length,n.valves.length-1);
  const stopped=v.barMarkers.find(b=>b.edge.id===n.terminals[closed].outletEdgeId);
  assert.equal(stopped.mesh.visible,false,'Closing a valve must also stop flow in its final L-tail');
  const stoppedCore=v.coreMarkers.find(c=>c.edge.id===n.terminals[closed].outletEdgeId);
  assert.equal(stoppedCore.mesh.visible,false,'Closing valve stops continuous fluid in its own outlet pipe');
  for(let i=0;i<n.valves.length;i++){
   assert.equal(v.outlets[i].group.visible,i!==closed,'Only the corresponding faucet may stop');
   assert.equal(v.outlets[i].index,i);
  }
  visibleChecks++;
 }
 const partial=Engine.solveFlow(n,[.25,1,1]);
 const states=v.sync(partial);
 assert(states[0].length<v.sync(all)[0].length,'Partially opened valve must have shorter stream');
 const zero=Engine.solveFlow(n,[0,0,0]);v.sync(zero);v.animate(1800);
 assert(v.outlets.every(x=>!x.group.visible),'All closed means no water');
 assert(v.coreMarkers.every(c=>!c.mesh.visible),'All closed means no interior flow');
 v.dispose();
 assert.equal(parent.children.length,0,'Disposed flow visuals must leave AR anchor');
 scans++;
}
for(const mode of ['air','plant']){
 const n=Engine.makeNetwork({mode,surface:'wall',seed:1029});
 const baseline=Engine.solveFlow(n,n.valves.map(()=>1)).terminalFlows;
 const holder=new Group(),v=Flow.create({THREE,network:n,parent:holder,point,mode,baseline,baseColor:0x368d74});
 assert.equal(v.outlets.length,0,'Only supply-water mode has open faucet jets');
 assert.equal(v.coreMarkers.length,0,'Only water mode uses the interior X-ray flow');
 assert(v.barMarkers.some(m=>m.a.z>.06),'Air/factory keep visible external tracers behind opaque walls');
 assert.equal(v.barMarkers.length,n.edges.length,'Industrial / HVAC visual bars still exist');
 v.sync(Engine.solveFlow(n,n.valves.map(()=>1)));v.animate(700);
 v.dispose();
}
assert(disposed>100,'Created geometries and materials must be freed');
const html=require('node:fs').readFileSync('ar-hand.html','utf8');
const ar=require('node:fs').readFileSync('js/ar-hand.js','utf8');
assert(html.includes('js/flow-visuals.js'));
assert(html.includes('value="1.85"')&&html.includes('max="2.60"'));
assert(ar.includes('FlowVisuals.create(')&&ar.includes('flowDisplay?.sync(summary)'));
assert(ar.includes('flowDisplay?.animate(performance.now())'));
assert(ar.includes('flowDisplay?.dispose()'));
assert(!ar.includes('flowMarkers=[]'),'Old hidden sphere-only flow rendering should be retired');
console.log('PASS:',scans,'networks,',visibleChecks,'independent shutoff checks,',barChecks,'traveling bars, all modes, cleanup and 185% size');
