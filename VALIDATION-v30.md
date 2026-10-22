# VaCuus UI Converter v30 — AI Visual Review Fix

Date: 2026-10-18

## Findings from auditing the existing main-screen AI Review feature

1. The button opened `VisualReviewModal`, but the default model was hard-coded to `Qwen3VL-2B-Instruct-Q4_K_M`. It did not discover the actual model ID exposed by the user's LM Studio `/v1/models`; a user who loaded Qwen3.8-27B could inadvertently send the request with the wrong ID.
2. The modal had no connection/model discovery action or visible connection state. Users could only enter a custom model alias manually and would not know whether the endpoint/model was available before uploading data and launching review.
3. The UI did not make the screenshot requirement sufficiently explicit. The AI Review feature does **not** automatically capture the current preview: it needs either two uploaded screenshots or one side-by-side screenshot with the source on the left.
4. Visual review could combine up to 48,000 characters of source/target code with 6,500 characters of knowledge and a multi-megapixel image. This can waste a 16K context and slow down Qwen 27B under CPU offload.
5. The server's visual-review function silently fell back to the bundled Qwen3-VL-2B when no model ID was supplied.

## Changes

- Changed the default model selection to automatic discovery, with optional manual ID entry.
- Added a `Проверить подключение и найти модель` button. It queries the local model status endpoint, which resolves `/v1/models`, and displays an explicit connection status plus the returned model IDs.
- Automatic selection prefers an already selected still-available ID; otherwise it prefers Qwen3.8, Qwen3.5, or an explicit vision/multimodal ID. It does not guess between unknown text-model IDs. A manual mode remains available for custom aliases.
- The audit button cannot start until connection is confirmed, screenshot input is present, and an explicit available/selected model ID is known.
- Added exact model-selection tests and fail-fast server validation instead of silent fallback to Qwen3-VL-2B.
- Bounded review input code fields to 8K/9K/8K/9K chars and diagnostics to 4K; lowered the default visual-review knowledge budget to 4,200 chars and output budget to 2,048 tokens. The prompt now requests at most 8 findings to make the result compact.
- Reduced the maximum side-by-side screenshot panel sizes to reduce multimodal prefill load while retaining the side-by-side comparison workflow.
- Clarified the UI, README, `.env.example`, and `docs/visual-review.md` with exact usage steps, including the fact that screenshots are manual inputs.
- Bumped package version to `0.30.0`.

## Tests and checks

- Focused local AI / visual review / Knowledge Engine / local bridge suites: **29 passed, 0 failed**.
- TypeScript/TSX/MTS syntax transpilation: **71 files, 0 syntax diagnostics**.
- `node --check local-ai-bridge/server.mjs`: passed.
- `node --check local-ai-bridge/test.mjs`: passed.
- `node --check figma-plugin/code.js`: passed.
- RCSS matrix synchronization: passed, 103 properties.

## Not verified in this environment

- `npm run build` could not run because `node_modules` are not installed (`vite: not found`).
- Full semantic TypeScript check was not run because application dependencies and React/Vite type packages are not installed in this workspace.
- No live LM Studio / Qwen inference was performed, and no Unreal Engine/VaCuus runtime screenshot was available here. The test suite uses mocked inference responses; users still need to verify the endpoint against their running Qwen model.

## How to use

1. Run the app locally: `npm install`, then `npm run dev`.
2. In LM Studio, load the vision-capable Qwen model and start the OpenAI-compatible server.
3. Click `AI-проверка` in the Preview toolbar.
4. Upload the original and converted screenshots (or one side-by-side image, source at left).
5. Keep `http://127.0.0.1:1234/v1` if LM Studio is on the same PC with its default port; click `Проверить подключение и найти модель`.
6. Confirm the selected exact model ID, then click `Запустить AI-проверку`.
7. The report provides a model-estimated score, concrete findings, confidence, suggested checks, and the Knowledge Engine sources used. It does not alter files automatically. For final target verification, the converted screenshot should come from UE/PIE or a native VaCuus render.
