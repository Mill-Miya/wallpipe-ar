'use strict';
const assert=require('node:assert/strict');
const Engine=require('../js/piping-engine.js');
const Layout=require('../js/pipe-layout.js');
const Fit=require('../js/valve-placement.js');
const modes=['water','air','plant'],surfaces=['wall','floor','ceiling'];
const seeds=Array.from({length:1200},(_,i)=>i+1).concat([0,0x80000000,0xffffffff,0x12345678,0x87654321]);
let total=0,states=0,ports=0,elbows=0;
const palette=new Set(),count=new Set(),families=new Set();
for(const mode of modes)for(const surface of surfaces){
 for(const seed of seeds){
  const n=Engine.makeNetwork({mode,surface,seed});
  const p=Layout.plan(n);
  assert(n.edges.length>0 && p.spans.length>0);
  assert.equal(n.valves.length,n.terminals.length);
  assert.equal(n.targets.length,mode==='water'?n.valves.length:1);
  if(mode==='plant'){
   assert(n.valves.length>=2&&n.valves.length<=5);
   count.add(n.valves.length);palette.add(n.palette);
   families.add(n.valves.map(x=>x.type+':'+x.layout).join('/')+'#'+n.edges.length);
  }else assert.equal(n.valves.length,3);
  const vecKey=new Set();
  for(const e of n.edges){
   const a=n.nodes[e.a],b=n.nodes[e.b];
   assert(a&&b,'Valid edge endpoints');
   assert((a.x===b.x)!==(a.y===b.y),'No zero/diagonal edge '+mode+'/'+seed+'/'+e.id);
   assert(e.resistance>0&&Number.isFinite(e.resistance));
   if(e.valveIndex>=0){
    const pair=[Math.min(e.a,e.b),Math.max(e.a,e.b)].join(',');
    assert(!vecKey.has(pair),'Duplicate valve segment');
    vecKey.add(pair);
   }
   if(e.paintIndex>=0)assert(e.paintIndex<n.valves.length,'Paint index out of range');
  }
  for(const f of p.fittings)if(['elbow','tee','tee_full','tee_reduced','cross'].includes(f.type)){
   const det=f.x.x*f.y.y-f.x.y*f.y.x;
   assert(Math.abs(det)>.5,'Invalid fitting basis at '+mode+'/'+surface+'/'+seed+'/'+f.nodeId);
   elbows++;
  }
  for(let i=0;i<n.valves.length;i++){
   const fit=Fit.mounting(n,i);
   assert(Math.abs(fit.axialScale*fit.portSpan-fit.worldSpan)<1e-10);
   ports++;
  }
  const all=n.valves.map(()=>1),closed=n.valves.map(()=>0);
  const half=n.valves.map((_,i)=>i%2?0.6:0.35);
  const isolated=n.valves.map((_,i)=>i===0?1:0);
  for(const opens of [all,closed,half,isolated]){
   const f=Engine.solveFlow(n,opens);states++;
   assert(Number.isFinite(f.total)&&f.total>=0);
   assert.equal(f.terminalFlows.length,n.valves.length);
   assert(Math.abs(f.total-f.terminalFlows.reduce((x,y)=>x+y,0))<1e-6);
   if(opens.every(x=>x===0))assert.equal(f.active,0);
   if(opens.every(x=>x===1))assert.equal(f.active,n.valves.length);
   for(let i=0;i<opens.length;i++)if(opens[i]===0)assert.equal(f.terminalFlows[i],0);
  }
  total++;
 }
}
assert.deepEqual([...count].sort(),[2,3,4,5]);
assert.equal(palette.size,6);
assert(families.size>=180,'Structural diversity too small');
console.log('PASS full scan:',total,'network cases,',states,'flow cases,',ports,'valve mounts,',elbows,'oriented joints,',families.size,'factory variants,',palette.size,'palettes');
