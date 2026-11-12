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
function materials(mode){
 const c=themes[mode]||themes.water;
 // The AR camera does not supply an environment/reflection cubemap.
 // Low-metalness satin industrial finishes remain legible under simple lights.
 const make=(color,metal=.13,rough=.62)=>new THREE.MeshStandardMaterial({
  color,metalness:metal,roughness:rough,side:THREE.DoubleSide,
  emissive:new THREE.Color(color),emissiveIntensity:.10
 });
 return {supply:make(c[0]),return:make(c[1]),branch:make(c[2]),load:make(c[3]),fitting:make(0xbcc7c2,.10,.57),bolt:make(0xc6b38f,.16,.54),clamp:make(0x607d84,.16,.62)};
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
 const mats=materials(mode),connections=new Map();
 for(const edge of network.edges){if(edge.valveIndex>=0)continue;
  for(const id of [edge.a,edge.b]){if(!connections.has(id))connections.set(id,[]);connections.get(id).push(edge);}
 }
 let hardware=0;
 for(const span of graph.spans){
  if(span.length<.0001)continue;
  const a=v(span.a),b=v(span.b),dir=b.clone().sub(a),length=dir.length();
  const q=aligned(dir),m=mats[span.kind]||mats.branch;
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
 return {root,materials:Object.values(mats),stats:root.userData.pipeStats};
}
export {loadKit};