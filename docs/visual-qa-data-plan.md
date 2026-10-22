# Visual QA: available knowledge and data plan

## Assets already in this repository

- Runtime model metadata and setup scripts: `local-ai/model-manifest.json`, `local-ai/MODEL-README.md`, `local-ai/Install-Local-Model.ps1`, `local-ai/Start-Local-AI.ps1`.
- RCSS compatibility catalogue: `src/core/rcss-matrix.ts`.
- Conversion knowledge/rules: `src/core/knowledge-base.ts`, `docs/conversion-rules.md`, `docs/compatibility-model.md`, `docs/rcss-compatibility.md`, `docs/validation-strategy.md` and `docs/research-sources.md`.
- Regression fixtures/golden cases: `src/core/tests/converter.test.ts`, `src/core/tests/conversion-golden.test.ts`, `src/core/tests/html-parser.test.ts`, layout pipeline tests and historical v4-v25 validation logs.
- Project inputs already used in development include the LAMGUARD HTML screen, a Figma JSON layer export and an SVG companion, plus generated RML/RCSS bundles.

These are enough to build a grounded *inference-time reviewer* and regression suite. They are not yet a curated fine-tuning corpus.

## Model runtime parameters already tracked

`local-ai/model-manifest.json` pins the Qwen3-VL-2B-Instruct GGUF variant (Q4_K_M), its image projector (Q8_0), source URLs and SHA-256 hashes. The runtime is the pinned Windows x64 `llama.cpp` release and the bundled setup scripts expect local inference. The binary model weights are **not included** in the source ZIP: the install script downloads them when the target PC has HTTPS access to the official Hugging Face model repository, or the files can be copied from another machine.

Runtime configuration such as `LOCAL_VLM_BASE_URL`, `LOCAL_VLM_MODEL`, request timeout and token budget is separate from training parameters. The optional visual reviewer reuses the configured local endpoint and does not modify model weights.

## Missing data for real model training

The repository does **not** currently contain a curated set of source/target screenshot pairs labelled with confirmed visual defects and their corrected target files. Test logs are useful software regression evidence, but they are not a supervised visual dataset.

## Recommended data record for each future QA example

1. Source HTML/CSS/JS and all source assets, plus the source-browser screenshot.
2. Generated RML/RCSS/JS, package assets and deterministic diagnostics.
3. A screenshot captured from native UE/PIE or a reproducible offscreen VaCuus render at the same resolution/state.
4. Human-confirmed issue labels: extra/missing element, geometry, typography, color, asset/crop, clipping, unsupported RCSS property, or functional state.
5. Corrected target files and a short explanation of the accepted fix. Preserve “no issue” examples too.

Keep evaluation examples separated by *project/screen*, not by randomly splitting near-identical screenshots. First validate prompt-grounded inference against a small human-reviewed benchmark; only investigate fine-tuning if repeated, measured errors remain after improving deterministic conversion rules and the review prompt.
