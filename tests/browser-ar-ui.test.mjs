import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.WALLPIPE_TEST_URL || 'http://127.0.0.1:8765/';
const browserArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'];
const launch = () => chromium.launch({headless:true, args:browserArgs});

async function installXRFixture(page, supported = true) {
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{value:'iPhone Safari'}));
  // Simulate only 8th Wall's device and tracking callbacks. Three.js, the
  // placement code, generated network and the GLB loaders run normally.
  await page.route('**/xrextras.js', route => route.fulfill({
    contentType:'application/javascript',
    body:'window.XRExtras={FullWindowCanvas:{pipelineModule:()=>({})}};'
  }));
  await page.route('**/xr.js', route => route.fulfill({
    contentType:'application/javascript',
    body:`
      let modules, scene, camera;
      const empty = {pipelineModule:()=>({})};
      window.xrRuns = 0;
      window.XR8 = {
        GlTextureRenderer: empty,
        Threejs: {...empty, xrScene:()=>({scene,camera})},
        XrController: {...empty, configure(){}, updateCameraProjectionMatrix({origin}){
          window.xrOriginHeight=origin.y;
        }, recenter(){}},
        XrConfig: {device:()=>({MOBILE:'mobile'}),camera:()=>({BACK:'back'})},
        XrDevice: {isDeviceBrowserCompatible:()=>${supported}},
        addCameraPipelineModules(value){ modules=value; },
        run({canvas,allowedDevices}){
          if (allowedDevices!=='mobile') throw Error('World tracking requires MOBILE');
          window.xrRuns++;
          canvas.style.zIndex='999';
          scene=new THREE.Scene(); window.xrScene=scene; camera=new THREE.PerspectiveCamera(60,canvas.clientWidth/canvas.clientHeight,.01,100);
          window.xrCamera=camera;
          const world=modules.at(-1);
          world.onStart();
          window.xrTrack=()=>{for(let i=0;i<10;i++)world.onUpdate({processCpuResult:{reality:{trackingStatus:'NORMAL',position:{x:0,y:1.6,z:0}}}});};
          window.xrMove=(position)=>world.onUpdate({processCpuResult:{reality:{trackingStatus:'NORMAL',position}}});
          window.xrFail=()=>world.onCameraStatusChange({status:'failed'});
        }
      };
      window.dispatchEvent(new Event('xrloaded'));
    `
  }));
}

async function checkLayout(page, panelOpen) {
  const layout = await page.evaluate(() => {
    const bounds = selector => {
      const node = document.querySelector(selector);
      if (!node.getClientRects().length) return null;
      const r = node.getBoundingClientRect();
      return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, height:r.height,
        reachable:node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
    };
    return {width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,
      canvas:bounds('#arCanvas'),header:bounds('.topbar'),panel:bounds('#panel'),dock:bounds('.dock'),
      controls:['#quickAction','#forcePlace','#reset','#collapse'].map(bounds).filter(Boolean)};
  });
  assert.equal(Boolean(layout.panel),panelOpen);
  assert.equal(layout.docWidth,layout.width,'Document should not scroll horizontally');
  assert.equal(layout.canvas.height,layout.height,'Camera fills the viewport');
  for (const el of [layout.dock,...layout.controls,layout.panel].filter(Boolean)) {
    assert(el.left>=0&&el.right<=layout.width+1&&el.top>=layout.header.bottom-1&&el.bottom<=layout.height+1,
      'Controls remain inside the workspace: '+JSON.stringify(layout));
  }
  const overlaps = (a,b) => Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 &&
    Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
  if (layout.panel) assert(!overlaps(layout.panel,layout.dock),'Panel must not cover the action dock');
  for (const [i,el] of layout.controls.entries()) {
    assert(el.reachable&&el.height>=44,'Visible dock control must have a 44px hit area');
    assert(layout.controls.slice(i+1).every(other=>!overlaps(el,other)),'Dock controls must not overlap');
  }
}

