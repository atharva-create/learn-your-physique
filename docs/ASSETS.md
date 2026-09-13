# Preparing anatomical assets

The application ships with its generated assets in `public/anatomy/`. These instructions are only needed when changing the source dataset or preprocessing.

Source attribution and license terms are maintained in [ATTRIBUTION.md](../public/anatomy/ATTRIBUTION.md). Preserve these notices in regenerated assets and visual derivatives.

## Inputs

The scripts resolve paths from the repository root. Inspect their input constants before substituting a newer dataset.

- `public/anatomy/muscles.glb` and `skeleton.glb` preserve `public/anatomy.glb` and `public/skeleton.glb` from [JohanBellander/BodyExplorer](https://github.com/JohanBellander/BodyExplorer).
- `data/mesh_mapping.json` comes from the same upstream project's `public/mesh_mapping.json`.
- BodyParts3D 4.0 reduced-polygon meshes come from the official [BodyParts3D archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), distributed as `isa_BP3D_4.0_obj_99.zip`. Save this as `data/bodyparts3d.zip`.
- Extract `isa_BP3D_4.0_obj_99/FJ2810.obj` from the ZIP into `data/obj/`; `prepare_skin.py` reads this extracted skin mesh.
- The catalog preparation also uses the archive's ISA and part-of element/part tables. See the filenames read by `scripts/prepare_anatomy.py`.

Do not commit raw archives, the Python virtual environment or intermediate OBJ extractions. Source archives can be larger than GitHub's per-file limit; generated runtime files are already included.

## Workflow

```sh
python3 -m venv .venv
.venv/bin/pip install numpy scipy
.venv/bin/python scripts/prepare_anatomy.py
.venv/bin/python scripts/prepare_skin.py
.venv/bin/python scripts/prepare_face.py
npm test
npm run build
```

Review the generated catalog, mesh counts and rendered results before publishing. Face geometry provides visual context and does not increase the muscle count. Surface deformation and material detail are illustrative additions, not new anatomical measurements.
