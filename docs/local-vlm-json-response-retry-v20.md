# Local VLM JSON response robustness (v20)

## What changed

- The response parser strips Qwen `<think>` blocks and Markdown fences, searches for a complete layout object, and tolerates trailing commas outside quoted strings.
- A response is only accepted when it is an object with numeric `width`/`height` and an `elements` array.
- If the first analysis is malformed or truncated, the image is sent once more with a concise output contract, a 35-element limit, `response_format: { type: "text" }`, and a 4096-token output limit.
- The original screenshot is never overwritten when either response fails validation.
- When both attempts fail and the model reports `finish_reason=length`, the UI error tells the user that generation was truncated by the token limit.

## Verification

- Added tests for fenced JSON, `<think>` output, preambles, trailing commas, unrelated JSON objects, retry with compact prompt, and truncation errors.
- These tests use mocked OpenAI-compatible responses. They do not claim that a specific LM Studio server was live-tested.
- Vite build is intentionally not run.
