# Optional AI visual QA for VaCuus conversion

## Purpose

The Preview toolbar's **AI-проверка** action starts an optional visual review after conversion. It is advisory and read-only: it does not apply edits or rewrite project files.

Setup: click **Проверить подключение и найти модель**. The app queries the configured local server's `/v1/models`, lists returned model IDs and prefers Qwen3.8/Qwen3.5 or an explicit vision model. It no longer silently defaults to the bundled Qwen3-VL-2B when the user's LM Studio is serving another model. Start review only after the server/model check succeeds.

Inputs:
- one already side-by-side comparison screenshot (original on the left, converted result on the right), or
- separate source and converted screenshots, which the browser combines into a labelled comparison image.

The current source HTML/CSS, target RML/RCSS and converter diagnostics are supplied as bounded contextual text, to avoid overrunning a 16K context once image tokens are included. A shared server-side Knowledge Engine retrieves relevant entries from `src/core/knowledge-base.ts`, the full `src/core/rcss-matrix.ts` catalog and relevant heading-level chunks of `docs/*.md`. It prioritizes explicit CSS-property matches and includes a bounded source list in the response. Unsupported and `parses-not-rendered` properties are not left for the model to guess from generic browser knowledge. The panel shows exactly which sources were included for that report.

## Output

The model returns a normalized JSON review containing a rough 0-100 visual similarity estimate, a pass/needs-fixes/fail verdict, matches, and up to 15 normalized issues (the prompt requests at most 8) classified by severity and category. Findings include expected vs observed appearance, a suggested check/fix, and confidence. The score is an AI estimate, not an image-metric measurement or release gate.

The report deliberately distinguishes visual evidence from code context. It must not call an element “invented” if it is present in the source markup (including pseudo-elements), must not suggest filling intentional negative space, and must not claim that interactions work based on static screenshots.

## Local inference and privacy

- Vite endpoint: `POST /local-ai/visual-review`
- Optional bridge endpoint: `POST /visual-review`
- The request is routed to the same configured OpenAI-compatible *local* vision endpoint used for layout analysis.
- Public hosts and HTTPS endpoints are rejected by the local model URL validator; request bodies have size limits and the local app checks loopback origin/rate limits. Bridge mode uses the existing token.
- The UI remembers visual-review model choice separately from the layout-reconstruction model choice. The endpoint, connection mode and bridge token are shared with the existing local AI settings.

## Limitations

1. The reviewer cannot certify native UE/VaCuus fidelity when its right-hand screenshot is only the browser-side RML/RCSS emulation. For final QA, capture the converted screen in UE/PIE or an offscreen VaCuus render at the target resolution.
2. A single comparison screenshot with canvas labels/toolbars can distract the model. Two clean same-resolution images are preferred.
3. Vision models can miss small typography/spacing differences and may produce plausible but wrong recommendations. Confirm findings against the screenshot, converter diagnostics and the target render log.
4. This feature is not fine-tuning. It retrieves grounded project rules and relevant documentation at inference time; it does not update model weights. If the runtime `docs/` directory is unavailable, structured registry retrieval remains active but the response warns that Markdown sections were not loaded.

## Regression tests

Run:

```bash
node --experimental-strip-types --test src/core/tests/visual-review-model-selection.test.ts src/server/tests/visual-review.test.ts src/server/tests/local-model-client.test.ts local-ai-bridge/test.mjs
```

## How to use in the main Preview toolbar

1. Click `AI-проверка`. This modal does not take screenshots automatically: choose either two images (source, then converted) or one side-by-side image with source on the left.
2. Keep the API Base URL at `http://127.0.0.1:1234/v1` if LM Studio is on the same PC and uses its default port.
3. Click `Проверить подключение и найти модель`; the returned model ID is selected from `/v1/models`. If the list contains several models, choose a vision-capable model, preferably the Qwen3.8 model you actually loaded.
4. With the green server status and both screenshot inputs present, click `Запустить AI-проверку`. The report is advisory and does not modify files.
5. The current preview may be browser emulation. For final VaCuus/UE5 verification, provide a screenshot captured from UE/PIE.
