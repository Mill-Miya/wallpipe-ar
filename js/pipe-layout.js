/** Pure piping visual planner. Reads the engineering network without mutating it. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.WallPipePipeLayout=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const radius=d=>Math.max(.014,Math.min(.052,d*.00172));
const len=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const vec=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return l?{x:dx/l,y:dy/l}:{x:0,y:0};};
const dot=(a,b)=>a.x*b.x+a.y*b.y;
function plan(network,scale=.00265){
 if(!network||!Array.isArray(network.nodes)||!Array.isArray(network.edges))throw Error('Network missing');
 const adjacency=network.nodes.map(()=>[]);
 for(const e of network.edges){if(e.valveIndex>=0)continue;
  const a=network.nodes[e.a],b=network.nodes[e.b],l=len(a,b)*scale;
  if(!(l>0))throw Error('Zero-length pipe edge '+e.id);
  const r=radius(e.diameter);
  adjacency[e.a].push({edgeId:e.id,neighbor:e.b,dir:vec(a,b),r,length:l});
  adjacency[e.b].push({edgeId:e.id,neighbor:e.a,dir:vec(b,a),r,length:l});
 }
 const fittings=[],trim=new Map();
 const trimPort=(nodeId,port,v)=>trim.set(port.edgeId+':'+nodeId,v);
 for(let nodeId=0;nodeId<adjacency.length;nodeId++){
  const ports=adjacency[nodeId];if(!ports.length)continue;
  const r=Math.max(...ports.map(p=>p.r));
  let type='',x=null,y=null,shoulder=0,extra={};
  if(ports.length===1){
   type=(nodeId===network.source||network.targets?.includes(nodeId))?'flange':'socket';
   x=ports[0].dir;shoulder=(type==='flange'?.32:.70)*r;
  }else if(ports.length===2){
   const [a,b]=ports;
   if(dot(a.dir,b.dir)>-.95){
    type='elbow';x={x:-a.dir.x,y:-a.dir.y};y=b.dir;shoulder=2.45*r;
   }else if(Math.abs(a.r-b.r)/r>.12){
    type='reducer';x=a.dir;shoulder=1.30*r;extra.largePort=a.r>=b.r?a.edgeId:b.edgeId;
   }else if(nodeId%3===0){
    type='socket';x=a.dir;shoulder=.70*r;
   }else continue;
  }else{
   const opposition=[];
   for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++)opposition.push({i,j,score:dot(ports[i].dir,ports[j].dir)});
   opposition.sort((a,b)=>a.score-b.score);
   const main=opposition[0];x=ports[main.i].dir;
   const other=ports.find((_,i)=>i!==main.i&&i!==main.j);
   y=other?other.dir:{x:-x.y,y:x.x};shoulder=2.35*r;
   const ratio=other?.r/r||1;
   type=ports.length>3?'cross':ratio>.9?'tee_full':ratio>.69?'tee':'tee_reduced';
  }
  fittings.push({nodeId,type,x,y,r,shoulder,extra,portIds:ports.map(p=>p.edgeId)});
  for(const port of ports)trimPort(nodeId,port,shoulder);
 }
 const spans=[];
 for(const e of network.edges){if(e.valveIndex>=0)continue;
  const a=network.nodes[e.a],b=network.nodes[e.b],l=len(a,b)*scale;
  let aTrim=trim.get(e.id+':'+e.a)||0,bTrim=trim.get(e.id+':'+e.b)||0;
  if(aTrim+bTrim>l*.86){const k=l*.86/(aTrim+bTrim);aTrim*=k;bTrim*=k;}
  const aa={x:a.x*scale,y:-a.y*scale,z:.06},bb={x:b.x*scale,y:-b.y*scale,z:.06};
  const dx=bb.x-aa.x,dy=bb.y-aa.y,dist=Math.hypot(dx,dy);
  const start={x:aa.x+dx/dist*aTrim,y:aa.y+dy/dist*aTrim,z:.06};
  const end={x:bb.x-dx/dist*bTrim,y:bb.y-dy/dist*bTrim,z:.06};
  spans.push({edgeId:e.id,kind:e.kind,r:radius(e.diameter),a:start,b:end,length:Math.hypot(end.x-start.x,end.y-start.y),aTrim,bTrim,nominalLength:l});
 }
 return{spans,fittings,stats:{spans:spans.length,fittings:fittings.length,elbows:fittings.filter(f=>f.type==='elbow').length,tees:fittings.filter(f=>f.type.startsWith('tee')).length,reducers:fittings.filter(f=>f.type==='reducer').length}};
}
return Object.freeze({plan,radius});
});