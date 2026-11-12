'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync('js/ar-hand.js','utf8');
const a=src.indexOf('function releaseValveInstance('),b=src.indexOf('function stopHandSampling(',a);
assert(a>0&&b>a,'Expected live AR lifecycle helpers in app');
class Group{
 constructor(name){this.name=name;this.children=[];this.userData={};this.parent=null;}
 add(child){this.children.push(child);child.parent=this;}
 remove(child){this.children=this.children.filter(x=>x!==child);child.parent=null;}
 traverse(cb){cb(this);for(const c of this.children)c.traverse(cb);}
}
function mesh(name,geometry,material){
 const o=new Group(name);o.isMesh=true;o.geometry=geometry;o.material=material;return o;
}
function resource(){return{calls:0,dispose(){this.calls++;}}}
const scene=new Group('scene'),anchor=new Group('anchor');scene.add(anchor);
const sharedPipeGeometry=resource(),pipeMaterial=resource(),valveGeom=resource(),valveMat=resource(),legacyGeom=resource(),legacyMat=resource(),wallTexture=resource();
const pipe=new Group('pipe');pipe.add(mesh('sharedPipe',sharedPipeGeometry,pipeMaterial));anchor.add(pipe);
const valveRoot=new Group('valve');valveRoot.add(mesh('ownedValve',valveGeom,valveMat));
const mount=new Group('mount');mount.add(valveRoot);
anchor.add(mount);
anchor.add(mesh('fallback',legacyGeom,legacyMat));
anchor.userData.pipeAssetRoot=pipe;
anchor.userData.pipeAssetMaterials=[pipeMaterial];
anchor.userData.valveAssetRoots=[valveRoot];
anchor.userData.materials=[legacyMat];
anchor.userData.textures=[wallTexture];
const flowLifecycle={calls:0,dispose(){this.calls++;}};
const globals={anchor,flowDisplay:flowLifecycle};
vm.runInNewContext(src.slice(a,b)+'\nreleaseAnchorResources();',globals,{filename:'ar-lifecycle-extract.js'});
assert.equal(globals.anchor,null,'Session anchor must be cleared');
assert.equal(globals.flowDisplay,null,'Flow visual reference must be cleared');
assert.equal(flowLifecycle.calls,1,'Animated flow visuals must dispose on AR teardown');
assert.equal(scene.children.length,0,'Anchor must detach from XR scene');
assert.equal(sharedPipeGeometry.calls,0,'Do not dispose globally cached pipe geometries');
assert.equal(pipeMaterial.calls,1,'Per-scene pipe material must be disposed');
assert.equal(valveGeom.calls,1,'Cloned valve geometry must be disposed');
assert.equal(valveMat.calls,1,'Cloned valve material must be disposed');
assert.equal(legacyGeom.calls,1,'Fallback geometry must be disposed');
assert.equal(wallTexture.calls,1,'Sprite canvas texture must be disposed');
const staleGeom=resource(),staleMat=resource(),lateValve=new Group('late');
lateValve.add(mesh('stale',staleGeom,staleMat));
vm.runInNewContext(src.slice(a,b)+'\nreleaseValveInstance(lateValve);',{lateValve});
assert.equal(staleGeom.calls,1,'Late arrival geometry must be disposed');
assert.equal(staleMat.calls,1,'Late arrival material must be disposed');
assert(src.includes('if(revision!==valveRevision||!anchor||!mount.parent){releaseValveInstance(model.root);return;}'));
assert(src.includes('onDetach:()=>{stopHandSampling();disposeHandOcclusion();handGeneration++;valveRevision++;'));
assert(src.includes('scheduleHandSampling();'));
assert(!src.includes('if(tracking){sampleHand();animateFlow();}'),'Do not block 8th Wall render loop with ML inference');
console.log('PASS: AR teardown, stale valve disposal, cached GLB geometry safety, separate hand scheduler');
