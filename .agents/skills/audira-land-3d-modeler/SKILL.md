---
name: audira-land-3d-modeler
description: 3D Asset Developer and Modular Architecture Specialist for AUDIRA-LAND. Builds low-poly Nusantara buildings (warung, ruko, rumah limas, pos ronda), procedural facade grammar, and instanced street props in Three.js and Blender.
license: MIT
metadata:
  author: AUDIRA
  version: "1.0.0"
  domain: audira-land
  role: specialist
  triggers: 3d model, low poly, three.js, modular building, warung, ruko, facade grammar
  related-skills: audira-land-director, audira-land-mobile-perf, chibi-style, lowpoly-style
---

# AUDIRA-LAND 3D Modeler

Specialist in procedural, low-poly 3D world assets adhering to the "Warm Ink" (Tinta Hangat) aesthetic.

## Responsibilities
- Author modular buildings in `web/src/models/<type>.js` and Blender 5.2.2.
- Enforce strict triangle budgets: ≤ 2,250 tris per residential home, ≤ 5,000 tris per large public structure.
- Implement procedural facade seed variations (windows, canopies, street signs, terraces) so no two buildings look identical.
- Implement ink outline silhouettes (1.4px in map mode, 1.8px in walk mode).
- Ensure 100% adherence to Zero-Submerging Surface Policy (`bottomY >= surfaceY`).

