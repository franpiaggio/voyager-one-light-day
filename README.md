# Voyager 1 · One light-day

On 18 November 2026, at 10:16:07 UTC, Voyager 1 crossed a line no human-made object had crossed before. It became one light-day away from Earth. A radio signal sent from here now takes a full day to reach it.

It launched on 5 September 1977. It took forty-nine years to get that far.

This project tells that story in under a minute.

**[Watch it live →](https://franpiaggio.github.io/voyager-one-light-day/)** · **[En español →](https://franpiaggio.github.io/voyager-one-light-day/es/)**

## The idea

Most mission visualizers show you everything at once: panels, labels, numbers, orbits. This one shows two things. A date, and a distance from Earth. Everything else is motion.

You watch Voyager leave Earth. The camera pulls back and the solar system opens up. Jupiter arrives, bends the trajectory, and lets go. Then Saturn does the same and throws the spacecraft up and out of the plane of the planets. The distance keeps climbing. When it stops, one line remains on screen:

**1 light-day.**

The path is not invented. Every position comes from NASA/JPL Horizons ephemerides, interpolated between samples, and the distance on screen is computed from the real positions of Earth and Voyager at that instant. What is artistic is the staging: planet sizes, lighting and camera framing are tuned so you can actually see what is happening.

Along the way, the photographs Voyager 1 took appear on the day they were taken. Earth and the Moon in a single frame. The Great Red Spot. A volcano erupting on Io. And the Pale Blue Dot, from 1990. The gallery holds 22 of them, each with its capture date and source.

## Run it

It is a static site. No build step, no install, no API keys, no CDN.

```bash
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000> in a browser with WebGL. Opening `index.html` directly from disk won't work, since ES modules need to be served over HTTP.

The journey starts on its own. Play/pause and speed (0.25× to 4×) live in the bottom bar next to the timeline, which you can drag to any date. The photo icon opens the archive; opening it pauses the journey and closing it resumes.

## How it is built

- **Three.js** (0.180, vendored in `dist/vendor`), plain ES modules, no framework.
- **Trajectory**: heliocentric J2000 vectors for Voyager 1 and the eight planets from JPL Horizons, stored in `dist/data/ephemeris.json`. Positions are interpolated with cubic Hermite splines using the supplied velocities, so the flybys bend exactly where the data says they do.
- **Floating origin**: the whole scene is re-centred and scaled around the camera every frame. That way a 25-billion-kilometre trip and a close pass over Jupiter's cloud tops fit in the same coordinate system.
- **Camera** (`journey.js`): a pure function of mission progress. Pausing, seeking, replaying and changing speed always land on the same frame.
- **Rendering**: HDR pipeline with bloom, a custom colour grade and a solar glare that hides behind planets. The sky is the ESO 360° Milky Way panorama.

### Files

```
dist/
  index.html          entry point
  app.js              scene, loading, render loop
  journey.js          time and camera controller
  photos.js           archive card and gallery
  photo-catalog.js    photo metadata
  starfield.js        Milky Way + stars
  earth-material.js   Earth day/night/clouds shader
  cinema-post.js      post-processing pass
  ship-presentation.js  opening shot staging
  credits.html        sources and licenses
  i18n.js             Spanish strings (UI language follows <html lang>)
  es/                 Spanish edition: same modules, served from ../ via <base>
  data/               ephemeris and photo catalog
  assets/             textures, model, photos, fonts
scripts/
  fetch_ephemeris.py  re-download vectors from Horizons
  vendor_three.py     re-download pinned Three.js
  verify*.mjs         numerical checks
```

### Checks

```bash
node scripts/verify.mjs          # milestone distances, camera poses, framing, pacing
node scripts/verify-opening.mjs  # opening shot against the real model geometry
node scripts/verify-photos.mjs   # photo schedule and local files
node scripts/verify-post.mjs     # solar glare occlusion
```

These are geometric tests. They don't replace looking at it.

## Limits

The ephemeris starts about an hour after launch, so the first seconds of the opening are staged, not reconstructed. The data ends at the milestone itself: the app never extrapolates beyond it. Planet and spacecraft sizes are exaggerated for legibility, and the orientation of the sky is illustrative.

## Credits

- Trajectory: [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
- Milestone reference: [NASA, "What is a light-day?"](https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/)
- Spacecraft model: [NASA Voyager 3D model](https://science.nasa.gov/resource/voyager-3d-model/)
- Planet textures: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0
- Milky Way: [ESO/S. Brunier](https://www.eso.org/public/images/eso0932a/), CC BY 4.0
- Photographs: NASA/JPL and NASA/JPL-Caltech, per the [JPL image use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/)
- Typography: Montserrat, SIL Open Font License 1.1

Full per-asset provenance lives in `dist/credits.html`, `dist/assets/assets-credits.json` and `dist/data/photo-catalog.json`. NASA imagery is used without implying endorsement.
