# Grounded Spatial Intelligence

Public, publication-focused companion repository for Article 02, **A Depth Map Is Not a World Model**.

This repository is the sanitized public artifact bundle for the already-published article. The browser explorer preserves the published Three.js reconstruction demo, source frames, semantic overlays, camera states, reviewed scene metadata, downsampled PLY point clouds, object geometry, condition switching, frame inspection, and spatial measurements. The only intentional demo change is that repository navigation points here rather than to the research repository.

The public boundary is around the research/runtime workspace rather than the published demo itself: model checkpoints, credentials, Colab notebooks and outputs, raw GPU handoff archives, internal research/review material, and duplicate publication drafts remain excluded.

- [Open the interactive reconstruction explorer](https://vlada22.github.io/grounded-spatial-intelligence-public/)

## Published experiment

The controlled study separates visible-surface observability, learned geometry, learned segmentation, the raw DA3 + SAM 3 pipeline, and deterministic 3D consistency filtering. A second image-only condition evaluates camera estimation after one explicit similarity alignment. The checked-in demo preserves the browser-facing reconstruction assets and interactions while excluding model weights and private runtime material.

## Verify the published result

```bash
python scripts/validate_public_bundle.py
python scripts/verify_published_results.py
```

The verification script recomputes the published condition summaries from `scene.json`, checks the camera baseline, pairwise errors, retained-frame fractions, nearest-neighbour accuracy, and confirms that the referenced public point clouds are present. It does not download or execute gated models.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000/demo/`.

## Repository layout

```text
demo/                         published Three.js reconstruction explorer
  data/scene.json             reviewed browser scene contract
  data/frames/                published source frames
  data/clouds/                published downsampled PLY observations
  vendor/                     vendored browser dependencies from the published demo
scripts/validate_public_bundle.py
scripts/verify_published_results.py
PUBLICATION_SOURCE.json        source-repository commit provenance
THIRD_PARTY.md                 upstream model references
```

See [THIRD_PARTY.md](THIRD_PARTY.md) for the upstream models used to produce the reviewed outputs.
