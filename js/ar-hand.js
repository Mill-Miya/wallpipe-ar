/* WallPipe AR: 8th Wall world tracking + MediaPipe hand tracking, one camera feed.
 * The model is placed once in world coordinates, not drawn as a 2D camera overlay.
 * Image-space hand/valve interaction is approximate, not 3D collision detection.
 */
const THREE=window.THREE, Engine=window.WallPipeEngine, Gestures=window.WallPipeGesture;
const HandMap=window.WallPipeHandScreenMap, TrackingGate=window.WallPipeTrackingGate;
if(!THREE||!Engine||!Gestures||!HandMap||!TrackingGate)throw new Error('Missing WallPipe or three.js dependencies');
const $=id=>document.getElementById(id);
const ui={stage:$('stage'),canvas:$('arCanvas'),start:$('start'),place:$('place'),reset:$('reset'),panel:$('panel'),collapse:$('collapse'),preview:$('preview'),status:$('status'),statusText:$('statusText'),info:$('info'),hand:$('handState'),pointer:$('pointer'),opening:$('opening'),openingOut:$('openingOut'),select:$('valveSelect'),toggle:$('toggle'),summary:$('flowSummary'),quick:$('quickAction'),alignment:$('handTransform'),handRetry:$('handRetry'),rescan:$('rescan'),trackingDetails:$('trackingDetails'),handHud:$('handHud'),scale:$('placeScale'),scaleOut:$('placeScaleOut'),distance:$('placeDistance'),distanceOut:$('placeDistanceOut'),height:$('placeHeight'),heightOut:$('placeHeightOut'),reticle:$('targetReticle')};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
let started=false,scene=null,camera=null,anchor=null,video=null,ownedVideo=null,tracking=false,lastTracking='',lastReason='';
let mode='water',network=null,openings=[1,1,1],selected=0,modelReady=false,landmarker=null,loadingHand=false;
let valves=[],flowMarkers=[],gesture=Gestures.createState(),lastInference=0,lastMessage='',handInitFailed=false,lastVideoTime=-1,lastHandsSeen=0;
const trackingGate=TrackingGate.createState();
const colorByMode={water:0x2b8ea1,air:0x368d74,plant:0xb37a38};
function state(status,message){if(ui.status.dataset.status!==status||ui.statusText.textContent!==message){ui.status.dataset.status=status;ui.statusText.textContent=message;}}
function info(message){if(message!==lastMessage){ui.info.textContent=message;lastMessage=message;}}
function handStatus(kind,message){if(ui.handHud.dataset.state!==kind||ui.handHud.textContent!==message){ui.handHud.dataset.state=kind;ui.handHud.textContent=message;}}
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
 for(const v of valves){const op=openings[v.index],shut=1-op;v.handle.rotation.z=(v.type==='gate'||v.type==='control')?shut*Math.PI*3:shut*Math.PI*.5;if(v.type==='gate'||v.type==='control')v.handle.position.z=.187+op*.018;if(v.disc)v.disc.rotation.y=op*Math.PI*.5;v.ring.material.color.setHex(op>.01?0x829a9a:0x9c7564);}
}
function setOpening(index,value){if(!Number.isFinite(value))return;openings[index]=clamp(Math.round(value*100)/100,0,1);refreshFlow();if(index===selected)syncControls();}
function addRod(parent,a,b,r,mat){const d=new THREE.Vector3().subVectors(b,a),len=d.length();if(len<.0001)return null;const obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,12),mat);obj.position.copy(a).add(b).multiplyScalar(.5);obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());parent.add(obj);return obj;}
function point(n,z=.06){return new THREE.Vector3(n.x*.00265,-n.y*.00265,z);}
function buildNetwork(){
 const seed=(Math.random()*4294967295)>>>0;
 network=Engine.makeNetwork({mode,surface:'wall',seed});openings=[1,1,1];Gestures.reset(gesture);selected=0;
 if(!anchor){syncControls();return;}
 const disposed=new Set();for(const child of [...anchor.children]){child.traverse(obj=>{if(obj.geometry&&!disposed.has(obj.geometry)){disposed.add(obj.geometry);obj.geometry.dispose();}});anchor.remove(child);}
 for(const m of anchor.userData.materials||[])m.dispose();
 for(const texture of anchor.userData.textures||[])texture.dispose();
 anchor.userData.materials=[];anchor.userData.textures=[];
 valves=[];flowMarkers=[];
 const ownedMaterials=[],labelTextures=[];
 const material=(color,metalness=.4,opacity=1)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness:.51,transparent:opacity<1,opacity,depthWrite:opacity===1});ownedMaterials.push(m);return m;};
 const tint={water:[0x7b9ca6,0x6d8493],air:[0x829f98,0x69828d],plant:[0x998b7b,0x7b828a]}[mode];
 const pipeM=material(tint[0],.55),returnM=material(tint[1],.48),loadM=material(0xb48f65,.43);
 const jointM=material(0xb0bcb9,.48),valveM=material(0x869c9f,.53),leverM=material(0xd3a157,.44),wheelM=material(0x485961,.43);
 const waterM=material(colorByMode[mode],.06);
 function at(parent,geom,mat,pos){const o=new THREE.Mesh(geom,mat);if(pos)o.position.copy(pos);parent.add(o);return o;}
 function collar(parent,p,r,axis,ratio=1.2){const c=at(parent,new THREE.CylinderGeometry(r*ratio,r*ratio,.026,14),jointM,p);c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);return c;}
 function addValveLabel(parent,index){
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=52;
  const c=canvas.getContext('2d');c.fillStyle='#173d43';c.fillRect(0,0,160,52);
  c.fillStyle='#fff';c.font='bold 29px monospace';c.textAlign='center';c.fillText('V-0'+(index+1),80,36);
  const tex=new THREE.CanvasTexture(canvas),m=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
  ownedMaterials.push(m);labelTextures.push(tex);
  const sprite=new THREE.Sprite(m);sprite.position.set(0,.19,.24);sprite.scale.set(.25,.084,1);parent.add(sprite);
 }
 // Translucent reference plane establishes a physical depth cue when viewed obliquely.
 const wallPanel=at(anchor,new THREE.PlaneGeometry(1.88,1.24),material(0x92a9a2,0,.075));
 wallPanel.position.z=-.11;
 const jointRadius=new Map(),degrees=new Map(),pulseGeo=new THREE.SphereGeometry(.020,8,6);
 for(const e of network.edges){
  const r=clamp(e.diameter*.00172,.014,.052);
  for(const id of [e.a,e.b]){jointRadius.set(id,Math.max(jointRadius.get(id)||0,r));degrees.set(id,(degrees.get(id)||0)+1);}
  const a=point(network.nodes[e.a]),b=point(network.nodes[e.b]);
  const m=e.kind==='return'?returnM:e.kind==='load'?loadM:pipeM;
  addRod(anchor,a,b,r,m);
  // A pipe sleeve shows the transition between a header and a smaller branch.
  if(e.kind==='supply'&&r>.032)collar(anchor,a.clone().lerp(b,.83),r,b.clone().sub(a).normalize(),1.14);
  const pulse=at(anchor,pulseGeo,waterM,a.clone());
  pulse.visible=false;flowMarkers.push({mesh:pulse,edge:e,a,b});
 }
 const junctionShape=new THREE.SphereGeometry(1,12,9);
 for(const [id,r] of jointRadius){
  const p=point(network.nodes[id]),j=at(anchor,junctionShape,jointM,p);
  j.scale.setScalar(r*1.06);
  if((degrees.get(id)||0)>=3)at(anchor,new THREE.BoxGeometry(r*2.05,r*2.05,.025),jointM,p.clone().add(new THREE.Vector3(0,0,-.021)));
 }
 // A few support standoffs connect the long runs to the wall.
 let supports=0;
 for(const [id,degree] of degrees){if(degree<2||supports>=4)continue;
  const p=point(network.nodes[id]);p.z=-.035;
  at(anchor,new THREE.BoxGeometry(.032,.027,.14),wheelM,p);supports++;
 }
 function makeValve(i){
  const v=network.valves[i],e=network.edges[v.edgeId],a=point(network.nodes[e.a]),b=point(network.nodes[e.b]);
  const p=a.clone().add(b).multiplyScalar(.5),axis=b.clone().sub(a).normalize();
  const r=clamp(e.diameter*.00172,.014,.052);
  // Flanged connections are anchored on either side of the real flow axis.
  for(const t of [-.5,.5])collar(anchor,p.clone().addScaledVector(axis,t*.18),Math.max(r,.029),axis,1.55);
  const type=mode==='water'?'ball':mode==='air'?'control':['gate','ball','butterfly'][i%3];
  const base=new THREE.Group();base.position.copy(p);anchor.add(base);
  const ring=at(base,new THREE.SphereGeometry(1,14,10),material(0x8a9e9e,.54));
  ring.scale.set(type==='butterfly'?.059:.10,type==='butterfly'?.06:.081,type==='butterfly'?.03:.058);
  const bonnet=at(base,new THREE.CylinderGeometry(.031,.047,type==='gate'?.17:.105,12),valveM,new THREE.Vector3(0,0,type==='gate'?.125:.085));
  bonnet.rotation.x=Math.PI/2;
  addRod(base,new THREE.Vector3(0,0,.08),new THREE.Vector3(0,0,.18),.018,jointM);
  const handle=new THREE.Group();handle.position.z=.187;base.add(handle);
  let disc=null;
  if(type==='ball'||type==='butterfly'){
   const lever=at(handle,new THREE.BoxGeometry(type==='ball'?.23:.17,.026,.032),leverM,new THREE.Vector3(type==='ball'?.09:.065,0,0));
   at(handle,new THREE.SphereGeometry(.027,9,7),wheelM,new THREE.Vector3(type==='ball'?.19:.135,0,0));
   if(type==='butterfly'){disc=at(base,new THREE.CylinderGeometry(.052,.052,.017,16),wheelM);disc.rotation.x=Math.PI/2;}
  }else{
   at(handle,new THREE.TorusGeometry(.089,.013,8,22),wheelM);
   for(let k=0;k<4;k++){const t=k*Math.PI/2;addRod(handle,new THREE.Vector3(),new THREE.Vector3(Math.cos(t)*.09,Math.sin(t)*.09,0),.009,wheelM);}
   at(handle,new THREE.SphereGeometry(.027,9,7),leverM);
  }
  addValveLabel(base,i);
  return {index:i,type,marker:new THREE.Vector3(p.x,p.y,p.z+.17),handle,ring,disc};
 }
 for(let i=0;i<network.valves.length;i++)valves.push(makeValve(i));
 anchor.userData.materials=ownedMaterials;
 anchor.userData.textures=labelTextures;
 refreshFlow();syncControls();
 ui.preview.textContent='配管は仮想の設備です。配置後はその位置に留まり、端末を動かすと横から観察できます。';
}
function resetPlacement(){if(anchor){anchor.visible=false;}modelReady=false;ui.reticle.classList.remove('is-placed');ui.distance.disabled=false;ui.height.disabled=false;ui.scale.disabled=false;ui.reset.disabled=true;ui.place.disabled=!tracking;Gestures.reset(gesture);showHandPoint(null,'');updateQuickAction();info('配置を解除しました。カメラで壁を映し、再配置してください。');}
function placeModel(){
 if(!tracking||!camera||!anchor){info('追跡が安定してから配置してください。');return;}
 // Tracking comes from XR8; the approximate wall target is 1.5m along the view ray.
 // This is intentionally not presented as actual vertical-plane detection.
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
 const flat=new THREE.Vector3(forward.x,0,forward.z);
 if(flat.length()<.2){info('壁の方向にスマホを向けてください。');return;}
 flat.normalize();
 anchor.position.copy(camera.position).addScaledVector(forward,Number(ui.distance.value));
 anchor.position.y+=Number(ui.height.value);
 anchor.scale.setScalar(Number(ui.scale.value));
 anchor.rotation.set(0,Math.atan2(-flat.x,-flat.z),0);
 anchor.visible=true;anchor.updateMatrixWorld(true);
 ui.reticle.classList.add('is-placed');ui.distance.disabled=true;ui.height.disabled=true;ui.scale.disabled=true;
 modelReady=true;ui.reset.disabled=false;ui.place.disabled=false;
 Gestures.reset(gesture);updateQuickAction();
 ui.hand.textContent=landmarker?'手認識が有効です。バルブの前でピンチしてください。':'手認識を準備しています…';
 handStatus(landmarker?'ready':'idle',landmarker?'手認識：準備完了。バルブへ手を向けてください。':'手認識：モデルを読み込み中');
 if(video&&!landmarker&&!loadingHand)initializeHandTracking();
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
 if(result.kind==='grab'){setSelection(result.index);ui.hand.textContent=`V-0${result.index+1} をつかみました。手を回してください。`;handStatus('tracking',`手認識：V-0${result.index+1} をつかんでいます`);}
 if(result.kind==='rotate'){setOpening(result.index,result.value);ui.hand.textContent=`V-0${result.index+1} の開度 ${Math.round(openings[result.index]*100)}%`;handStatus('tracking',`V-0${result.index+1}：開度 ${Math.round(openings[result.index]*100)}%`);}
 if(result.kind==='dwell-toggle'){setSelection(result.index);setOpening(result.index,result.value);ui.hand.textContent='手のかざし操作で開閉しました。';handStatus('tracking',`V-0${result.index+1}：手をかざして切替完了`);}
 if(result.kind==='release')ui.hand.textContent='手を離しました。';
 if(result.kind==='hover'){ui.hand.textContent=`V-0${result.index+1} に手をかざし中：${Math.round(result.progress*100)}%`;handStatus('tracking',`V-0${result.index+1} にかざし中 ${Math.round(result.progress*100)}%`);}
}
async function initializeHandTracking(){
 if(loadingHand||landmarker||!video)return;
 loadingHand=true;handInitFailed=false;ui.handRetry.style.display='none';ui.hand.textContent='手認識モデルを読み込み中…';handStatus('idle','手認識：モデルを読み込み中');
 try{
  const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs');
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
  const opts={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};
  try{landmarker=await HandLandmarker.createFromOptions(vision,opts);}catch(e){console.warn('GPU hand inference unavailable; falling back to CPU',e);opts.baseOptions.delegate='CPU';landmarker=await HandLandmarker.createFromOptions(vision,opts);}
  ui.hand.textContent='手認識が有効です。バルブの前でピンチしてください。';handStatus('ready','手認識：準備完了。手をカメラに映してください。');
 }catch(err){console.error('Hand tracker unavailable',err);handInitFailed=true;ui.handRetry.style.display='block';ui.hand.textContent='手認識を起動できません。画面タップ・スライダーで操作するか、再試行してください。';handStatus('error','手認識：モデル読込失敗。操作パネルから再試行');}
 finally{loadingHand=false;}
}
function sampleHand(){
 if(!tracking||!modelReady||document.hidden){showHandPoint(null,'');return;}
 if(!video){handStatus('error','手認識：カメラ映像を取得できません');return;}
 if(!landmarker){return;}
 if(video.readyState<2||!video.videoWidth||!video.videoHeight){handStatus('idle','手認識：カメラ映像を準備中');return;}
 const now=performance.now();if(now-lastInference<195)return;
 // XR camera streams may expose a video whose currentTime stays unchanged
 // while the WebGL frame pipeline advances. Use a time budget, not currentTime,
 // to avoid permanently freezing hand recognition on affected iPhones.
 lastInference=now;
 try{
  const detections=landmarker.detectForVideo(video,now),landmarks=detections?.landmarks?.[0];
  if(!landmarks){Gestures.step(gesture,null,[],openings,now);showHandPoint(null,'');handStatus('ready','手認識：手が見つかりません。明るい場所で手を映してください。');return;}
 lastHandsSeen=now;
  // The source video comes from XR8.onAttach. Coordinates are image-space only.
  const rect=ui.canvas.getBoundingClientRect();
  const points=HandMap.mapLandmarks(landmarks,{videoWidth:video.videoWidth,videoHeight:video.videoHeight,rect,mode:ui.alignment.value});
  if(!points){showHandPoint(null,'');return;}
  const visible=projectMarkers().map(v=>v.valid?v:{x:-99999,y:-99999});
  const event=Gestures.step(gesture,points,visible,openings,now);
  handleGesture(event);
  if(event.kind==='tracking'||event.kind==='pinch-outside')handStatus('ready',event.kind==='tracking'?'手認識：手を検出。バルブに近づけてください。':'手認識：指を検出。バルブの近くでピンチしてください。');
 }catch(err){console.error('Hand frame processing stopped',err);landmarker=null;handInitFailed=true;ui.handRetry.style.display='block';ui.hand.textContent='手認識が停止しました。タップ操作を使用してください。';handStatus('error','手認識：処理エラー。操作パネルから再試行');showHandPoint(null,'');}
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
 onAttach:({video:sourceVideo,stream:sourceStream})=>{
  video=sourceVideo||null;
  if(!video&&sourceStream){
    ownedVideo=document.createElement('video');ownedVideo.muted=true;ownedVideo.playsInline=true;ownedVideo.autoplay=true;
    ownedVideo.srcObject=sourceStream;video=ownedVideo;ownedVideo.play().catch(()=>{handStatus('error','手認識：映像の再生に失敗しました');});
  }
  handStatus('idle',video?'手認識：配管を配置すると起動します':'手認識：カメラ映像の取得を確認中');
  if(modelReady&&!landmarker)initializeHandTracking();
 },
 onDetach:()=>{if(ownedVideo){ownedVideo.pause();ownedVideo.srcObject=null;ownedVideo=null;}video=null;tracking=false;TrackingGate.update(trackingGate,'LIMITED',10,1);showHandPoint(null,'');Gestures.reset(gesture);updateQuickAction();ui.hand.textContent='ARを再開して配管を配置すると手認識を利用できます。';},
 onUpdate:({processCpuResult})=>{
  const reality=processCpuResult?.reality;
  const status=reality?.trackingStatus||'INITIALIZING';
  const reason=reality?.trackingReason||'UNSPECIFIED';
  const stable=TrackingGate.update(trackingGate,status);
  if(stable!==tracking||status!==lastTracking||reason!==lastReason){
   tracking=stable;lastTracking=status;lastReason=reason;
   ui.trackingDetails.textContent=tracking?'追跡：安定（NORMAL）':status==='NORMAL'?'追跡：安定化中':status==='LIMITED'?`追跡：制限あり（${reason}）`:'追跡：初期化中';
   ui.rescan.disabled=false;
   if(tracking){state('ready','空間追跡が安定しました。配管を配置できます。');ui.place.disabled=false;}
   else{state('loading',status==='NORMAL'?'位置を安定化しています…':'追跡が不安定です。壁だけでなく模様のある床や家具もゆっくり映してください。');ui.place.disabled=true;}
   updateQuickAction();
  }
  if(tracking){sampleHand();animateFlow();}else{showHandPoint(null,'');Gestures.reset(gesture);}
 },
 onCameraStatusChange:({status})=>{if(status==='failed')state('error','カメラを開始できません。Safariのカメラ権限を確認してください。');else if(status==='hasVideo')ui.trackingDetails.textContent='カメラ映像は取得済み。SLAMの初期化を確認中。';},
 onException:(e)=>{state('error','AR処理でエラーが発生しました。');console.error(e);}
};}
function startAR(){
 if(started||!window.XR8)return;
 started=true;ui.start.disabled=true;ui.start.textContent='ARカメラ実行中';ui.stage.classList.add('running');updateQuickAction();
 try{
  window.XR8.XrController.configure({disableWorldTracking:false,scale:'absolute'});
  const modules=[window.XR8.GlTextureRenderer.pipelineModule(),window.XR8.Threejs.pipelineModule(),window.XR8.XrController.pipelineModule()];
  if(window.XRExtras?.FullWindowCanvas?.pipelineModule)modules.push(window.XRExtras.FullWindowCanvas.pipelineModule());
  else ui.trackingDetails.textContent='全画面補正ライブラリを取得できません。再読み込みを試してください。';
  modules.push(pipePipelineModule());
  window.XR8.addCameraPipelineModules(modules);
  window.XR8.run({canvas:ui.canvas,allowedDevices:window.XR8.XrConfig.device().ANY,cameraConfig:{direction:window.XR8.XrConfig.camera().BACK}});
  setTimeout(()=>{if(started&&!tracking&&!modelReady){
    ui.trackingDetails.textContent='認識が続いています。明るい場所で、模様のある床・家具をゆっくり映してください。';
    ui.rescan.disabled=false;
  }},12000);
  info('空間追跡を開始しています。壁の模様が見えるよう、ゆっくりカメラを動かしてください。');
 }catch(err){started=false;ui.stage.classList.remove('running');ui.start.disabled=false;ui.start.textContent='ARカメラを再試行';state('error','ARの起動に失敗しました。');updateQuickAction();console.error(err);}
}
function checkEngine(){if(window.XR8){state('ready','ARエンジンの準備ができました。');ui.start.disabled=false;updateQuickAction();return true;}return false;}
window.addEventListener('xrloaded',checkEngine);
if(!checkEngine())setTimeout(()=>{if(!window.XR8){state('error','8th Wallエンジンを読み込めません。ネット接続と対応ブラウザを確認してください。');ui.start.disabled=true;}},14000);
ui.distance.addEventListener('input',()=>{ui.distanceOut.textContent=Number(ui.distance.value).toFixed(1)+'m';});
ui.height.addEventListener('input',()=>{ui.heightOut.textContent=Math.round(Number(ui.height.value)*100)+'cm';});
ui.scale.addEventListener('input',()=>{ui.scaleOut.textContent=Math.round(Number(ui.scale.value)*100)+'%';});
ui.start.addEventListener('click',startAR);
ui.rescan.addEventListener('click',()=>{
  if(!started||!window.XR8)return;
  resetPlacement();TrackingGate.update(trackingGate,'LIMITED',10,3);tracking=false;
  if(typeof window.XR8.XrController.recenter==='function')window.XR8.XrController.recenter();
  else if(camera)window.XR8.XrController.updateCameraProjectionMatrix({origin:camera.position,facing:camera.quaternion});
  ui.trackingDetails.textContent='追跡を再初期化中。模様のある場所をゆっくり映してください。';
  state('loading','空間認識をやり直しています。');
});
ui.handRetry.addEventListener('click',()=>{if(video&&!loadingHand){initializeHandTracking();}else ui.hand.textContent='先にARを開始し、配管を配置してください。';});
document.addEventListener('visibilitychange',()=>{Gestures.reset(gesture);showHandPoint(null,'');lastInference=0;if(document.hidden&&started)ui.hand.textContent='アプリは一時停止中です。';else if(!document.hidden&&started)ui.hand.textContent=handInitFailed?'手認識を再試行するか、タッチで操作してください。':landmarker?'手認識が有効です。':'配管を配置すると手認識を準備します。';});
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
