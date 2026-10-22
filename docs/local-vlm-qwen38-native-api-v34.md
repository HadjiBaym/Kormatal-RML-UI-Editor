# Qwen3.8 PNG layout analysis — v34 fast path

## Why the previous 600-second timeout could persist

The previous PNG path called `/v1/chat/completions` and supplied `reasoning_effort=low` plus `chat_template_kwargs.enable_thinking=false`. Depending on the local model wrapper/template, OpenAI-compatible adapters may not apply these settings as intended. In addition, older `.env.local` files copied from `.env.example` could still set 4096 output tokens and a 4200-character knowledge context, overriding the smaller defaults in application code.

## v34 behavior

- For model IDs matching `Qwen3.8`, the client probes `GET /api/v1/models`. If LM Studio's native v1 API is available, it calls `POST /api/v1/chat`.
- The native request explicitly sets `reasoning: "off"`, `context_length: 8192`, `store: false`, and a capped `max_output_tokens` (768 / 512 / 384 across recovery attempts).
- If the native API returns 404/405, the client falls back to the OpenAI-compatible `/v1/chat/completions` endpoint. That fallback also hard-caps Qwen3.8 outputs to 768 tokens per attempt and still supplies compatible template settings.
- The screenshot is downscaled to a maximum 768 px longest edge for Qwen3.8. SVG/Figma JSON remain the authoritative geometry source when available; PNG detection supplies visual region observations.
- Knowledge context for this image-only geometry step is capped to 1500 characters even if a stale `.env.local` requests 4200 characters.
- The native API response's available statistics (time to first token, tokens/sec, output and reasoning token counts, model-load time) are attached to the Layout IR diagnostics.
- `.env.example` now recommends 768 / 512 / 384 output tokens and 700 knowledge characters. Qwen3.8 caps are enforced in code regardless of old environment overrides.

## LM Studio API fields

LM Studio native REST API `POST /api/v1/chat` documents image input as `{ type: "image", data_url: "data:image/...;base64,..." }`, `reasoning: "off" | "low" | ...`, `context_length`, `max_output_tokens`, and performance stats including `time_to_first_token_seconds` and `tokens_per_second`.

Official documentation: https://lmstudio.ai/docs/developer/rest/chat

## Validation boundaries

The client and layout tests use mocked API responses. They verify request routing, native API payload, output-token caps, response parsing, statistics diagnostics, fallback behavior and environment override clamps. A live call to the user's Qwen weights is still required to establish actual inference speed on the target laptop.
