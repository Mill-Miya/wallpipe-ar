/** Pure geometry contract: fit each authored GLB valve port-to-port to its pipe span.
 * The valve mesh's flow axis is local +Y, even when the factory route is horizontal.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.WallPipeValvePlacement=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const PORT_SPAN=Object.freeze({ball:0.256,gate:0.256,butterfly:0.130,control:0.256});
 const TYPES=Object.freeze(['ball','gate','butterfly','control']);
 function kindForValve(network,index){
  const item=network?.valves?.[index];
  if(!item)throw new Error('Missing valve at index '+index);
  if(item.type&&Object.hasOwn(PORT_SPAN,item.type))return item.type;
  return network.mode==='water'?'ball':network.mode==='air'?'control':TYPES[index%3];
 }
 function mounting(network,index,{scale=.00265,radial=.68}={}){
  const v=network?.valves?.[index];
  if(!v)throw new Error('Missing valve');
  const edge=network.edges[v.edgeId],a=network.nodes[edge.a],b=network.nodes[edge.b];
  if(!a||!b)throw new Error('Invalid valve endpoints');
  if(a.x!==b.x&&a.y!==b.y)throw new Error('Valve is not axis-aligned');
  const len=Math.hypot(a.x-b.x,a.y-b.y)*scale;
  if(!(len>.02&&len<.8))throw new Error('Unreasonable authored valve port span: '+len);
  const type=kindForValve(network,index),port=PORT_SPAN[type];
  const axial=len/port;
  if(!(axial>.2&&axial<2))throw new Error('Authored valve deformation too large: '+type+' '+axial);
  return Object.freeze({
   type,portSpan:port,worldSpan:len,axialScale:axial,radialScale:radial,
   rotationZ:v.axis==='h'?-Math.PI/2:0,
   x:(a.x+b.x)*scale/2,y:-(a.y+b.y)*scale/2,
   z:.06
  });
 }
 return Object.freeze({PORT_SPAN,kindForValve,mounting});
});