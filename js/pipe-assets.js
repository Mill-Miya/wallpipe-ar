/** Authored hollow GLB pipe kit, placed by the unchanged engineering network. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import './pipe-layout.js';
const {plan}=window.WallPipePipeLayout;
const loader=new GLTFLoader(),UP=new THREE.Vector3(0,1,0);
let pending=null;
function loadKit(){
 if(!pending){
  const url=new URL('../assets/pipes/pipe-kit.glb',import.meta.url).href;
  pending=loader.loadAsync(url).then(gltf=>{
   const map=new Map();
   gltf.scene.traverse(obj=>{
    if(!obj.isMesh)return;
    // Earlier GLB assets omitted NORMAL attributes. Without correct normals,
    // PBR shading can collapse to an almost black silhouette on mobile.
    if(!obj.geometry.getAttribute('normal'))obj.geometry.computeVertexNormals();
    map.set(obj.name,obj.geometry);
   });
   for(const name of ['straight_shell','elbow_shell','tee_shell','tee_full_shell','tee_reduced_shell','cross_shell','reducer_shell','socket_shell','flange_shell','flange_fasteners','clamp_strap','mount_socket']){
    if(!map.has(name))throw new Error('Missing pipe-kit mesh '+name);
   }
   return map;
  }).catch(e=>{pending=null;throw e;});
 }
 return pending;
}
const v=p=>new THREE.Vector3(p.x,p.y,p.z??.06);
const worldDir=p=>new THREE.Vector3(p.x,-p.y,0).normalize();
const themes={
 water:[0x839ca4,0x748b91,0x8ca7ad,0x829da4],
 air:[0x8aa19b,0x687e8e,0x859e98,0x9aaca5],
 plant:[0x968d7e,0x77838a,0xa0968b,0x9b8873]
};
const factoryPaints={
 'steel-blue':{main:[0x687f8b,0x7b8890,0x96a6a8,0x82929d],lanes:[0x7d97a5,0x9cabb5,0x668b9a,0x879caa,0xa6b8bd]},
 'copper':{main:[0x8b7a68,0x796e65,0xb09a7a,0x9e8971],lanes:[0xb0936e,0x9c6f5c,0xc3a17d,0x857b70,0xa18d79]},
 'forest':{main:[0x6c847a,0x6d7b72,0x87978c,0x698880],lanes:[0x648e81,0x90a89a,0x527d77,0x8f9d85,0x6d9890]},
 'graphite':{main:[0x768188,0x5e6a70,0x8c9694,0x717c83],lanes:[0x828f93,0x67747b,0xa0a9a6,0x596e77,0x89969e]},
 'safety':{main:[0x998879,0x858481,0xadb0a5,0x918573],lanes:[0xd2a15a,0xb5a66f,0x8c9e95,0xb07b64,0x9d9b8e]},
 'cool':{main:[0x778da1,0x6b7d8b,0x94b0b4,0x7f99aa],lanes:[0x5d93a4,0x8ea7c1,0x64a39d,0x90b8bd,0x7896ab]}
};
function materials(mode,palette){
 const scheme=mode==='plant'?factoryPaints[palette]:null;
 const c=scheme?.main||themes[mode]||themes.water;
 // The AR camera does not supply an environment/reflection cubemap.
 // Low-metalness satin industrial finishes remain legible under simple lights.
 const make=(color,metal=.13,rough=.62)=>new THREE.MeshStandardMaterial({
  color,metalness:metal,roughness:rough,side:THREE.DoubleSide,
  emissive:new THREE.Color(color),emissiveIntensity:.10
 });
 return {supply:make(c[0]),return:make(c[1]),branch:make(c[2]),load:make(c[3]),fitting:make(0xbcc7c2,.10,.57),bolt:make(0xc6b38f,.16,.54),clamp:make(0x607d84,.16,.62),lanes:(scheme?.lanes||[]).map(color=>make(color,.12,.61))};
}
function mesh(group,geometry,material,position,scale,quaternion){
 const part=new THREE.Mesh(geometry,material);
 if(position)part.position.copy(position);
 if(quaternion)part.quaternion.copy(quaternion);
 if(typeof scale==='number')part.scale.setScalar(scale);
 else if(scale)part.scale.copy(scale);
 part.receiveShadow=true;group.add(part);return part;
}
const aligned=dir=>new THREE.Quaternion().setFromUnitVectors(UP,dir.clone().normalize());
function basis(x,y){
 const z=x.clone().cross(y).normalize();
 if(z.length()<.5)throw new Error('Invalid junction basis');
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
export async function createPipeAssembly(network,{mode='water',scale=.00265,maxSupports=4}={}){
 const kit=await loadKit();
 const graph=plan(network,scale),root=new THREE.Group();root.name='pipe-authored-assembly';
 const mats=materials(mode,network.palette),connections=new Map();
 for(const edge of network.edges){if(edge.valveIndex>=0)continue;
  for(const id of [edge.a,edge.b]){if(!connections.has(id))connections.set(id,[]);connections.get(id).push(edge);}
 }
 let hardware=0;
 for(const span of graph.spans){
  if(span.length<.0001)continue;
  const a=v(span.a),b=v(span.b),dir=b.clone().sub(a),length=dir.length();
  const q=aligned(dir),m=span.paintIndex>=0&&mats.lanes.length?mats.lanes[span.paintIndex%mats.lanes.length]:(mats[span.kind]||mats.branch);
  mesh(root,kit.get('straight_shell'),m,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(span.r,length/2,span.r),q);
  if(hardware<maxSupports&&span.length>.31&&span.edgeId%3===0){
   const c=a.clone().lerp(b,.53);
   mesh(root,kit.get('clamp_strap'),mats.clamp,c,span.r,q);
   const boss=c.clone().add(new THREE.Vector3(0,0,-span.r*1.45));
   mesh(root,kit.get('mount_socket'),mats.bolt,boss,span.r,aligned(new THREE.Vector3(0,0,1)));
   hardware++;
  }
 }
 for(const f of graph.fittings){
  const node=network.nodes[f.nodeId],p=new THREE.Vector3(node.x*scale,-node.y*scale,.06);
  let q=undefined,tag='';
  if(['elbow','tee','tee_reduced','tee_full','cross'].includes(f.type)){
   q=basis(worldDir(f.x),worldDir(f.y));tag=f.type+'_shell';
  }else if(f.type==='reducer'){
   const edges=connections.get(f.nodeId)||[];
   const large=edges.find(e=>e.id===f.extra.largePort)||edges[0];
   if(!large)continue;
   const neighbor=network.nodes[large.a===f.nodeId?large.b:large.a];
   const towardLarge=v({x:neighbor.x*scale,y:-neighbor.y*scale,z:.06}).sub(p).normalize();
   q=aligned(towardLarge.negate());tag='reducer_shell';
  }else if(f.type==='socket'||f.type==='flange'){
   q=aligned(worldDir(f.x));tag=f.type+'_shell';
  }
  if(!tag||!kit.has(tag))continue;
  mesh(root,kit.get(tag),mats.fitting,p,f.r,q);
  if(f.type==='flange')mesh(root,kit.get('flange_fasteners'),mats.bolt,p,f.r,q);
 }
 root.userData.pipeStats={...graph.stats,supports:hardware,kitMeshes:root.children.length};
 return {root,materials:Object.values(mats).flat(),stats:{...root.userData.pipeStats,palette:network.palette||mode}};
}
export {loadKit};