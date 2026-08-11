# Grounded Spatial Intelligence

Public, publication-focused companion repository for Article 02, **A Depth Map Is Not a World Model**.

This is the sanitized public artifact bundle for the already-published article. It keeps the reviewed aggregate measurements and a credential-free interactive reconstruction summary while excluding model checkpoints, tokens, Colab notebooks and outputs, raw GPU handoff archives, internal research/review material, and duplicate publication drafts.

- [Open the interactive reconstruction explorer](https://vlada22.github.io/grounded-spatial-intelligence-public/)

## Published experiment

The controlled study separates visible-surface observability, learned geometry, learned segmentation, the raw DA3 + SAM 3 pipeline, and deterministic 3D consistency filtering. A second image-only condition evaluates camera estimation after one explicit similarity alignment. The public payload preserves the measurements used by the published article without redistributing gated runtime material.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000/demo/`.

## Repository layout

```text
demo/                         static aggregate-evidence explorer
scripts/validate_public_bundle.py
THIRD_PARTY.md                upstream model references
```

See [THIRD_PARTY.md](THIRD_PARTY.md) for the upstream models used to produce the reviewed outputs.
