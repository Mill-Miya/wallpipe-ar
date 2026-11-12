'use strict';
const assert=require('node:assert/strict');
const {makeNetwork,solveFlow}=require('../js/piping-engine.js');
const modes=['water','air','plant'],surfaces=['wall','floor','ceiling'];
let cases=0,plans=new Map();
for(const mode of modes)for(const surface of surfaces){
 const variants=new Set();
 for(let seed=1;seed<=180;seed++){
  const a=makeNetwork({mode,surface,seed});
  assert.equal(a.nodes.length>10,true);
  assert(mode==='plant'?a.valves.length>=2&&a.valves.length<=5:a.valves.length===3);
  assert.equal(a.terminals.length,a.valves.length);
  assert.equal(a.targets.length,mode==='water'?a.valves.length:1);
  assert.equal(a.sourceLabel.length>0,true);
  const geom=JSON.stringify(a.nodes.map(n=>[n.x,n.y]));variants.add(geom);
  assert.equal(geom,JSON.stringify(makeNetwork({mode,surface,seed}).nodes.map(n=>[n.x,n.y])),'seeding is deterministic');
  for(const e of a.edges){
    assert(e.resistance>0&&Number.isFinite(e.resistance));
    assert(e.diameter>=10);
    assert(a.nodes[e.a].x===a.nodes[e.b].x||a.nodes[e.a].y===a.nodes[e.b].y,'axis aligned pipes');
    assert.notEqual(e.a,e.b);
  }
  for(let flags=0;flags<(1<<a.valves.length);flags++){
    const opens=a.valves.map((_,i)=>Boolean(flags&(1<<i)));
    const o=solveFlow(a,opens);cases++;
    assert.equal(o.active,opens.filter(Boolean).length,`${mode}/${surface}/${seed}/${flags}`);
    assert.equal(o.blocked,flags===0);
    assert(o.total>=0&&Number.isFinite(o.total));
    assert(Math.abs(o.total-o.terminalFlows.reduce((t,v)=>t+v,0))<1e-6);
    for(let i=0;i<a.valves.length;i++){
       if(!opens[i])assert.equal(o.terminalFlows[i],0,'Closed valve must isolate its own branch');
       else assert(o.terminalFlows[i]>0);
    }
    // A junction without source/sink does not accumulate fluid (flow continuity).
    const prescribed=new Set([a.source,...a.targets]);
    for(const node of a.nodes)if(!prescribed.has(node.id)){
      const net=a.edges.reduce((sum,e)=>sum+(e.b===node.id?e.flow:0)-(e.a===node.id?e.flow:0),0);
      assert(Math.abs(net)<1e-6,`Flow continuity ${mode}/${seed}/${flags}/${node.id}: ${net}`);
    }
  }
 }
 assert(variants.size>=100,`${mode}/${surface} variation too low: ${variants.size}`);
 plans.set(mode+' '+surface,variants.size);
}
console.log(`PASS: ${cases} valve-state cases across ${modes.length*surfaces.length*180} generated schematics, ${[...plans.entries()].map(x=>x.join('='))}`);
