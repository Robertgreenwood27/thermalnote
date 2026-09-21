# Licence for `body-muscles.glb`

**This file covers the 3D model only.** The rest of Thermalnote is not an adaptation of the
model and is not licensed under these terms.

`body-muscles.glb` is licensed under the
**Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)**.
To view a copy of this licence, visit <https://creativecommons.org/licenses/by-sa/4.0/>,
or send a letter to Creative Commons, PO Box 1866, Mountain View, CA 94042, USA.
The complete legal text is at <https://creativecommons.org/licenses/by-sa/4.0/legalcode>.

## Attribution

The model is an adaptation, and each step keeps the same licence:

- **Z-Anatomy** — <https://www.z-anatomy.com/> — the original anatomical dataset. CC BY-SA 4.0.
- **body-anatomy-3d-viewer** by hpfrei — <https://github.com/hpfrei/body-anatomy-3d-viewer> —
  simplified the geometry, embedded per-mesh metadata, and applied DRACO compression to produce
  `body.glb`. Copyright (c) 2026, hpfrei. CC BY-SA 4.0.
- **Thermalnote** — this repository. CC BY-SA 4.0 for this file.

## Changes made here

`tools/build-body-model.mjs` produced this file from hpfrei's `body.glb`:

- Removed every mesh not typed `muscle` — the skeleton is gone.
- Removed the anatomical descriptions and wiki links embedded in each node's `extras`, keeping
  only the part name under the key `part`.
- Decoded the DRACO compression, so the geometry is stored uncompressed.
- Dropped the stored vertex normals; the app recomputes them when the model loads.

## You are free to

- **Share** — copy and redistribute the material in any medium or format.
- **Adapt** — remix, transform, and build upon the material for any purpose, even commercially.

## Under the following terms

- **Attribution** — You must give appropriate credit, provide a link to the licence, and
  indicate if changes were made. You may do so in any reasonable manner, but not in any way
  that suggests the licensor endorses you or your use.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute
  your contributions under the same licence as the original.
- **No additional restrictions** — You may not apply legal terms or technological measures
  that legally restrict others from doing anything the licence permits.
