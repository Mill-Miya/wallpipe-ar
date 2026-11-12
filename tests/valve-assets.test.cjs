'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
for(const kind of ['ball','gate','butterfly','control']){
 const buffer=fs.readFileSync(path.join(base,'assets','valves',kind+'.glb'));
 assert.equal(buffer.toString('ascii',0,4),'glTF');
 assert.equal(buffer.readUInt32LE(4),2);
 assert.equal(buffer.readUInt32LE(8),buffer.length);
 const len=buffer.readUInt32LE(12);
 assert.equal(buffer.toString('ascii',16,20),'JSON');
 const gltf=JSON.parse(buffer.toString('utf8',20,20+len));
 const names=gltf.nodes.map(x=>x.name||'');
 assert(names.some(x=>x.startsWith('body_')),kind+' body');
 assert(names.some(x=>x.startsWith('actuator_')),kind+' moving control');
 assert.equal(names.some(x=>x.startsWith('disc_')),kind==='butterfly',kind+' disc');
 assert(gltf.meshes.length>=5,kind+' needs detailed meshes');
 assert(gltf.materials.length>=3,kind+' needs multiple materials');
 assert(buffer.length>18000&&buffer.length<250000,kind+' GLB size');
 console.log('PASS '+kind+': '+gltf.meshes.length+' meshes, '+buffer.length+' bytes');
}
console.log('PASS: four authored valve assemblies');
