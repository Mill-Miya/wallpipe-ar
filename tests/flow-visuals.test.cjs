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
 constructor(){this.children=[];this.position=new Vec();this.visible=true;this.parent=null;}
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
 const baseline=Engine.solveFlow(n,n.valves.map(()=>1)).terminalFlows;
 assert(baseline.every(f=>f>1e-6),'Each fixture must have real solver flow when all valves open');
 const parent=new Group();
 const v=Flow.create({THREE,network:n,parent,point,mode:'water',baseline});
 assert.equal(v.outlets.length,n.terminals.length,'Every fixture must own a distinct water jet');
 assert.equal(v.barMarkers.length,n.edges.length,'Every pipe edge has a moving flow bar');
 assert.equal(new Set(v.outlets.map(o=>o.column)).size,n.terminals.length,'No shared terminal emitter');
 const all=Engine.solveFlow(n,n.valves.map(()=>1));
 v.sync(all);
 assert(v.outlets.every(x=>x.group.visible),'All three water outlets must run when all valves are open');
 assert(v.outlets.every(x=>x.length>.2),'Full-flow jets should be visually substantial');
 v.animate(1000);barChecks+=v.barMarkers.filter(m=>m.mesh.visible).length;
 assert(barChecks>0,'Traveling flow bars should be visible');
 for(let closed=0;closed<n.valves.length;closed++){
  const op=n.valves.map((_,i)=>i===closed?0:1);
  const actual=Engine.solveFlow(n,op);
  const states=v.sync(actual);
  assert.equal(states.filter(x=>x.visible).length,n.valves.length-1);
  for(let i=0;i<n.valves.length;i++){
   assert.equal(v.outlets[i].group.visible,i!==closed,'Only the corresponding faucet may stop');
   assert.equal(v.outlets[i].index,i);
  }
  visibleChecks++;
 }
 const partial=Engine.solveFlow(n,[.25,1,1]);
 const states=v.sync(partial);
 assert(states[0].length<v.sync(all)[0].length,'Partially opened valve must have shorter stream');
 const zero=Engine.solveFlow(n,[0,0,0]);v.sync(zero);
 assert(v.outlets.every(x=>!x.group.visible),'All closed means no water');
 v.dispose();
 assert.equal(parent.children.length,0,'Disposed flow visuals must leave AR anchor');
 scans++;
}
for(const mode of ['air','plant']){
 const n=Engine.makeNetwork({mode,surface:'wall',seed:1029});
 const baseline=Engine.solveFlow(n,n.valves.map(()=>1)).terminalFlows;
 const holder=new Group(),v=Flow.create({THREE,network:n,parent:holder,point,mode,baseline,baseColor:0x368d74});
 assert.equal(v.outlets.length,0,'Only supply-water mode has open faucet jets');
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
