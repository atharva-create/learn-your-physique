# Launch kit

- [Demo video](learn-your-physique-demo.mp4): a 38.5-second MP4 with embedded captions; works with sound off.
- [Poster image](demo-poster.jpg).
- [Separate captions](demo-captions.srt).
- [Main Twitter post and suggested first reply](twitter-post.md). The main post is 243 characters when its URL uses Twitter's 23-character URL accounting.

The demo records real interactions in the running app: shoulder selection, size adjustment, anatomy/physique layers, reference comparison, back and glute exploration, and reset. Pauses are shortened in the edit; playback speed is not a performance benchmark. Model changes are illustrative geometry, not promised training outcomes.

## Recreate

Build and serve the Pages version first (see the root README). Install Playwright Chromium, then run:

```sh
node scripts/record_demo.mjs
.venv/bin/pip install imageio-ffmpeg
.venv/bin/python scripts/edit_demo.py
```

`DEMO_URL` can point to another running instance. `DEMO_CHROME=1` uses an installed Google Chrome in a fresh, isolated session. Raw recordings and intermediate files are kept under `launch/raw/` and excluded from Git. The edit script uses an available Arial or DejaVu Sans font.

## Visual attribution

The recorded anatomy and anatomy-derived screenshots retain their source terms. BodyParts3D, © The Database Center for Life Science; Z-Anatomy by Gauthier Kervyn; combined GLB preparation by Johan Bellander / BodyExplorer. Adapted combined anatomical visuals are available under CC BY-SA 4.0 with the retained upstream notices. Full credits and source links: [anatomical asset attribution](../public/anatomy/ATTRIBUTION.md). The original app code is MIT licensed.
