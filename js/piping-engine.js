/**
 * WallPipe AR piping-engine v0.5
 * Educational network schematics, not construction drawings or calibrated CFD.
 * Three domain-specific generators with a small resistive-network solver.
 * No AI, image recognition, location tracking, or third-party dependencies.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WallPipeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const SYSTEMS = Object.freeze({ water:'給水', air:'空調冷温水', plant:'工場設備' });
  const SURFACES = new Set(['wall','floor','ceiling']);
  const MODES = new Set(Object.keys(SYSTEMS));
  function rngFromSeed(seed) {
    let value = (Number(seed) >>> 0) || 0x68bc21eb;
    return function() {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }
  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  function makeNetwork({mode='water',surface='wall',seed=1} = {}) {
    if(!MODES.has(mode)) throw new Error('Unknown system: '+mode);
    if(!SURFACES.has(surface)) throw new Error('Unknown surface: '+surface);
    const random = rngFromSeed(seed);
    const between=(a,b)=>a+random()*(b-a);
    const offset=(d)=>Math.round(between(-d,d));
    const choose=(set)=>set[Math.floor(random()*set.length)];
    const nodes=[],edges=[],valves=[],terminals=[],marks=[];
    const node=(x,y)=>{ const n={id:nodes.length,x:Math.round(x),y:Math.round(y)};nodes.push(n);return n.id; };
    const edge=(a,b,kind='branch',diameter=14,options={})=>{
      if(a===b)throw new Error('Zero length edge');
      const na=nodes[a],nb=nodes[b];
      if(na.x!==nb.x&&na.y!==nb.y)throw new Error('Pipe must be axis-aligned');
      const length=Math.hypot(na.x-nb.x,na.y-nb.y);
      const item={id:edges.length,a,b,kind,diameter,valveIndex:-1,flow:0,
       resistance:(.10+length/125*Math.pow(16/diameter,2.2))*between(.94,1.06)+(options.load?2.1:0)};
      edges.push(item);return item.id;
    };
    const valve=(a,b,name,role,diameter=14)=>{
      const id=edge(a,b,'valve',diameter),v={edgeId:id,name,role,axis: nodes[a].x===nodes[b].x?'v':'h'};
      edges[id].valveIndex=valves.length;valves.push(v);return id;
    };
    let source,targets=[],sourceLabel='',targetLabel='',scheme='';
    if(mode==='water') {
      // Trunk and three single-fixture offshoots: no arbitrary bypass loops.
      scheme='主管から3箇所へ分岐';
      const headerY=surface==='floor'?63:surface==='ceiling'?-151:-119;
      const fixtureYs=surface==='floor'?[-115,-91,-130]:[111,142,103];
      const xs=[-161,7,172].map(x=>x+offset(19));
      source=node(-303,135);sourceLabel='給水引込';
      const supplyTurn=node(-251,135),supplyHeader=node(-251,headerY);
      edge(source,supplyTurn,'supply',25);edge(supplyTurn,supplyHeader,'supply',25);
      const names=choose([
        ['洗面','トイレ','台所'],['洗面','洗濯機','流し台'],['洗面','台所','給湯器']
      ]);
      let prev=supplyHeader;
      for(let i=0;i<3;i++) {
        const tee=node(xs[i],headerY);
        edge(prev,tee,'supply',[23,20,17][i]);prev=tee;
        const endY=fixtureYs[i]+offset(12);
        const valveStartY=Math.round(headerY+(endY-headerY)*.70);
        const valveEndY=Math.round(headerY+(endY-headerY)*.84);
        const before=node(xs[i],valveStartY),after=node(xs[i],valveEndY),endPipe=node(xs[i],endY);
        edge(tee,before,'branch',13);
        valve(before,after,'止水バルブ',names[i]+'系統・点検位置',13);
        edge(after,endPipe,'branch',13);
        const fixtureX=xs[i]+offset(17);
        let terminal=endPipe;
        if(fixtureX!==xs[i]) {terminal=node(fixtureX,endY);edge(endPipe,terminal,'branch',12);}
        targets.push(terminal);
        terminals.push({label:names[i],nodeId:terminal,kind:'fixture',valveIndex:i});
      }
    } else if (mode==='air') {
      // Direct-return hydronic system: feed header and return header, three terminal coils.
      scheme='往き・戻りの並列空調回路';
      const sy=-157+offset(8),ry=151+offset(9);
      const xs=[-154,6,167].map(x=>x+offset(20));
      source=node(-305,sy);sourceLabel='往き';
      const target=node(-305,ry);targetLabel='戻り';targets=[target];
      let feed=source, ret=target;
      for(let i=0;i<3;i++) {
        const feedT=node(xs[i],sy),retT=node(xs[i],ry);
        edge(feed,feedT,'supply',[24,21,17][i]);feed=feedT;
        edge(ret,retT,'return',[24,21,17][i]);ret=retT;
        const va=node(xs[i],-90+offset(7)),vb=node(xs[i],-43+offset(7));
        const coilTop=node(xs[i],-10+offset(4)),coilBottom=node(xs[i],65+offset(5));
        edge(feedT,va,'branch',14);
        valve(va,vb,'流量調節弁','空調コイル '+(i+1)+' の往き側',14);
        edge(vb,coilTop,'branch',14);
        const activeEdge=edge(coilTop,coilBottom,'load',14,{load:true});
        edge(coilBottom,retT,'branch',14);
        terminals.push({label:'空調コイル '+(i+1),nodeId:coilTop,kind:'coil',valveIndex:i,activeEdge});
      }
      marks.push({label:'往き管',nodeId:source,kind:'header'});
      marks.push({label:'戻り管',nodeId:target,kind:'header'});
    } else {
      // Parallel process trains with isolating valves and common inlet/outlet headers.
      scheme='入口・出口マニホールドと3設備ライン';
      const ys=[-141,0,142].map(y=>y+offset(13));
      const inletX=-251+offset(7),outletX=246+offset(7);
      source=node(-309,0);sourceLabel='入口';
      const target=node(309,0);targetLabel='出口';targets=[target];
      const inletMid=node(inletX,0),outletMid=node(outletX,0);
      edge(source,inletMid,'supply',26);edge(outletMid,target,'return',26);
      const inputByRow=[],outputByRow=[];
      for(let i=0;i<3;i++){inputByRow.push(node(inletX,ys[i]));outputByRow.push(node(outletX,ys[i]));}
      // A middle node feeds the upper/lower manifold legs without overlapping pipes.
      edge(inletMid,inputByRow[1],'supply',26);
      edge(inputByRow[1],inputByRow[0],'supply',21);
      edge(inputByRow[1],inputByRow[2],'supply',21);
      edge(outputByRow[1],outletMid,'return',26);
      edge(outputByRow[0],outputByRow[1],'return',21);
      edge(outputByRow[2],outputByRow[1],'return',21);
      for(let i=0;i<3;i++){
        const y=ys[i],a=node(-193+offset(8),y),b=node(-146+offset(7),y);
        const loadA=node(15+offset(9),y),loadB=node(89+offset(9),y);
        edge(inputByRow[i],a,'branch',17);
        valve(a,b,'遮断弁','設備ライン '+(i+1)+'・操作可能位置',17);
        edge(b,loadA,'branch',17);
        const activeEdge=edge(loadA,loadB,'load',17,{load:true});
        edge(loadB,outputByRow[i],'branch',17);
        terminals.push({label:'設備 '+String.fromCharCode(65+i),nodeId:loadA,kind:'process',valveIndex:i,activeEdge});
      }
    }
    return {nodes,edges,valves,terminals,source,targets,sourceLabel,targetLabel,scheme,mode,surface,seed};
  }
  function solveFlow(network,open) {
    if(!network||!Array.isArray(open)||open.length!==network.valves.length) throw new Error('Invalid network / valve state');
    const {nodes,edges,source,targets}=network, n=nodes.length;
    const adj=Array.from({length:n},()=>[]);
    for(const e of edges){e.flow=0;if(e.valveIndex>=0&&!open[e.valveIndex])continue;adj[e.a].push(e.b);adj[e.b].push(e.a);}
    const reach=new Set([source]),queue=[source];
    for(let j=0;j<queue.length;j++)for(const v of adj[queue[j]])if(!reach.has(v)){reach.add(v);queue.push(v);}
    const sinks=new Set(targets.filter(v=>reach.has(v)));
    const summary={total:0,active:0,terminalFlows:[],blocked:!sinks.size};
    if(!sinks.size){network.terminals.forEach(()=>summary.terminalFlows.push(0));return summary;}
    const free=[...reach].filter(v=>v!==source&&!sinks.has(v)).sort((a,b)=>a-b);
    const index=new Map(free.map((v,i)=>[v,i])),sz=free.length;
    const matrix=Array.from({length:sz},()=>Array(sz+1).fill(0));
    const potential=Array(n).fill(0);potential[source]=1;
    for(const e of edges){
      if(e.valveIndex>=0&&!open[e.valveIndex])continue;
      if(!reach.has(e.a)||!reach.has(e.b))continue;
      const g=1/Math.max(.0001,e.resistance);
      for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){
        const i=index.get(a);if(i===undefined)continue;
        matrix[i][i]+=g;
        const j=index.get(b);if(j===undefined)matrix[i][sz]+=g*potential[b];else matrix[i][j]-=g;
      }
    }
    // Gaussian elimination, pivoting. Every reachable free component has a source boundary.
    for(let c=0;c<sz;c++){
      let pivot=c;for(let r=c+1;r<sz;r++)if(Math.abs(matrix[r][c])>Math.abs(matrix[pivot][c]))pivot=r;
      if(Math.abs(matrix[pivot][c])<1e-11)throw new Error('Ill-conditioned educational network');
      [matrix[c],matrix[pivot]]=[matrix[pivot],matrix[c]];
      const d=matrix[c][c];for(let k=c;k<=sz;k++)matrix[c][k]/=d;
      for(let r=0;r<sz;r++)if(r!==c){const factor=matrix[r][c];for(let k=c;k<=sz;k++)matrix[r][k]-=factor*matrix[c][k];}
    }
    free.forEach((v,i)=>{potential[v]=matrix[i][sz];});
    for(const e of edges){
      if(e.valveIndex>=0&&!open[e.valveIndex]||!reach.has(e.a)||!reach.has(e.b))continue;
      e.flow=(potential[e.a]-potential[e.b])/e.resistance;
      if(Math.abs(e.flow)<1e-8)e.flow=0;
      if(e.a===source)summary.total+=e.flow;
      if(e.b===source)summary.total-=e.flow;
    }
    summary.total=Math.max(0,summary.total);
    summary.terminalFlows=network.terminals.map(t=>{
      if(Number.isInteger(t.activeEdge))return Math.abs(edges[t.activeEdge].flow);
      // A fixture is a pressure boundary: sum all incoming edge flows.
      return Math.max(0,edges.reduce((sum,e)=>sum+(e.b===t.nodeId?e.flow:0)-(e.a===t.nodeId?e.flow:0),0));
    });
    summary.active=summary.terminalFlows.filter(v=>v>1e-7).length;
    summary.blocked=summary.active===0;
    return summary;
  }
  return Object.freeze({makeNetwork,solveFlow,SYSTEMS});
});
