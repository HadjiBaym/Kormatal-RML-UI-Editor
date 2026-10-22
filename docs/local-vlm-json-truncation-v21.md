# Local VLM truncation resilience (v21)

## Why the previous flow failed

Small local vision models may spend a large part of their output budget on reasoning or return too many layout objects. The model then stops before the outer Layout JSON is closed, so a strict parser rejected the entire result even when several complete elements were already present.

## Changes

- Three attempts: a compact 24-element prompt, a 12-element prompt, and a 6-element fallback containing only large regions.
- Use the portable `response_format: { type: "text" }` for image-analysis requests rather than depending on JSON Schema support for this flow.
- Default output budgets: 8192 tokens for the first two attempts and 4096 for the final compact attempt. `LOCAL_VLM_MAX_TOKENS`, `LOCAL_VLM_RETRY_MAX_TOKENS`, and `LOCAL_VLM_FINAL_MAX_TOKENS` can override these values.
- Qwen model requests append `/no_think`; the response reader can also fall back to `reasoning_content` or `analysis` when `message.content` contains only a closed `<think>` block.
- Before upload to the local model, the browser creates a temporary PNG proxy whose longest edge is at most 1024 px. The original reference remains untouched. The returned x/y/width/height, radius, font size and layout spacing are scaled back to the source canvas.
- When a response is truncated, the parser salvages only fully formed element objects whose geometry is valid. The UI receives a visible partial-result note rather than losing all work. If no complete element exists, the error now recommends disabling Qwen thinking mode where supported and increasing LM Studio context length.

## Validation

- Targeted Node tests cover partial JSON recovery, three-stage retries, empty results, Qwen `/no_think`, `reasoning_content`, local network safety and layout conversion.
- Frontend TypeScript/TSX syntax was checked separately.
- Vite build and live inference against a user's LM Studio server were not run in this environment.
