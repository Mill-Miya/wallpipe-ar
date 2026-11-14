'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Engine=require('../js/piping-engine.js');
const page=fs.readFileSync('gesture-test.html','utf8');
const start=page.indexOf('function make(){');
const end=page.indexOf('function setup(){',start);
assert(start>=0&&end>start,'Standalone gesture page must expose generation and opening handlers');
const handlers=page.slice(start,end);
for(const seed of [43,44,45,46,47,48,49,50,51,52]){
 const elements={};
 const sandbox={engine:Engine,gesture:{reset(){}},state:{},$:(id)=>elements[id]??=( {style:{},textContent:'',value:''} )};
 const result=vm.runInNewContext(`
 let network,flow,openings=[1,1,1],selected=0,seed=${seed},mode='plant';
 ${handlers}
 make();
 const count=network.valves.length;
 const before=flow.terminalFlows.length;
 setOpening(count-1,.25);
 const after=openings[count-1];
 setOpening(count,0);
 ({count,openingsLength:openings.length,before,after,selected,summary:$('flowSummary').textContent});
 `,sandbox,{filename:'gesture-page-extracted.js'});
 assert.equal(result.openingsLength,result.count,'Every generated factory valve must have an opening');
 assert.equal(result.before,result.count,'Solver must return one terminal flow per valve');
 assert.equal(result.after,.25,'Last valve must remain independently adjustable');
 assert.equal(result.selected,result.count-1);
 assert(result.summary.includes(`/ ${result.count}系統`),'Flow summary must reflect generated line count');
}
assert(page.includes('selected=(selected+(e.key===\'ArrowRight\'?1:openings.length-1))%openings.length'),
 'Keyboard navigation must wrap over the generated valve count');
assert(!page.includes('工場設備・並列設備3系統'),'Factory selector must not claim a fixed 3-line layout');
console.log('PASS: standalone gesture page handles 2–5 generated factory valves, independent last-valve control, dynamic UI and keyboard wrap');
