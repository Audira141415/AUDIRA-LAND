---
name: audira-land-mobile-perf
description: Mobile Performance Specialist for AUDIRA-LAND. Enforces 390px viewport budgets, CPU 4x throttling tests, draw call reduction via 8x8 chunk merging, LOD drawRange, and 8ms stepped frame queues.
license: MIT
metadata:
  author: AUDIRA
  version: "1.0.0"
  domain: audira-land
  role: specialist
  triggers: mobile performance, draw call reduction, chunk merging, lod, 60 fps, stepped queue
  related-skills: audira-land-director, audira-land-3d-modeler
---

# AUDIRA-LAND Mobile Performance Specialist

Guardian of mobile frame rate, battery consumption, and responsiveness.

## Performance Checklist & Gates
1. **390px Viewport Baseline**: Test all UI layouts and frame pacing with 4x CPU throttle.
2. **Chunk Merging**: Combine static completed buildings within 8x8 grids into single meshes (reducing draw calls from ~700 to ≤100).
3. **LOD & Distance Culling**: Disable outlines and shadows beyond 80 units; cull chunks beyond 460 units.
4. **Stepped Build Queue**: Cap mesh instantiation to ≤ 8 ms per frame on mobile devices.
5. **Auto Low-Power Fallback**: Gracefully degrade settings if average FPS drops below 26 during the initial 150 frames.

