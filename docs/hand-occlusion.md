# WallPipe AR v0.9.3: hand foreground (approximate occlusion)

## Purpose
Show a real hand in front of a world-anchored 3D valve/pipe by using the camera frame captured for hand tracking. This is **not** true 3D depth occlusion.

## Implementation
- `js/hand-occlusion.js` builds a lightweight palm polygon and finger capsules from 21 MediaPipe landmarks.
- During each successful hand inference, it uses a transparent foreground 2D canvas. It clips the XR camera video to the approximate hand shape, then draws only that region over the Three.js scene.
- The existing `HandMap.mapLandmarks` maps landmark coordinates to the same page viewport and orientation setting. The video is drawn with a matching cover crop/rotation/mirror transform.
- No new camera stream is opened. The XR8-provided video is reused.
- Disabling the checkbox, losing hand detection, tracking loss, page hide, reset, and camera detach clear the overlay.
- Overlay errors disable this effect without stopping the separate hand gesture/valve controls.

## Size
- Initial model scale: 0.72 -> 0.95 (+32% relative change).
- Adjustment range: 0.50 to 1.30.
- This scales the whole pipe-and-valve assembly consistently, without changing fluid-flow parameters or pipe diameters.

## Limitations
- Not a precise hand segmentation algorithm: palm/finger silhouette is inferred from landmarks, so gaps/edges can be inaccurate.
- Foreground masking does not measure hand depth; hand pixels can cover virtual parts even when a real hand is physically farther back.
- Source-camera exposure, mirroring, orientation, XR8 crop, and latency may differ across iPhones. Do not claim correct live occlusion until device testing.
- Mask updates at the existing hand inference cadence (roughly 5 Hz); fast motion can leave lag.
- Rendering video on an overlay canvas may be blocked or mismatched in some WebKit/XR configurations; disable the toggle if artifacts appear.
- No video is sent to an app-operated backend for this effect.

## Verification
- `node tests/hand-occlusion.test.cjs`: contour data, transforms, clear state, mock draw operations.
- `node tests/ar-hand.test.cjs`: integration contract and unchanged plumbing/gesture checks.
- Actual AR hand/pipe occlusion, iPhone performance, and tracking accuracy remain device-level acceptance checks.
