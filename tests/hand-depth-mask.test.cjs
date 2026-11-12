'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../js/hand-depth-mask.js');
const pts=Array.from({length:21},(_,i)=>({x:100+i*3,y:180-i*3}));
pts[5]={x:110,y:130};pts[17]={x:220,y:130};
const rect={left:8,top:30,width:390,height:844};
assert.equal(M.validLandmarks(pts),true);
assert.equal(M.validLandmarks(pts.slice(0,19)),false);
assert.equal(M.getHandShape(pts).width,110);
let fills=0,strokes=0,draws=0,clears=0;
const ctx={
 setTransform(){},fillRect(){clears++;},beginPath(){},moveTo(){},lineTo(){},
 closePath(){},fill(){fills++;},stroke(){strokes++;},arc(){},
 drawImage(){draws++}
};
const mask={width:0,height:0,getContext:()=>ctx};
assert.equal(M.drawMask(mask,pts,rect),true);
assert(mask.width>100&&mask.height>400);
assert(fills>=6&&strokes>=15);
assert.equal(draws,0,'Must NOT copy live camera footage to foreground');
assert.equal(M.drawMask(mask,pts.slice(0,20),rect),false);
const disposed=[];
class MockTexture{constructor(canvas){this.canvas=canvas;this.needsUpdate=false;}dispose(){disposed.push('texture');}}
class MockMaterial{constructor(opts){Object.assign(this,opts);}dispose(){disposed.push('material');}}
class MockGeometry{
 constructor(){this.attributes={};}
 setAttribute(n,v){this.attributes[n]=v;return this;}
 setIndex(i){this.index=i;return this;}
 getAttribute(n){return this.attributes[n];}
 dispose(){disposed.push('geometry');}
}
class MockAttr{
 constructor(a,size){this.data=a;this.size=size;}
 setXYZ(i,x,y,z){const j=i*3;this.data[j]=x;this.data[j+1]=y;this.data[j+2]=z;}
}
class MockV4{
 constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}
 applyMatrix4(){return this;}
}
class MockMesh{constructor(geometry,material){Object.assign(this,{geometry,material,visible:true});}}
const THREE={
 CanvasTexture:MockTexture,MeshBasicMaterial:MockMaterial,BufferGeometry:MockGeometry,
 Float32BufferAttribute:MockAttr,Vector4:MockV4,Mesh:MockMesh,
 LinearFilter:1,DoubleSide:2,NoBlending:0
};
const camera={projectionMatrix:{clone(){return {invert(){return {}}}}},children:[],add(o){this.children.push(o);},remove(o){this.children=this.children.filter(x=>x!==o);}};
const session=M.create({THREE,camera,canvas:mask});
assert.equal(session.material.colorWrite,false,'Camera background must remain unchanged');
assert.equal(session.material.depthWrite,true,'Invisible mask must write depth');
assert.equal(session.material.depthTest,true,'Disabling depthTest disables depth writes in Three.js');
assert.equal(session.material.alphaTest,.55);
assert.equal(session.mesh.renderOrder,-10000);
assert.equal(session.mesh.visible,false);
assert.equal(camera.children.length,1);
assert.equal(session.update(pts,rect),true);
assert.equal(session.mesh.visible,true);
assert.equal(session.texture.needsUpdate,true);
assert.equal(session.update(null,rect),false);
assert.equal(session.mesh.visible,false,'Lost hand must clear depth occlusion');
session.update(pts,rect);session.clear();assert.equal(session.mesh.visible,false);
session.dispose();
assert.equal(camera.children.length,0);
assert.deepEqual(disposed.sort(),['geometry','material','texture'].sort());
session.dispose();assert.equal(disposed.length,3);
const html=fs.readFileSync('ar-hand.html','utf8'),app=fs.readFileSync('js/ar-hand.js','utf8');
assert(html.includes('js/hand-depth-mask.js'));
assert(!html.includes('<script src="./js/hand-occlusion.js"></script>'));
assert(html.includes('#handOcclusion{display:none!important'));
assert(html.includes('value="1.85"')&&html.includes('max="2.30"'));
assert(app.includes('HandDepthMask.create({THREE,camera,canvas:ui.occlusion})'));
assert(app.includes('handDepthMask.update(points,ui.canvas.getBoundingClientRect())'));
assert(app.includes('disposeHandOcclusion()')&&app.includes('lastMaskUpdate'));
assert(!app.includes('HandOcclusion.render'),'Do not paste video over camera');
console.log('PASS: hand-only depth mask, zero camera image redraw, Three.js depth prepass, cleanup, 165% AR sizing');
