# WallPipe AR v0.9.5 — reliability audit (2026-11-12)

Scope: project repository only. No third-party repositories modified.

## Architecture and ownership

- `ar-hand.html` is the primary mobile WebAR experience; `index.html` is its entry point. Older 2D camera demos remain non-primary.
- XR8 controls one camera stream and world tracking. Three.js renders the fixed scene coordinates. MediaPipe consumes the XR-provided video element; no second `getUserMedia` request.
- `js/piping-engine.js` owns network graph and approximate fluid conductance. `js/pipe-assets.js` and `js/valve-assets.js` own visual meshes. Hand tracking and masking must not mutate the flow topology.

## Bugs addressed

1. **Hand inference blocking XR frame callbacks**: stopped invoking MediaPipe directly from XR8 `onUpdate`. A separate timer samples after frame updates. On unusually slow inferences, the interval is increased to reduce contention; it is not a separate worker thread, and CPU stalls remain possible.
2. **Late GLB model loading**: when a network regeneration makes an async valve response obsolete, dispose its cloned meshes/materials rather than silently leaking them.
3. **Camera teardown**: invalidate pending work, close hand inference, stop timers, release owned textures/meshes and cached-kit instance materials without disposing shared pipe-kit geometry, and reset placement.
4. **Camera failures and slow tracking**: show a restart action for camera/engine errors; after prolonged SLAM initialization show a direct tracking-rescan action rather than leaving the user permanently on a disabled “tracking” control.
5. **Hand mask geometry**: corrected finger capsule end-cap curvature in the approximate foreground composite.
6. **Pinch acquisition**: allow entering a valve target while holding a pinch that started elsewhere.
7. **Mobile visual field**: reduce obstructive instructional overlays after the user places piping; keep genuine 3D loading errors visible.
8. **MediaPipe loading**: pinned SDK release, alternate CDN, explicit initialization stages, CPU→GPU fallback, and endpoint verification (from v0.9.4).
9. **Exploration framing**: default near-field model placement (1.3m/140%) with adjustable sizing and distant overview mode (from v0.9.4).

## Automated verification

- `node tests/piping.test.cjs` — fluid graph and valve closure
- `node tests/pipe-layout.test.cjs` — generated segments/fittings topology
- `node tests/pipe-kit.test.cjs` — pipe GLB and renderer contracts
- `node tests/valve-assets.test.cjs` — authored valve GLB contracts
- `node tests/gesture.test.cjs` — open/close/rotate, hover, late pinch acquisition
- `node tests/hand-screen-map.test.cjs` — screen/video rotation, crop transforms
- `node tests/hand-occlusion.test.cjs` — foreground mask, clear and capsule caps
- `node tests/hand-model-loader.test.cjs` — CDN failover, inference initialization and error classification
- `node tests/ar-lifecycle.test.cjs` — executable simulated disposal of scene/valve instances and shared mesh retention
- `node tests/ar-hand.test.cjs` — AR placement/hand integration regression
- `node tests/site.test.mjs` — static source and GLB metadata

GitHub Actions: `AR hand integration QA`, `Authored pipe kit QA`, `WallPipe static and model QA`, and Pages deploy.

## Remains unverified without an iPhone

- Whether a real Safari XR session obtains a valid MediaPipe video feed consistently.
- Hand-position alignment and foreground masking accuracy on the live iPhone camera.
- Tracking drift and wall placement. The current XR8 implementation uses SLAM/world coordinates, **not vertical wall detection or a persistent physical wall anchor**.
- Browser GPU memory/thermal throttling on extended use.
- Actual interaction latency and realistic water-flow fidelity. The flow solver is an illustrative resistance network, not a calibrated hydraulic solver.

**Do not mark these items complete solely because CI passes.**

## Field acceptance checklist (when a real device is available)

1. Verify version and AR camera full-window display.
2. Select “nearby exploration”; place once and observe left/right perspective with movement.
3. Check error state after permission denial and restart behavior.
4. Hand HUD must progress from SDK/WASM/MODEL to READY, then detect a palm.
5. Approach the valve with a pinch already held; rotate and release. Check flow changes.
6. Toggle occlusion: the hand should appear in front of pipes without a permanent opaque rectangle; check orientation and landscape.
7. Regenerate several times. Confirm no accumulating lag, frozen hand video or missing models.
