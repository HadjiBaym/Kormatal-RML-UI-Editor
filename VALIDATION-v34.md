# VaCuus UI Converter v34 — Qwen3.8 Native Fast PNG Analysis

Date: 2026-10-18

## Root cause addressed

The reported timeout occurred in **Create UI from Mockup → final PNG analysis**, not the separate AI Visual Review button.

The previous implementation used the OpenAI-compatible `/v1/chat/completions` endpoint and sent `reasoning_effort=low` plus `chat_template_kwargs.enable_thinking=false`. Depending on the compatibility adapter/template, these settings may not actually switch reasoning off. Old `.env.local` values copied from `.env.example` could also keep `LOCAL_VLM_MAX_TOKENS=4096`, `LOCAL_VLM_RETRY_MAX_TOKENS=4096`, `LOCAL_VLM_FINAL_MAX_TOKENS=2048` and `LOCAL_VLM_KNOWLEDGE_CHARS=4200`, so compact code defaults were not effective.

## Changes

- Qwen3.8 is routed through LM Studio Native API when `GET /api/v1/models` is available: `POST /api/v1/chat`.
- Native request explicitly sets `reasoning: "off"`, `context_length: 8192`, `max_output_tokens`, `store: false`, and sends image input as a documented data URL object.
- If native API discovery indicates an older/non-LM-Studio endpoint (404/405/unavailable), the client falls back to OpenAI-compatible `/v1/chat/completions`.
- Qwen3.8 output is hard-capped to 768 / 512 / 384 tokens across the three attempts. This cap is applied in code, so stale environment variables cannot override it.
- For Qwen3.8 the screenshot is resized to a 768 px maximum edge before sending.
- Qwen3.8's layout-analysis knowledge context is capped at 1500 characters regardless of stale environment variables.
- Prompt targets up to 8 major visible regions, preserving empty space and avoiding unnecessary child/decorative elements.
- On successful Native API requests, Layout IR diagnostics include time-to-first-token, tokens/sec, generated token counts and model load time, when LM Studio returns these statistics.
- Updated `.env.example`, README and `docs/local-vlm-qwen38-native-api-v34.md` to remove old large screenshot-analysis budgets.

## Validation performed

- Targeted tests: **103 passed, 0 failed** across local model client, PNG/layout analysis, Knowledge Engine, layout import/generator, visual review and Local AI Bridge.
- Syntax transpilation: **77 TypeScript/TSX/MTS files, 0 syntax errors**.
- RCSS catalog: `node --experimental-strip-types scripts/sync-rcss-matrix.mts --check` — passed, 103 catalog entries in sync.
- Archive integrity checked with `zip -T` after packaging.

## Not verified

- `npm run build` could not execute in this workspace: `vite: not found`; `node_modules` is absent.
- No live inference request against the user's LM Studio/Qwen process was possible from this environment.
- No UE5.8/VaCuus native runtime render was run.

The Native API request schema and reasoning/context options follow the LM Studio REST API documentation: https://lmstudio.ai/docs/developer/rest/chat
