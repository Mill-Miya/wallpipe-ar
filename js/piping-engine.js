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
  // Boolean inputs remain binary; numeric inputs (0..1) represent opening fraction.
  const opening = value => typeof value === 'boolean' ? Number(value) : (Number.isFinite(value) ? clamp(value,0,1) : 0);
  const effectiveResistance = (edge,states) => {
    if(edge.valveIndex < 0) return edge.resistance;
    const ratio=opening(states[edge.valveIndex]);
    if(ratio<=0) return Infinity;
    return edge.resistance*(1+6*Math.pow((1-ratio)/Math.max(.08,ratio),2));
  };
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
       resistance:(.10+length/125*Math.pow(16/diameter,2.2))*between(.94,1.06)+(options.load?2.1:0),
       paintIndex:Number.isInteger(options.paintIndex)?options.paintIndex:-1};
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
      const xs=[-175,8,183].map(x=>x+offset(29));
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
        const valveStartY=Math.round(headerY+(endY-headerY)*.59);
        const valveEndY=Math.round(headerY+(endY-headerY)*.88);
        const before=node(xs[i],valveStartY),after=node(xs[i],valveEndY),endPipe=node(xs[i],endY);
        edge(tee,before,'branch',13);
        valve(before,after,'止水バルブ',names[i]+'系統・点検位置',13);
        // An offset service tail is a real elbow arrangement, not a
        // jittered drawing. The branch stays downstream of its own stop valve.
        const sideRoute=random()<.67;
        const fixtureX=xs[i]+(sideRoute?choose([-1,1])*Math.round(between(30,65)):offset(22));
        let terminal=endPipe;
        if(sideRoute){
          const elbowY=Math.round(valveEndY+(endY-valveEndY)*.55);
          const knee=node(xs[i],elbowY),turn=node(fixtureX,elbowY);
          edge(after,knee,'branch',13);edge(knee,turn,'branch',12);
          terminal=node(fixtureX,endY);edge(turn,terminal,'branch',12);
        }else{
          edge(after,endPipe,'branch',13);
          if(fixtureX!==xs[i]){terminal=node(fixtureX,endY);edge(endPipe,terminal,'branch',12);}
        }
        targets.push(terminal);
        terminals.push({label:names[i],nodeId:terminal,kind:'fixture',valveIndex:i});
      }
    } else if (mode==='air') {
      // Direct-return hydronic system: feed header and return header, three terminal coils.
      scheme='往き・戻りの並列空調回路';
      const sy=-157+offset(8),ry=151+offset(9);
      const xs=[-167,5,176].map(x=>x+offset(27));
      source=node(-305,sy);sourceLabel='往き';
      const target=node(-305,ry);targetLabel='戻り';targets=[target];
      let feed=source, ret=target;
      for(let i=0;i<3;i++) {
        const feedT=node(xs[i],sy),retT=node(xs[i],ry);
        edge(feed,feedT,'supply',[24,21,17][i]);feed=feedT;
        edge(ret,retT,'return',[24,21,17][i]);ret=retT;
        const va=node(xs[i],-113+offset(7)),vb=node(xs[i],-45+offset(6));
        const staggered=random()<.68;
        const coilX=xs[i]+(staggered?choose([-1,1])*Math.round(between(28,56)):0);
        const coilTop=node(coilX,-7+offset(5)),coilBottom=node(coilX,62+offset(7));
        edge(feedT,va,'branch',14);
        valve(va,vb,'流量調節弁','空調コイル '+(i+1)+' の往き側',14);
        if(staggered){
          const elbowA=node(coilX,nodes[vb].y);
          edge(vb,elbowA,'branch',14);edge(elbowA,coilTop,'branch',14);
        }else edge(vb,coilTop,'branch',14);
        const activeEdge=edge(coilTop,coilBottom,'load',14,{load:true});
        if(staggered){
          const elbowB=node(xs[i],nodes[coilBottom].y);
          edge(coilBottom,elbowB,'branch',14);edge(elbowB,retT,'branch',14);
        }else edge(coilBottom,retT,'branch',14);
        terminals.push({label:'空調コイル '+(i+1),nodeId:coilTop,kind:'coil',valveIndex:i,activeEdge});
      }
      marks.push({label:'往き管',nodeId:source,kind:'header'});
      marks.push({label:'戻り管',nodeId:target,kind:'header'});
    } else {
      // Each factory regeneration changes the number and arrangement of
      // isolated process trains, not just the exact positions of old lines.
      const pickIndex=n=>Math.floor(random()*n);
      // Warm up xorshift: the first output for small sequential seeds is biased.
      random();random();random();
      const lineCount=2+pickIndex(4);
      const rowTemplates={
        2:[-129,129],3:[-146,0,146],
        4:[-172,-58,58,172],5:[-182,-91,0,91,182]
      };
      const ys=rowTemplates[lineCount].map(y=>y===0?0:y+offset(9));
      const palette=choose(['steel-blue','copper','forest','graphite','safety','cool']);
      scheme='工場設備 '+lineCount+'ライン';
      const inletX=-258+offset(9),outletX=258+offset(9);
      source=node(-315,0);sourceLabel='原料・供給';
      const target=node(315,0);targetLabel='設備出口';targets=[target];
      const inletMid=node(inletX,0),outletMid=node(outletX,0);
      edge(source,inletMid,'supply',26);edge(outletMid,target,'return',26);
      // A single manifold spine, including the center at y=0, prevents
      // multiple coincident or same-direction ports at its junctions.
      function manifold(x,mid,kind){
        const rows=[...new Set([...ys,0])].sort((a,b)=>a-b);
        const ids=new Map(rows.map(y=>[y,y===0?mid:node(x,y)]));
        for(let i=0;i<rows.length-1;i++){
          const size=Math.abs((rows[i]+rows[i+1])/2)<100?26:21;
          edge(ids.get(rows[i]),ids.get(rows[i+1]),kind,size);
        }
        return ids;
      }
      const input=manifold(inletX,inletMid,'supply');
      const output=manifold(outletX,outletMid,'return');
      const typeNames=['ball','gate','butterfly','control'];
      const variants=['直結','弁オフセット','設備オフセット','複合オフセット'];
      const paint=(i)=>({paintIndex:i});
      function routed(from,to,kind,diameter,i){
        const a=nodes[from],b=nodes[to],opts=paint(i);
        if(a.x===b.x||a.y===b.y){edge(from,to,kind,diameter,opts);return;}
        const middle=Math.round(a.x+(b.x-a.x)*between(.31,.69));
        const c=node(middle,a.y),d=node(middle,b.y);
        edge(from,c,kind,diameter,opts);
        edge(c,d,kind,diameter,opts);
        edge(d,to,kind,diameter,opts);
      }
      const variantsUsed=[];
      for(let i=0;i<lineCount;i++){
        const rowY=ys[i],variant=pickIndex(4);
        const type=choose(typeNames);
        const sign=i<lineCount/2?1:-1;
        const valveY=rowY+([1,3].includes(variant)?sign*Math.round(between(25,41)):0);
        const machineY=rowY+([2,3].includes(variant)?-sign*Math.round(between(27,46)):0);
        const valveX=Math.round(between(-203,-168));
        const valveLength=type==='butterfly'?Math.round(between(35,42)):Math.round(between(66,83));
        const va=node(valveX,valveY),vb=node(valveX+valveLength,valveY);
        const loadStart=node(Math.round(between(9,50)),machineY);
        const loadEnd=node(Math.round(between(104,151)),machineY);
        const d=choose([14,16,18,20]);
        routed(input.get(rowY),va,'branch',d,i);
        const id=valve(va,vb,'操作弁','プロセス '+(i+1)+'・'+type,d);
        edges[id].paintIndex=i;
        valves[i].type=type;
        valves[i].layout=variant;
        routed(vb,loadStart,'branch',d,i);
        const activeEdge=edge(loadStart,loadEnd,'load',d,{load:true,paintIndex:i});
        routed(loadEnd,output.get(rowY),'branch',d,i);
        terminals.push({label:'設備 '+(i+1),nodeId:loadStart,kind:'process',valveIndex:i,activeEdge});
        variantsUsed.push(variants[variant]);
      }
      marks.push({label:'供給マニホールド',nodeId:inletMid,kind:'header'});
      marks.push({label:'戻りマニホールド',nodeId:outletMid,kind:'header'});
      scheme+='：'+variantsUsed.join('／');
      // The palette name is a stable part of the seeded network.
      return {nodes,edges,valves,terminals,source,targets,sourceLabel,targetLabel,scheme,mode,surface,seed,palette};

    }
    return {nodes,edges,valves,terminals,source,targets,sourceLabel,targetLabel,scheme,mode,surface,seed};
  }
  function solveFlow(network,open) {
    if(!network||!Array.isArray(open)||open.length!==network.valves.length) throw new Error('Invalid network / valve state');
    const {nodes,edges,source,targets}=network, n=nodes.length;
    const adj=Array.from({length:n},()=>[]);
    for(const e of edges){e.flow=0;if(!Number.isFinite(effectiveResistance(e,open)))continue;adj[e.a].push(e.b);adj[e.b].push(e.a);}
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
      if(!Number.isFinite(effectiveResistance(e,open)))continue;
      if(!reach.has(e.a)||!reach.has(e.b))continue;
      const g=1/Math.max(.0001,effectiveResistance(e,open));
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
      if(!Number.isFinite(effectiveResistance(e,open))||!reach.has(e.a)||!reach.has(e.b))continue;
      e.flow=(potential[e.a]-potential[e.b])/effectiveResistance(e,open);
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
