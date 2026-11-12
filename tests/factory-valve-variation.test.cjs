'use strict';
const assert=require('node:assert/strict');
const {makeNetwork,solveFlow}=require('../js/piping-engine.js');
const Fit=require('../js/valve-placement.js');
const Layout=require('../js/pipe-layout.js');

const counts=new Map(),kinds=new Set(),paletteNames=new Set();
const routeSignatures=new Set(),endpoints=new Set();
let stateChecks=0,junctions=0,geometryChecks=0;
for(let seed=1;seed<=900;seed++){
 const n=makeNetwork({mode:'plant',surface:'wall',seed});
 assert(n.valves.length>=2&&n.valves.length<=5,'Factory has 2–5 lines');
 assert.equal(n.terminals.length,n.valves.length);
 counts.set(n.valves.length,(counts.get(n.valves.length)||0)+1);
 assert(typeof n.palette==='string');
 paletteNames.add(n.palette);
 routeSignatures.add(n.valves.map(v=>v.layout).join(',')+':'+n.edges.length);
 endpoints.add(JSON.stringify(n.nodes.map(x=>[x.x,x.y])));
 const n2=makeNetwork({mode:'plant',surface:'wall',seed});
 assert.deepEqual(n.valves,n2.valves,'Seeds reproduce valve types and routes');
 assert.equal(n.palette,n2.palette,'Seeds reproduce palettes');
 const p=Layout.plan(n);
 assert(p.spans.length>0);
 for(const f of p.fittings){
  if(['elbow','tee','tee_reduced','tee_full','cross'].includes(f.type)){
   const det=f.x.x*f.y.y-f.x.y*f.y.x;
   assert(Math.abs(det)>.5,'Degenerate fitting at node '+f.nodeId+' seed '+seed);
   junctions++;
  }
 }
 for(let i=0;i<n.valves.length;i++){
  const v=n.valves[i],edge=n.edges[v.edgeId];
  const a=n.nodes[edge.a],b=n.nodes[edge.b];
  assert.equal(v.axis,'h');
  assert.equal(a.y,b.y);
  const fit=Fit.mounting(n,i);
  assert.equal(fit.type,v.type);
  assert.equal(fit.rotationZ,-Math.PI/2);
  assert(Math.abs(fit.axialScale*fit.portSpan-fit.worldSpan)<1e-10);
  assert(fit.axialScale>.2&&fit.axialScale<2);
  assert.equal(edge.paintIndex,i,'Each valve belongs to one color-coded process train');
  kinds.add(fit.type);geometryChecks++;
 }
 for(let flags=0;flags<(1<<n.valves.length);flags++){
  const states=n.valves.map((_,i)=>Boolean(flags&(1<<i)));
  const result=solveFlow(n,states);stateChecks++;
  assert.equal(result.active,states.filter(Boolean).length,'Isolation '+seed+'/'+flags);
  assert(Math.abs(result.total-result.terminalFlows.reduce((a,b)=>a+b,0))<1e-6);
  for(let i=0;i<states.length;i++)if(!states[i])assert.equal(result.terminalFlows[i],0);
 }
}
assert.deepEqual([...counts.keys()].sort(),[2,3,4,5],'All factory line counts must be generated');
assert.deepEqual([...kinds].sort(),['ball','butterfly','control','gate'],'Factory needs all four authored valve types');
assert.equal(paletteNames.size,6,'All six factory paint schemes should be reachable');
assert(routeSignatures.size>=40,'Random regeneration must produce substantial route variation');
assert(endpoints.size>850,'Different seeds should produce distinct physical layouts');
console.log('PASS: factory '+JSON.stringify(Object.fromEntries(counts))+', '+paletteNames.size+' palettes, '+routeSignatures.size+' route families, '+junctions+' valid junctions, '+geometryChecks+' valve fits, '+stateChecks+' hydraulic states');
