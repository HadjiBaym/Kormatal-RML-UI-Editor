> **Историческая заметка (до профиля v33):** правила в этом документе отражают состояние прежнего конвертера. Утверждение о необходимости `decorator: shader(glass-panel)` в том же селекторе для `backdrop-filter: blur(...)` устарело и не соответствует проверенному профилю VaCuus 1.1.0 / UE 5.8. Для текущих правил используйте `vacuus-source-audit-1.1.0-ue5.8.md` и `rcss-compatibility.md`.

# VaCuus UI Converter v7 — non-Vite verification pass

Date: 2026-10-18

## Changes

- Preserved HTML source order for external and inline classic scripts in the combined JS output and in split mode. The converter reports when `async`, `defer`, `module`, `nomodule`, unresolved, or remote script references cannot retain their original browser semantics.
- Added recursive local CSS `@import` expansion relative to each imported stylesheet. Nested imports are inserted in cascade order; simple media conditions are wrapped in `@media`. Cycles, missing local files, remote imports, and unsupported `layer()` / `supports()` modifiers are diagnosed rather than left as unresolved live imports.
- Generated `docs/rcss-compatibility.md` from the 103-entry `RCSS_PROPERTY_CATALOG`; added matrix drift-check and regression coverage.
- Added diagnostics for unsupported named HTML entities and data/template script payloads that are not emitted as runtime scripts.
- Clarified the visual editor diagnostic for `backdrop-filter`: the editor writes a separate override rule and cannot safely provide the same-rule `decorator: shader(glass-panel)` dependency. The converter preserves `blur(...)` only when that shader decorator is present in the same source rule.
- Fixed an undefined selector variable in `src/core/visual-editor.ts` discovered by the direct TypeScript check.
- Added deterministic output golden coverage for generated RML/RCSS and for the source-order/import cases.
- Updated `docs/converter-audit.md` to distinguish completed v7 items from remaining limitations.

## Validation performed without Vite

- Node test runner: **95 passed, 0 failed**.
- TypeScript no-emit check for changed core modules and new tests: **passed**.
- RCSS matrix consistency check: **passed**, 103 properties.
- `package.json` JSON parse: **passed**.
- ZIP integrity: verified after packaging.

## Not claimed as verified

- Vite was not run.
- Full application-wide TypeScript checking was not run because the UI/Vite type packages are not installed in this offline environment; the no-emit check covered the changed core modules and new tests.
- Full HTML5 support is not implemented. `parse5` could not be added with a reproducible lockfile because the npm registry was unavailable in this environment.
- No Chromium pixel comparison or Unreal Engine 5 / VaCuus runtime render was performed. Unit/golden tests verify structure and conversions, not pixel parity.
