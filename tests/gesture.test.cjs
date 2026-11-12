'use strict';
const assert=require('node:assert/strict');
const gesture=require('../js/gesture-control.js');
const {makeNetwork,solveFlow}=require('../js/piping-engine.js');
function hand(pinch=false,theta=-Math.PI/2,centre={x:250,y:300}){
 const wrist={x:centre.x-60*Math.cos(theta),y:centre.y-60*Math.sin(theta)};
 const middle={x:centre.x,y:centre.y};
 const pts=Array.from({length:21},()=>({x:wrist.x,y:wrist.y}));pts[0]=wrist;pts[9]=middle;
 pts[4]={x:centre.x-8,y:centre.y};pts[8]={x:centre.x+(pinch?8:45),y:centre.y};
 pts[6]={x:wrist.x+22*Math.cos(theta),y:wrist.y+22*Math.sin(theta)};
 pts[12]={x:wrist.x+83*Math.cos(theta),y:wrist.y+83*Math.sin(theta)};
 pts[10]={x:wrist.x+35*Math.cos(theta),y:wrist.y+35*Math.sin(theta)};
 return pts;
}
const state=gesture.createState(),valves=[{x:250,y:300},{x:450,y:300}],opening=[0.4,1];
let e=gesture.step(state,hand(true,0),valves,opening,0);
assert.equal(e.kind,'grab');assert.equal(e.index,0);
e=gesture.step(state,hand(true,Math.PI/4),valves,opening,100);assert.equal(e.kind,'rotate');assert(Math.abs(e.value-.9)<.01);
opening[0]=e.value;
e=gesture.step(state,hand(true,3*Math.PI/4),valves,opening,200);assert.equal(e.kind,'rotate');assert.equal(e.value,1);
e=gesture.step(state,hand(false),valves,opening,250);assert.equal(e.kind,'release');
assert.equal(gesture.step(state,null,valves,opening,350).kind,'lost');
assert(Math.abs(gesture.deltaAngle(3.1,-3.1))<.1);
// A pinch that begins away from the valve should acquire it when the hand moves close.
const approach=gesture.createState(),v=[{x:250,y:300}],p=[0.25];
let eApproach=gesture.step(approach,hand(true,0,{x:40,y:300}),v,p,0);
assert.equal(eApproach.kind,'pinch-outside');
eApproach=gesture.step(approach,hand(true,0,{x:250,y:300}),v,p,220);
assert.equal(eApproach.kind,'grab');
assert.equal(eApproach.index,0);
eApproach=gesture.step(approach,hand(true,Math.PI/4,{x:250,y:300}),v,p,430);
assert.equal(eApproach.kind,'rotate');
assert(eApproach.value>p[0]);
const network=makeNetwork({mode:'air',seed:34,surface:'wall'});
let full=solveFlow(network,[true,true,true]);let half=solveFlow(network,[.5,true,true]);let closed=solveFlow(network,[0,true,true]);
assert(half.terminalFlows[0]<full.terminalFlows[0]);assert(half.terminalFlows[0]>0);
assert.equal(closed.terminalFlows[0],0);
assert(closed.terminalFlows[1]>0);
for(let n=1;n<40;n++){
 const net=makeNetwork({mode:n%2?'water':'plant',seed:n,surface:'wall'});
 for(const pct of [0,.1,.35,.6,.85,1]){
  const x=solveFlow(net,[pct,1,.45]);assert(x.total>=0&&Number.isFinite(x.total));
 }
}
const dwell=gesture.createState(),hoverValves=[{x:270,y:300}];const o=[0];
let h=gesture.step(dwell,hand(false),hoverValves,o,0);assert.equal(h.kind,'hover');
h=gesture.step(dwell,hand(false),hoverValves,o,1401);assert.equal(h.kind,'dwell-toggle');assert.equal(h.value,1);
h=gesture.step(dwell,hand(false),hoverValves,o,2600);assert.notEqual(h.kind,'dwell-toggle');
h=gesture.step(dwell,null,hoverValves,o,2900);assert.equal(h.kind,'lost');
console.log('PASS: gesture and fractional valve tests, 234 partial-flow cases');
