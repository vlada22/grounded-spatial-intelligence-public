# Grounded Spatial Intelligence

Public, publication-focused companion repository for Article 02, **A Depth Map Is Not a World Model**.

This repository is the sanitized public artifact bundle for the already-published article. The browser demo is a mirror of the original published Three.js reconstruction explorer, including source frames, semantic overlays, camera states, reviewed scene metadata, downsampled PLY point clouds, object geometry, condition switching, frame inspection, and spatial measurements. Repository links inside the mirrored demo point to this public repository.

The public boundary is around the research/runtime workspace rather than the published demo itself: model checkpoints, credentials, Colab notebooks and outputs, raw GPU handoff archives, internal research/review material, and duplicate publication drafts remain excluded.

- [Open the interactive reconstruction explorer](https://vlada22.github.io/grounded-spatial-intelligence-public/)

## Published experiment

The controlled study separates visible-surface observability, learned geometry, learned segmentation, the raw DA3 + SAM 3 pipeline, and deterministic 3D consistency filtering. A second image-only condition evaluates camera estimation after one explicit similarity alignment. The checked-in demo now preserves the same browser-facing reconstruction assets and interactions as the original published explorer while still excluding model weights and private runtime material.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000/demo/`.

## Repository layout

```text
demo/                         mirrored original published Three.js explorer
  data/scene.json             reviewed browser scene contract
  data/frames/                published source frames
  data/clouds/                published downsampled PLY evidence
  data/results.json           compact publication summary used by validation
  vendor/                     vendored browser dependencies from original demo
scripts/validate_public_bundle.py
THIRD_PARTY.md                upstream model references
```

See [THIRD_PARTY.md](THIRD_PARTY.md) for the upstream models used to produce the reviewed outputs.
