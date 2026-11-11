/* WallPipe AR: 8th Wall world tracking + MediaPipe hand tracking, one camera feed.
 * The model is placed once in world coordinates, not drawn as a 2D camera overlay.
 * Image-space hand/valve interaction is approximate, not 3D collision detection.
 */
const THREE=window.THREE, Engine=window.WallPipeEngine, Gestures=window.WallPipeGesture;
const HandMap=window.WallPipeHandScreenMap, TrackingGate=window.WallPipeTrackingGate;
if(!THREE||!Engine||!Gestures||!HandMap||!TrackingGate)throw new Error('Missing WallPipe or three.js dependencies');
const $=id=>document.getElementById(id);
const ui={stage:$('stage'),canvas:$('arCanvas'),start:$('start'),place:$('place'),reset:$('reset'),panel:$('panel'),collapse:$('collapse'),preview:$('preview'),status:$('status'),statusText:$('statusText'),info:$('info'),hand:$('handState'),pointer:$('pointer'),opening:$('opening'),openingOut:$('openingOut'),select:$('valveSelect'),toggle:$('toggle'),summary:$('flowSummary'),quick:$('quickAction'),alignment:$('handTransform')};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
let started=false,scene=null,camera=null,anchor=null,video=null,tracking=false,lastTracking='';
let mode='water',network=null,openings=[1,1,1],selected=0,modelReady=false,landmarker=null,loadingHand=false;
let valves=[],flowMarkers=[],gesture=Gestures.createState(),lastInference=0,lastMessage='';
const trackingGate=TrackingGate.createState();
const colorByMode={water:0x2b8ea1,air:0x368d74,plant:0xb37a38};
function state(status,message){if(ui.status.dataset.status!==status||ui.statusText.textContent!==message){ui.status.dataset.status=status;ui.statusText.textContent=message;}}
function info(message){if(message!==lastMessage){ui.info.textContent=message;lastMessage=message;}}
function updateQuickAction(){
 if(!started){ui.quick.hidden=false;ui.quick.textContent='ARカメラを開始';ui.quick.disabled=!window.XR8;return;}
 if(!modelReady){ui.quick.hidden=false;ui.quick.textContent=tracking?'配管を空間に配置':'空間を認識中…';ui.quick.disabled=!tracking;return;}
 ui.quick.hidden=true;
}
function setSelection(index){selected=clamp(index,0,2);ui.select.value=String(selected);syncControls();}
function syncControls(){ui.opening.value=String(Math.round(openings[selected]*100));ui.openingOut.textContent=Math.round(openings[selected]*100)+'%';ui.toggle.textContent=openings[selected]>.5?'選択したバルブを閉める':'選択したバルブを開く';}
function refreshFlow(){
 if(!network)return;
 let summary;
 try{summary=Engine.solveFlow(network,openings);}catch(e){state('error','流量計算に失敗しました。');console.error(e);return;}
 ui.summary.textContent=`通水系統：${summary.active} / ${network.terminals.length}（相対流量 ${summary.total.toFixed(2)}）`;
 for(const v of valves){v.handle.rotation.z=(1-openings[v.index])*Math.PI*.5;v.ring.material.color.setHex(openings[v.index]>.01?0x247b76:0xac6748);}
}
function setOpening(index,value){if(!Number.isFinite(value))return;openings[index]=clamp(Math.round(value*100)/100,0,1);refreshFlow();if(index===selected)syncControls();}
function addRod(parent,a,b,r,mat){const d=new THREE.Vector3().subVectors(b,a),len=d.length();if(len<.0001)return null;const obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,12),mat);obj.position.copy(a).add(b).multiplyScalar(.5);obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(obj);return obj;}
function point(n,z=.06){return new THREE.Vector3(n.x*.00265,-n.y*.00265,z);}
function buildNetwork(){
 const seed=(Math.random()*4294967295)>>>0;
 network=Engine.makeNetwork({mode,surface:'wall',seed});openings=[1,1,1];Gestures.reset(gesture);selected=0;
 if(!anchor){syncControls();return;}
 for(const child of [...anchor.children]){child.traverse(obj=>{if(obj.geometry)obj.geometry.dispose();});anchor.remove(child);}
 for(const m of anchor.userData.materials||[])m.dispose();
 for(const texture of anchor.userData.textures||[])texture.dispose();
 anchor.userData.materials=[];anchor.userData.textures=[];
 valves=[];flowMarkers=[];
 const material=(color,metalness=.3,opacity=1)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.49,transparent:opacity<1,opacity,depthWrite:opacity===1});
 const pipeM=material(0x859b9b,.55),returnM=material(0x768890,.48),loadM=material(0xbd9160,.45);
 const jointM=material(0xb0bdba,.4),valveM=material(0xcbd3ce,.45),leverM=material(0xdfa34d,.35);
 const waterM=material(colorByMode[mode],.1);
 const labelMaterials=[],labelTextures=[];
 function addValveLabel(parent,index){
  const canvas=document.createElement('canvas');canvas.width=192;canvas.height=64;
  const c=canvas.getContext('2d');c.fillStyle='#173d43';c.fillRect(0,0,192,64);
  c.fillStyle='#ffffff';c.font='bold 34px monospace';c.textAlign='center';
  c.fillText('V-0'+(index+1),96,44);
  const tex=new THREE.CanvasTexture(canvas);const m=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
  const sprite=new THREE.Sprite(m);sprite.position.set(0,.17,.11);sprite.scale.set(.30,.10,1);parent.add(sprite);
  labelMaterials.push(m);labelTextures.push(tex);
 }

 const wallPanel=new THREE.Mesh(new THREE.PlaneGeometry(1.86,1.20),material(0x9caeaa,.0,.12));wallPanel.position.z=-.075;anchor.add(wallPanel);
 for(const e of network.edges){
  const na=network.nodes[e.a],nb=network.nodes[e.b];
  const a=point(na),b=point(nb),r=clamp(e.diameter*.00185,.015,.055);
  const m=e.kind==='return'?returnM:e.kind==='load'?loadM:pipeM;
  addRod(anchor,a,b,r,m);
  for(const p of [a,b]){const g=new THREE.Mesh(new THREE.SphereGeometry(r*1.04,9,7),jointM);g.position.copy(p);anchor.add(g);}
  const pulse=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.021,r*.55),8,7),waterM);
  pulse.visible=false;anchor.add(pulse);flowMarkers.push({mesh:pulse,edge:e,a,b});
 }
 for(let i=0;i<network.valves.length;i++){
  const v=network.valves[i],e=network.edges[v.edgeId],a=point(network.nodes[e.a]),b=point(network.nodes[e.b]);
  const p=a.clone().add(b).multiplyScalar(.5);p.z=.15;
  const base=new THREE.Group();base.position.copy(p);anchor.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.074,.017,8,18),valveM.clone());base.add(ring);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.14,10),jointM);stem.rotation.x=Math.PI/2;stem.position.z=.079;base.add(stem);
  const handle=new THREE.Group();handle.position.z=.17;base.add(handle);
  const lever=new THREE.Mesh(new THREE.BoxGeometry(.20,.032,.04),leverM);lever.position.x=.065;handle.add(lever);
  const hub=new THREE.Mesh(new THREE.SphereGeometry(.04,10,7),valveM);handle.add(hub);
  addValveLabel(base,i);
  valves.push({index:i,marker:new THREE.Vector3(p.x,p.y,p.z+.10),handle,ring});
 }
 anchor.userData.materials=[pipeM,returnM,loadM,jointM,valveM,leverM,waterM,wallPanel.material,...valves.map(v=>v.ring.material),...labelMaterials];
 anchor.userData.textures=labelTextures;
 refreshFlow();syncControls();
 ui.preview.textContent='配管は仮想の設備です。配置後はその位置に留まり、端末を動かすと横から観察できます。';
}
function resetPlacement(){if(anchor){anchor.visible=false;}modelReady=false;ui.reset.disabled=true;ui.place.disabled=!tracking;Gestures.reset(gesture);showHandPoint(null,'');updateQuickAction();info('配置を解除しました。カメラで壁を映し、再配置してください。');}
function placeModel(){
 if(!tracking||!camera||!anchor){info('追跡が安定してから配置してください。');return;}
 // Tracking comes from XR8; the approximate wall target is 1.5m along the view ray.
 // This is intentionally not presented as actual vertical-plane detection.
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
 const flat=new THREE.Vector3(forward.x,0,forward.z);
 if(flat.length()<.2){info('壁の方向にスマホを向けてください。');return;}
 flat.normalize();
 anchor.position.copy(camera.position).addScaledVector(forward,1.5);
 anchor.rotation.set(0,Math.atan2(-flat.x,-flat.z),0);
 anchor.visible=true;anchor.updateMatrixWorld(true);
 modelReady=true;ui.reset.disabled=false;ui.place.disabled=false;
 Gestures.reset(gesture);updateQuickAction();
 info('配管を配置しました。左右に動いて側面を確認し、バルブに手をかざしてください。');
}
function projectMarkers(){
 if(!modelReady||!anchor||!camera)return [];
 anchor.updateWorldMatrix(true,true);camera.updateMatrixWorld(true);
 return valves.map(v=>{const p=anchor.localToWorld(v.marker.clone()).project(camera);return {x:(p.x+1)*.5*ui.canvas.clientWidth+ui.canvas.getBoundingClientRect().left,y:(1-p.y)*.5*ui.canvas.clientHeight+ui.canvas.getBoundingClientRect().top,valid:p.z>-1&&p.z<1};});
}
function pickValve(x,y){const points=projectMarkers();let idx=-1,best=85;for(let i=0;i<points.length;i++){if(!points[i].valid)continue;const d=Math.hypot(x-points[i].x,y-points[i].y);if(d<best){idx=i;best=d;}}return idx;}
function showHandPoint(p,kind){if(!p){ui.pointer.style.display='none';return;}ui.pointer.style.display='block';ui.pointer.style.left=p.x+'px';ui.pointer.style.top=p.y+'px';ui.pointer.classList.toggle('grab',kind==='grab'||kind==='rotate');}
function handleGesture(result){
 if(result.point)showHandPoint(result.point,result.kind);else showHandPoint(null,'');
 if(!tracking||!modelReady)return;
 if(result.kind==='grab'){setSelection(result.index);ui.hand.textContent=`V-0${result.index+1} をつかみました。手を回してください。`;}
 if(result.kind==='rotate'){setOpening(result.index,result.value);ui.hand.textContent=`V-0${result.index+1} の開度 ${Math.round(openings[result.index]*100)}%`;}
 if(result.kind==='dwell-toggle'){setSelection(result.index);setOpening(result.index,result.value);ui.hand.textContent='手のかざし操作で開閉しました。';}
 if(result.kind==='release')ui.hand.textContent='手を離しました。';
 if(result.kind==='hover')ui.hand.textContent=`V-0${result.index+1} に手をかざし中：${Math.round(result.progress*100)}%`;
}
async function initializeHandTracking(){
 if(loadingHand||landmarker)return;
 loadingHand=true;ui.hand.textContent='手認識モデルを読み込み中…';
 try{
  const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
  const opts={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};
  try{landmarker=await HandLandmarker.createFromOptions(vision,opts);}catch(e){console.warn('GPU hand inference unavailable; falling back to CPU',e);opts.baseOptions.delegate='CPU';landmarker=await HandLandmarker.createFromOptions(vision,opts);}
  ui.hand.textContent='手認識が有効です。バルブの前でピンチしてください。';
 }catch(err){console.error('Hand tracker unavailable',err);ui.hand.textContent='手認識を起動できません。画面タップまたはスライダー操作を使用してください。';}
 finally{loadingHand=false;}
}
function sampleHand(){
 if(!landmarker||!video||!tracking||!modelReady||document.hidden||video.readyState<2){showHandPoint(null,'');return;}
 const now=performance.now();if(now-lastInference<115)return;lastInference=now;
 try{
  const detections=landmarker.detectForVideo(video,now),landmarks=detections?.landmarks?.[0];
  if(!landmarks){Gestures.step(gesture,null,[],openings,now);showHandPoint(null,'');return;}
  // The source video comes from XR8.onAttach. Coordinates are image-space only.
  const rect=ui.canvas.getBoundingClientRect();
  const points=HandMap.mapLandmarks(landmarks,{videoWidth:video.videoWidth,videoHeight:video.videoHeight,rect,mode:ui.alignment.value});
  if(!points){showHandPoint(null,'');return;}
  const visible=projectMarkers().map(v=>v.valid?v:{x:-99999,y:-99999});
  handleGesture(Gestures.step(gesture,points,visible,openings,now));
 }catch(err){console.error('Hand frame processing stopped',err);landmarker=null;ui.hand.textContent='手認識が停止しました。タップ操作を使用してください。';showHandPoint(null,'');}
}
function animateFlow(){if(!modelReady||!network)return;const t=performance.now()*.00030;for(const e of flowMarkers){const f=e.edge.flow;e.mesh.visible=Math.abs(f)>.004;if(!e.mesh.visible)continue;const p=(t*Math.min(2,Math.max(.35,Math.abs(f)*5))+e.edge.id*.17)%1;e.mesh.position.copy(e.a).lerp(e.b,f>=0?p:1-p);}}
function pipePipelineModule(){return {
 name:'wallpipe-world-hand',
 onStart:()=>{
  const xrscene=window.XR8.Threejs.xrScene();scene=xrscene.scene;camera=xrscene.camera;
  scene.add(new THREE.HemisphereLight(0xf3fffc,0x49605f,2.2));
  const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(-1,2,3);scene.add(light);
  anchor=new THREE.Group();anchor.name='wallpipe-fixed-world-anchor';anchor.visible=false;scene.add(anchor);
  window.XR8.XrController.updateCameraProjectionMatrix({origin:camera.position,facing:camera.quaternion});
  buildNetwork();state('loading','カメラが起動しました。空間追跡を初期化中です。');
 },
 onAttach:({video:sourceVideo})=>{video=sourceVideo||null;initializeHandTracking();},
 onDetach:()=>{video=null;tracking=false;TrackingGate.update(trackingGate,'LIMITED',10,1);showHandPoint(null,'');Gestures.reset(gesture);updateQuickAction();},
 onUpdate:({processCpuResult})=>{
  const reality=processCpuResult?.reality;
  const status=reality?.trackingStatus||'INITIALIZING';
  const stable=TrackingGate.update(trackingGate,status);
  if(stable!==tracking||status!==lastTracking){
   tracking=stable;lastTracking=status;
   if(tracking){state('ready','空間追跡が安定しました。配管を配置できます。');ui.place.disabled=false;}
   else{state('loading',status==='NORMAL'?'位置を安定化しています…':'追跡が不安定です。ゆっくり動かしてください。');ui.place.disabled=true;}
   updateQuickAction();
  }
  if(tracking){sampleHand();animateFlow();}else{showHandPoint(null,'');Gestures.reset(gesture);}
 },
 onCameraStatusChange:({status})=>{if(status==='failed')state('error','カメラを開始できません。Safariのカメラ権限を確認してください。');},
 onException:(e)=>{state('error','AR処理でエラーが発生しました。');console.error(e);}
};}
function startAR(){
 if(started||!window.XR8)return;
 started=true;ui.start.disabled=true;ui.start.textContent='ARカメラ実行中';ui.stage.classList.add('running');updateQuickAction();
 try{
  window.XR8.XrController.configure({disableWorldTracking:false,scale:'absolute'});
  window.XR8.addCameraPipelineModules([window.XR8.GlTextureRenderer.pipelineModule(),window.XR8.Threejs.pipelineModule(),window.XR8.XrController.pipelineModule(),pipePipelineModule()]);
  window.XR8.run({canvas:ui.canvas});
  info('空間追跡を開始しています。壁の模様が見えるよう、ゆっくりカメラを動かしてください。');
 }catch(err){started=false;ui.start.disabled=false;ui.start.textContent='ARカメラを再試行';state('error','ARの起動に失敗しました。');updateQuickAction();console.error(err);}
}
function checkEngine(){if(window.XR8){state('ready','ARエンジンの準備ができました。');ui.start.disabled=false;updateQuickAction();return true;}return false;}
window.addEventListener('xrloaded',checkEngine);
if(!checkEngine())setTimeout(()=>{if(!window.XR8){state('error','8th Wallエンジンを読み込めません。ネット接続と対応ブラウザを確認してください。');ui.start.disabled=true;}},14000);
ui.start.addEventListener('click',startAR);
ui.quick.addEventListener('click',()=>{if(!started)startAR();else if(!modelReady)placeModel();});
ui.place.addEventListener('click',placeModel);
ui.reset.addEventListener('click',resetPlacement);
ui.collapse.addEventListener('click',()=>{const closed=ui.panel.classList.toggle('is-collapsed');ui.collapse.setAttribute('aria-expanded',String(!closed));ui.collapse.textContent=closed?'操作を開く':'操作を閉じる';});
ui.select.addEventListener('change',()=>setSelection(Number(ui.select.value)));
ui.opening.addEventListener('input',()=>setOpening(selected,Number(ui.opening.value)/100));
ui.toggle.addEventListener('click',()=>setOpening(selected,openings[selected]>.5?0:1));
$('regen').addEventListener('click',()=>{buildNetwork();info(modelReady?'配管を再生成しました。空間位置は維持しています。':'配管を再生成しました。カメラを起動し配置してください。');});
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{mode=b.dataset.mode;for(const c of document.querySelectorAll('[data-mode]'))c.setAttribute('aria-pressed',String(c===b));buildNetwork();});
ui.canvas.addEventListener('pointerup',e=>{if(!modelReady||!tracking)return;const idx=pickValve(e.clientX,e.clientY);if(idx>=0){setSelection(idx);setOpening(idx,openings[idx]>.5?0:1);ui.hand.textContent=`画面タップで V-0${idx+1} を操作しました。`;}});
syncControls();updateQuickAction();
