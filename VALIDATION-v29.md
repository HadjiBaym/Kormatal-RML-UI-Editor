# VaCuus UI Converter v29 — Qwen3.8 fast PNG analysis

Date: 2026-10-18

## Changes

- Detects Qwen3.8 model IDs in the local OpenAI-compatible vision client.
- Sends `reasoning_effort: "low"` and `chat_template_kwargs: { enable_thinking: false, preserve_thinking: false }` for Qwen3.8, rather than depending on a `/no_think` suffix in user text.
- Uses a lower sampling temperature for the bounded layout-detection task.
- Compact layout analysis: up to 16 elements / 1536 output tokens, then 8 / 1024, then 4 / 512. Existing environment overrides remain available.
- Lowers the retrieved knowledge context for the PNG layout-detection task to reduce input prefill work.
- Improves error messaging if the LM Studio/runtime rejects the Qwen template controls or if the request times out.
- Adds regression tests for the actual outgoing API payload and unsupported-parameter diagnostics.

## Verification performed

- Focused local AI, layout-analysis, Knowledge Engine, visual review, packaging and bridge tests: **43 passed, 0 failed**.
- TypeScript/TSX/MTS syntax transpilation: **71 files checked, 0 syntax diagnostics**.
- RCSS matrix synchronization: **passed, 103 catalog properties**.
- ZIP archive integrity: checked after packaging.

## Not verified

- Full Vite production build and full project type-check: not run because npm dependencies are not installed in this build environment.
- Actual inference against the user's live LM Studio/Qwen instance: not run here.
- Native Unreal Engine 5 / VaCuus rendering: not run here.

## Suggested initial user configuration

- LM Studio model ID: copy the exact ID returned by `GET http://127.0.0.1:1234/v1/models`.
- Context length: 8K–16K.
- Evaluation batch size: 128–256.
- Thinking off and reasoning effort low in LM Studio if the runtime does not accept request-level template options.
- Run one inference at a time and inspect LM Studio server logs, token generation speed, RAM, VRAM and pagefile activity.

This release reduces common avoidable work but cannot guarantee fast inference on an 8 GB VRAM laptop with a 27B Q4 model; remaining delays may be caused by CPU offload, memory pressure, runtime compatibility or image preprocessing.
