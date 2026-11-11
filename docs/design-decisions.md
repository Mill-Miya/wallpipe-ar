# WallPipe AR — UI design notes

## Purpose

An inspection-style interface for studying how generic valves affect flow in a simulated piping network. The visualization, not decorative website UI, is the primary content.

## Visual language

- Neutral light background inspired by engineering drawings and inspection software.
- One restrained teal accent for selected settings, active paths and primary actions.
- Amber only for selected markers and important state changes.
- Squared controls, hairline separators, no glow, no glass cards, no decorative gradients.
- Monospaced valve IDs and live numeric control values.
- Desktop: unobstructed model workspace with a fixed right inspector.
- Mobile: compact bottom controls that open on demand.

## Interaction

- Preserve 2D camera-overlay simulation, flow toggle, three modes, two valves, reset, transparency, zoom and 3D/AR mode.
- 2D canvas supports pointer drag/tap as before, plus ArrowLeft / ArrowRight selection and Enter / Space toggle for keyboard users.
- AR and camera failure messages remain inside the page. User sees explicit disclosure that no real pipes are detected.
- 3D rendering depends on @google/model-viewer and device support for spatial AR; actual iOS AR behavior requires on-device testing.

## Taste Skill reference

Design approach informed by the publicly available Taste Skill by Leonxlnx:
https://github.com/Leonxlnx/taste-skill

Applied selectively: genuine product UI as visual focus, concrete copy, a restrained design system, responsive alignment, actionable controls, quiet stateful motion, reduced-motion support and browser testing. The skill's full-page marketing rules (hero entrances, one section per screen, required visual moments) are not suited to a single-screen operational AR interface and were not copied. No Taste Skill source files have been modified or incorporated.

## Verification

Local Chromium screenshots were reviewed at 1440x900, 820x1180, 390x844 and 360x740. Browser interactions tested: mode change, flow toggle, numeric slider, panel collapse/expand, help dialog, keyboard valve selection and operation, and 2D/3D view switch. No JavaScript runtime errors were observed in those local tests. The external model-viewer module was excluded from offline interaction tests, so production CDN loading and actual AR placement require separate device/HTTPS verification.