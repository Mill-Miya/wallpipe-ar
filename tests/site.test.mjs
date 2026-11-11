import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
let count=0;
function check(ok,reason){assert.ok(ok,reason);count++}
function eq(a,b,reason){assert.equal(a,b,reason);count++}
for(const path of ['index.html','spatial-test.html','README.md','js/piping-engine.js']){
  check(existsSync(resolve(root,path)),path+' missing');
  const text=read(path);
  check(!/KITZ|キッツ|北澤|田草川/i.test(text),path+' includes company-specific references');
  if(!path.endsWith('.html'))continue;
  check(text.includes('lang="ja"'),path+' missing language');
  for(const [,url] of text.matchAll(/<(?:script|link|img|model-viewer|a)[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
    check(!/^javascript:/i.test(url),path+' has unsafe link');
    if(/^(?:https?:|data:|mailto:|#)/i.test(url))continue;
    const local=resolve(root,dirname(path),url.split(/[?#]/)[0]);
    check(local.startsWith(root+'/')&&existsSync(local),path+' broken resource '+url);
  }
  for(const [,code] of text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
    if(code.trim()){new vm.Script(code,{filename:path});count++}
  }
}
const page=read('spatial-test.html');
for(const phrase of ['ar-placement="wall"','ar-scale="fixed"','model-viewer@4.4.0','id="retry"','Quick Look']){
  check(page.includes(phrase),'Spatial test missing '+phrase);
}
function glb(path){
  const data=readFileSync(resolve(root,'assets',path));
  check(data.length>1024,path+' small or empty');
  eq(data.toString('ascii',0,4),'glTF',path+' bad magic');
  eq(data.readUInt32LE(4),2,path+' bad format version');
  eq(data.readUInt32LE(8),data.length,path+' bad length');
  eq(data.toString('ascii',16,20),'JSON',path+' missing JSON chunk');
  const end=20+data.readUInt32LE(12);
  check(end<=data.length,path+' invalid chunk length');
  const json=JSON.parse(data.toString('utf8',20,end));
  eq(json.asset.version,'2.0',path+' invalid glTF version');
  check(json.meshes?.length>0,path+' no 3D geometry');
  return json;
}
const names=readdirSync(resolve(root,'assets')).filter(p=>extname(p)==='.glb');
eq(names.length,25,'Expected 24 demonstration models + 1 spatial model');
for(const name of names)glb(name);
check((glb('spatial-wall-probe.glb').scenes?.length??0)>0,'Spatial scene missing');
console.log('PASS:',count,'page, syntax and GLB assertions on',names.length,'3D files');
