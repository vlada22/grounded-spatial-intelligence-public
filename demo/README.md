# Browser reconstruction explorer

The demo is a static Three.js application over precomputed Article 02 reconstruction data. It
does not run DA3 or SAM 3 in the browser. The checked-in assets contain source frames,
semantic overlays, downsampled PLY point clouds, camera states, object geometry and
the reviewed experiment reports.

Build the data from the raw GPU artifact bundle:

```bash
uv sync --extra dev --extra experiment
uv run python examples/build_browser_demo_data.py \
  /path/to/article-02-experiment-artifacts \
  demo
```

Serve locally from the repository root:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/demo/`. A web server is required because browsers do
not allow the module and PLY fetches from `file://` URLs.

The application vendors the three required `three@0.185.1` ES modules under
`demo/vendor/three/`, so the deployed page has no runtime CDN dependency. All experiment
data is local to the repository and contains no model credentials.
