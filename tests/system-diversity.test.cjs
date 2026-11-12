'use strict';
const assert=require('node:assert/strict');
const {makeNetwork,solveFlow}=require('../js/piping-engine.js');
const PlantFit=require('../js/valve-placement.js');
for(const mode of ['water','air']){
 const connectionProfiles=new Set(),elbowCounts=new Set(),seeds=new Set();
 for(let seed=1;seed<=360;seed++){
  const n=makeNetwork({mode,surface:'wall',seed});
  seeds.add(JSON.stringify(n.nodes.map(x=>[x.x,x.y])));
  const degrees=n.nodes.map(n=>n.id).map(id=>n.edges.filter(e=>e.a===id||e.b===id).length);
  connectionProfiles.add(n.edges.length+':'+n.nodes.length+':'+degrees.filter(d=>d>=3).length);
  elbowCounts.add(n.edges.length);
  const duplicate=makeNetwork({mode,surface:'wall',seed});
  assert.deepEqual(n.nodes,duplicate.nodes);
  assert.deepEqual(n.edges,duplicate.edges);
  for(let i=0;i<3;i++){
   const fit=PlantFit.mounting(n,i);
   assert.equal(fit.type,mode==='water'?'ball':'control');
   assert(Math.abs(fit.axialScale*fit.portSpan-fit.worldSpan)<1e-9);
   assert(fit.axialScale>.2&&fit.axialScale<2);
  }
  for(let bits=0;bits<8;bits++){
   const valves=[0,1,2].map(i=>Boolean(bits&(1<<i)));
   const x=solveFlow(n,valves);
   assert.equal(x.active,valves.filter(Boolean).length);
   assert(Math.abs(x.total-x.terminalFlows.reduce((a,b)=>a+b,0))<1e-6);
  }
 }
 assert(seeds.size>=350,mode+' insufficient seeded visual diversity');
 assert(connectionProfiles.size>=3,mode+' unchanged geometry topology between seeds');
 assert(elbowCounts.size>=3,mode+' no variation in edge count');
 console.log('PASS',mode,'topology families',connectionProfiles.size,'unique layouts',seeds.size);
}
