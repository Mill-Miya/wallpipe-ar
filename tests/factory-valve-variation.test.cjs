'use strict';
const assert=require('node:assert/strict');
const {makeNetwork,solveFlow}=require('../js/piping-engine.js');
const Fit=require('../js/valve-placement.js');
assert.deepEqual(Object.keys(Fit.PORT_SPAN).sort(),['ball','butterfly','control','gate']);
let cases=0;const skeletons=new Set(),orders=new Set(),locations=new Set(),paths=new Set();
for(let seed=1;seed<=700;seed++){
 const n=makeNetwork({mode:'plant',surface:'wall',seed});
 assert.equal(n.valves.length,3);assert.equal(n.terminals.length,3);
 const types=n.valves.map(v=>v.type);
 assert.deepEqual(types.slice().sort(),['ball','butterfly','gate'],'All three visual variants must be represented');
 orders.add(types.join('/'));
 const geometry=n.nodes.map(v=>[v.x,v.y]);locations.add(JSON.stringify(geometry));
 // A topology signature must vary without relying on coordinate offsets.
 const val=n.valves.map(v=>v.layout);
 skeletons.add(val.join(',')+';'+n.edges.length);
 paths.add(n.edges.length);
 for(let i=0;i<n.valves.length;i++){
  const v=n.valves[i],e=n.edges[v.edgeId],a=n.nodes[e.a],b=n.nodes[e.b];
  assert.equal(v.axis,'h');
  assert.equal(a.y,b.y);
  const fit=Fit.mounting(n,i);
  assert.equal(fit.type,v.type);
  assert.equal(fit.rotationZ,-Math.PI/2);
  assert(Math.abs(fit.axialScale*Fit.PORT_SPAN[v.type]-fit.worldSpan)<1e-10,'Valve port span must match pipe gap');
  assert(fit.axialScale>.2&&fit.axialScale<2.0,'Visually unreasonable authored scale');
  cases++;
 }
 for(let mask=0;mask<8;mask++){
  const flags=Array.from({length:3},(_,i)=>Boolean(mask&(1<<i)));
  const flow=solveFlow(n,flags);
  assert.equal(flow.active,flags.filter(Boolean).length,'Every isolated train must respond to its own valve');
  assert(Math.abs(flow.total-flow.terminalFlows.reduce((a,b)=>a+b,0))<1e-6);
  for(let i=0;i<3;i++)if(!flags[i])assert.equal(flow.terminalFlows[i],0);
 }
 const next=makeNetwork({mode:'plant',surface:'wall',seed});
 assert.equal(JSON.stringify(n.nodes),JSON.stringify(next.nodes));
 assert.equal(JSON.stringify(n.valves),JSON.stringify(next.valves));
}
assert(orders.size>=5,'Not enough visible randomized valve orders');
assert(skeletons.size>=7,'Factory route family must have structural variation, not just jitter');
assert(paths.size>=3,'Factory process lines need distinct numbers of pipe segments');
assert(locations.size>650,'Seeds should produce distinct layouts');
for(const mode of ['water','air']){
 const n=makeNetwork({mode,seed:1337,surface:'wall'});
 for(let i=0;i<n.valves.length;i++){
  const fit=Fit.mounting(n,i);
  assert.equal(fit.type,mode==='water'?'ball':'control');
 }
}
console.log('PASS: '+cases+' factory valve mounts; '+orders.size+' valve orders; '+skeletons.size+' route signatures; '+paths.size+' edge counts');
