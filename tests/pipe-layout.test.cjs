'use strict';
const assert=require('node:assert/strict');
const Engine=require('../js/piping-engine.js');
const Layout=require('../js/pipe-layout.js');
let runs=0,parts=0,elbows=0,tees=0,reducers=0;
for(const mode of ['water','air','plant']){
 for(let seed=1;seed<=150;seed++){
  const network=Engine.makeNetwork({mode,surface:'wall',seed});
  const snapshot=JSON.stringify(network);
  const plan=Layout.plan(network);
  assert.equal(JSON.stringify(network),snapshot,'Renderer plan must not mutate the flow graph');
  assert.equal(plan.spans.length,network.edges.filter(e=>e.valveIndex<0).length);
  assert(plan.fittings.length>0);
  for(const span of plan.spans){
   assert(span.length>0&&Number.isFinite(span.length),mode+' '+seed+' '+span.edgeId);
   assert(span.r>0&&Number.isFinite(span.r));
   assert(span.aTrim+span.bTrim<=span.nominalLength*.861);
   assert(Number.isFinite(span.a.x)&&Number.isFinite(span.a.y));
  }
  for(const f of plan.fittings){
   assert(Number.isFinite(f.r)&&f.r>0);
   assert(['flange','socket','elbow','tee','tee_reduced','tee_full','cross','reducer'].includes(f.type));
   if(f.type==='elbow'){assert(Math.abs(f.x.x*f.y.x+f.x.y*f.y.y)<.001);elbows++;}
   if(f.type.startsWith('tee'))tees++;
   if(f.type==='reducer')reducers++;
  }
  runs++;parts+=plan.fittings.length;
 }
}
const nodes=[{x:0,y:0},{x:100,y:0},{x:200,y:0}];
const test={nodes,source:0,targets:[2],edges:[{id:0,a:0,b:1,diameter:25,kind:'supply',valveIndex:-1},{id:1,a:1,b:2,diameter:10,kind:'supply',valveIndex:-1}]};
assert(Layout.plan(test).fittings.some(f=>f.type==='reducer'));
const blocked=JSON.parse(JSON.stringify(test));blocked.edges[1].valveIndex=0;
assert.equal(Layout.plan(blocked).spans.length,1);
console.log('PASS: '+runs+' procedural layouts, '+parts+' fittings; '+elbows+' elbows, '+tees+' tees, '+reducers+' reducers; valve spans excluded');
