# Qwen3.8-27B PNG-analysis responsiveness (v29)

## Background and known limitation

The previous local vision client cancelled inference after 180 seconds by default. v28 raised this to 600 seconds, but an actual timeout at 600 seconds means inference still did not finish before the deadline. On a laptop GPU with 8 GB VRAM and Q4_K_M 27B weights, partial CPU offload, vision prefill, excessive reasoning or memory pressure can all contribute. The timeout does not by itself identify one definitive cause.

## v28 changes (retained)

- Default inference timeout is 600 seconds, with environment override `LOCAL_VLM_TIMEOUT_MS` and per-run timeout input in the layout generator (60–900 seconds).
- The user-selected timeout is validated on the server and passed through the local bridge when that connection mode is selected.
- Visual review uses `LOCAL_VLM_VISUAL_REVIEW_TIMEOUT_MS` or falls back to `LOCAL_VLM_TIMEOUT_MS`, then 600 seconds.
- In v28, layout detector token budgets default to 4096 / 4096 / 2048; v29 reduces them to 1536 / 1024 / 512 for Qwen geometry extraction.
- Timeout errors now name the endpoint and elapsed limit, and do not misleadingly prescribe firewall changes as the primary remedy. Connection failures still include the underlying cause.

## Diagnostic sequence

1. Confirm LM Studio Server is running and that the configured model is loaded.
2. Open `http://127.0.0.1:1234/v1/models` on the same PC; verify the Qwen model ID exactly matches the ID used by the app.
3. In the UI, set timeout to 600 seconds and run PNG analysis once. Avoid sending several requests in parallel.
4. Watch LM Studio server logs and GPU/RAM usage during inference. If generation is still excessively slow, reduce Reasoning Effort to `low`/`medium`, keep context around 16K or lower, and ensure the image is no larger than the converter's resized 1024 px edge.
5. If `/v1/models` itself fails, debug server address/port first; if it succeeds but inference times out, the port is reachable and attention should shift to model loading, inference speed, model ID, memory pressure, and timeout.

The app cannot verify native Unreal Engine/VaCuus rendering merely from a successful LM Studio API response.


## v29 changes — Qwen3.8 reasoning and response-budget fix

- Qwen3.8 requests now pass `reasoning_effort: low` and `chat_template_kwargs: { enable_thinking: false, preserve_thinking: false }`. The client no longer relies on `/no_think` for Qwen3.8; that text hint remains for older Qwen model IDs.
- PNG analysis defaults to a smaller knowledge context and short structured outputs (16 elements / 1536 tokens, then 8 / 1024, then 4 / 512).
- If the server rejects the Qwen3.8 template controls, the error now instructs the user to update LM Studio/runtime or set model controls manually rather than waiting for another full timeout.
- A new regression test verifies the actual request body includes the Qwen3.8-specific settings.
- If timeout persists after the request contains these fields, check LM Studio Server Logs, RAM commit/pagefile activity and token speed. A 27B Q4 model needs substantial system RAM when only 8 GB VRAM is available; a timeout that persists with thinking disabled is more likely an inference/memory/runtime bottleneck than a prompt wording issue.
