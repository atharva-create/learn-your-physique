# Anatomical data and licenses

Learn Your Physique's application interface and simulation code are original. Its anatomical assets are derived from the sources below; anatomical asset licenses remain applicable independently of application code.

## BodyParts3D

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- Official archive: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Current license (updated February 2025): https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- Source release: BodyParts3D 4.0, reduced polygon meshes.

The skin layer was extracted from the official `isa_BP3D_4.0_obj_99.zip`, element FJ2810. Learn Your Physique converted the mesh to a compact binary format, replaced external genital detail with a smooth local skin patch, and added approximate deformation fields. The surrounding body and source vertex topology are retained. The archive itself contains older CC BY-SA 2.1 Japan notices; these are acknowledged here alongside the archive's current license.

Facial context uses the same archive's left/right sclera (FJ1317/FJ1368), iris (FJ1297/FJ1348), and cornea (FJ1289/FJ1340). FJ2814 (lip) supplies a color mask registered to the skin vertices. Eye geometry retains its source coordinates. Iris appearance, dark pupil backing, muscle-fiber and skin microdetail, complexion color, and lighting are illustrative rendering additions. They do not add to the muscle count or represent personal biometric details.

The BodyParts3D muscle and skeleton assets supplied by BodyExplorer carry the attribution: BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan. That distributed attribution is retained.

- CC BY-SA 2.1 Japan: https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en

## Z-Anatomy

Z-Anatomy by Gauthier Kervyn, licensed under CC BY-SA 4.0.

- Project: https://www.z-anatomy.com/
- License: https://creativecommons.org/licenses/by-sa/4.0/

Z-Anatomy supplies supplemental muscle and connective-tissue meshes. Their source is identified per mesh in catalog.json. Adaptations of these data remain available under CC BY-SA 4.0.

## GLB preparation

Johan Bellander / BodyExplorer prepared and aligned the combined muscle dataset and skeleton GLB files from BodyParts3D and Z-Anatomy.

- Source: https://github.com/JohanBellander/BodyExplorer
- Original asset files: public/anatomy.glb, public/skeleton.glb, public/mesh_mapping.json
- Downloaded: 2026-09-13

The downloaded GLB files are preserved unchanged as muscles.glb and skeleton.glb. Learn Your Physique generates its own grouping catalog, geometry metadata, surface deformation fields, and interactive transformations. Derived combined anatomical data and runtime anatomical transformations are made available under CC BY-SA 4.0, while preserving the individual source notices above. There is no implied endorsement by any data provider.

## Coverage and interpretation

446 muscle meshes are exposed through 236 controls; bilateral counterparts and some components share a control. The remaining 21 meshes in muscles.glb are connective-tissue structures. 201 bone meshes and one skin layer provide context. These numbers describe these files, not all muscles or bones in a person. Some structures and anatomical variants are absent, and some segmental muscles are grouped.

The model represents an adult male reference, not a measured individual. Muscle size changes are illustrative geometry transformations. The skin deformation is an approximation, not a validated biomechanical or hypertrophy model.

## Educational context

- OpenStax, Anatomy and Physiology 2e, chapter 11: https://openstax.org/books/anatomy-and-physiology-2e/pages/11-introduction
- Hubal et al., Variability in muscle size and strength gain after unilateral resistance training (2005): https://pubmed.ncbi.nlm.nih.gov/15947721/

Movement examples in the app describe broad exercise patterns. They are not an individualized training program or a claim of isolated muscle recruitment.