for (const [width,height] of [[1440,900],[820,1180],[768,1024],[390,844],[320,568],[667,375]]) {
  const browser = await launch();
  try {
    const page = await browser.newPage({viewport:{width,height}});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
    await installXRFixture(page);
    if (width===390) await page.clock.install();
    const entry = width===820 ? new URL('ar-hand.html?rev=old',base).href : base;
    await page.goto(entry,{waitUntil:'domcontentloaded'});
    const action = page.locator('#quickAction');
    const settings = page.locator('#collapse');
    const verify = async (phase,open) => {
      await page.waitForFunction(phase=>document.querySelector('#app').dataset.phase===phase,phase);
      // ResizeObserver updates the panel limit after dock text/buttons reflow.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await checkLayout(page,open);
    };

    await verify('idle',false);
    assert.equal(page.url(),entry,'Entry should stay at its original URL');
    assert.equal(await page.evaluate(()=>window.xrRuns),0,'Loading the app must not start the camera');
    assert.equal(await page.getByRole('button',{name:'ARカメラを開始',exact:true}).count(),1);
    const brand = page.getByRole('link',{name:/Mill-Miyaのポートフォリオ/});
    assert.equal(await brand.getAttribute('href'),'https://mill-miya.github.io/');
    assert.equal(await brand.getAttribute('target'),'_blank');
    await page.waitForFunction(()=>document.querySelector('.maker img').naturalWidth>0);

    if (width===390) await page.screenshot({path:'/tmp/wallpipe-ui-mobile.png'});
    await settings.focus();
    await page.keyboard.press('Enter');
    await verify('idle',true);
    assert.equal(await settings.getAttribute('aria-expanded'),'true');
    if (width===390) await page.screenshot({path:'/tmp/wallpipe-ui-mobile-panel.png'});
    await page.keyboard.press('Escape');
    assert.equal(await settings.evaluate(el=>document.activeElement===el),true);
    await verify('idle',false);

    await settings.click();
    await action.click();
    await verify('scanning',true);
    assert.equal(await page.evaluate(()=>window.xrOriginHeight),1.6,'XR origin must have a nonzero initial camera height');
    assert.equal(await page.evaluate(()=>window.xrRuns),1);
    await settings.click();
    await verify('scanning',false);
    if (width===390) {
      await page.locator('#forcePlace').click();
      await verify('placed',false);
      await settings.click();
      await page.locator('#toggle').click();
      assert.equal(await page.locator('#opening').inputValue(),'0');
      await page.locator('#toggle').click();
      await settings.click();
      await page.locator('#reset').click();
      await verify('scanning',false);
    }
    if (width===390) {
      await page.clock.fastForward(12100);
      await page.getByRole('button',{name:'空間認識をやり直す',exact:true}).waitFor();
      await action.click();
      await verify('scanning',false);
      assert.equal(await action.isVisible(),false);
    }
    await page.evaluate(()=>window.xrTrack());
    await verify('place',false);
    await settings.click();
    await verify('place',true);
    await action.click();
    await verify('placed',true);
    const worldInvariant=await page.evaluate(()=>{
      const anchor=window.xrScene.getObjectByName('wallpipe-fixed-world-anchor');
      const camera=window.xrCamera;
      anchor.updateMatrixWorld(true);
      const before=anchor.matrixWorld.toArray();
      const original=camera.position.clone();
      const target=anchor.getWorldPosition(new THREE.Vector3());
      const front=target.clone().project(camera);
      // Inject translation through the SDK callback. The app must apply it.
      window.xrMove({x:original.x+1,y:original.y,z:original.z});
      const sdkApplied=camera.position.x===original.x+1;
      camera.rotation.y=Math.PI;
      camera.updateMatrixWorld(true);
      anchor.updateMatrixWorld(true);
      const rear=target.clone().project(camera);
      const after=anchor.matrixWorld.toArray();
      camera.position.copy(original);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
      return {before,after,sdkApplied,projectionChanged:front.distanceTo(rear)>0.1};
    });
    assert.deepEqual(worldInvariant.before,worldInvariant.after,'Moving and turning the camera must preserve world anchor coordinates');
    assert(worldInvariant.sdkApplied,'SDK translation must reach the rendering camera');
    assert(worldInvariant.projectionChanged,'Camera motion must change the projected view');
    assert.equal(await page.locator('#valveControls').isVisible(),true);
    await page.locator('#toggle').click();
    assert.equal(await page.locator('#opening').inputValue(),'0');
    await page.locator('[data-mode="air"]').click();
    assert.equal(await page.locator('#opening').inputValue(),'100');
    await page.locator('[data-mode="plant"]').click();
    assert.equal(await page.locator('[data-mode="plant"]').getAttribute('aria-pressed'),'true');
    await settings.click();
    await verify('placed',false);
    await page.locator('#reset').click();
    await verify('place',false);
    await page.evaluate(()=>window.xrFail());
    await verify('error',false);
    await settings.click();
    await verify('error',true);
    assert.equal(await action.innerText(),'ページを再読み込み');
    assert.equal(await action.isEnabled(),true);
    await page.evaluate(async()=>{
      await Promise.all(['ball','gate','butterfly','control'].map(type=>window.WallPipeValveAssets.loadValveModel(type)));
    });
    assert.deepEqual(errors,[],`Browser errors (${width}×${height})`);
    console.log(`PASS: ${width}×${height} explicit start, scan, placement, reset and failure with panel layout`);
  } finally {
    await browser.close();
  }
}
const browser = await launch();
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  await installXRFixture(page,false);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#app').dataset.phase==='unsupported');
  assert.equal(await page.locator('#quickAction').isVisible(),false);
  const preview = page.getByRole('link',{name:/配管の3Dプレビュー/});
  assert.match(await preview.getAttribute('href'),/pipe-preview\.html$/);
  const response = await page.request.get(new URL(await preview.getAttribute('href'),base).href);
  assert.equal(response.ok(),true);
  await page.screenshot({path:'/tmp/wallpipe-ui-desktop.png'});
  console.log('PASS: unsupported device reaches 3D preview without camera use');
} finally {
  await browser.close();
}

const desktop=await launch();
try{
 const page=await desktop.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Math.random=()=>.3;});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#app').dataset.preview==='true');
 assert.equal(await page.locator('#quickAction').isVisible(),false);
 await page.locator('#collapse').click();
 assert(await page.locator('#valveControls').isVisible());
 await page.locator('#toggle').click();
 assert.equal(await page.locator('#opening').inputValue(),'0');
 await page.locator('#toggle').click();
 // Project the deterministic first valve's handle using the preview camera.
 const point=await page.evaluate(()=>{
  const THREE=window.THREE;
  const network=window.WallPipeEngine.makeNetwork({mode:'water',surface:'wall',seed:(.3*4294967295)>>>0});
  const fit=window.WallPipeValvePlacement.mounting(network,0);
  const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,.01,100);
  camera.position.set(.2,.1,3.4);camera.lookAt(0,0,.06);camera.updateMatrixWorld();
  const z={ball:.177,gate:.255,butterfly:.181,control:.250}[fit.type];
  const p=new THREE.Vector3(fit.x,fit.y,fit.z+z*fit.radialScale).project(camera);
  return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
 });
 await page.mouse.click(point.x,point.y);
 assert.equal(await page.locator('#opening').inputValue(),'0','Click on the rendered valve must close it');
 await page.screenshot({path:'/tmp/wallpipe-desktop-interactive.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS desktop default 3D, rendered-valve click and slider controls');
}finally{await desktop.close();}
