# RML Design Editor v6 — Safe Auto-Fix

## Why Fix All was dangerous

The old `handleApplyAllFixes` used global regular-expression replacements across every file, irrespective of which diagnostics were present. This included converting every `display: grid` to a flex column, removing grid track declarations, replacing all shadows with borders, changing valid browser CSS timing keywords to RmlUi-specific values in the source stylesheet, rewriting font paths without resource context, and replacing `localStorage.getItem()` with `null`. It also renamed `data-for="t : ..."` without renaming the corresponding data bindings.

These operations altered source files instead of limiting compatibility transforms to generated RML/RCSS/JS and could destroy the browser preview or runtime behavior.

## New behavior

- Header `Fix All` count now means **safe source fixes available**, not the number of transformations that the conversion pipeline has already applied.
- The Diagnostics panel only exposes a source-level auto-fix button for `html-data-for-alias-*`.
- The reserved `t` iterator is renamed within its exact loop element, and supported `{{t.Property}}` template bindings in that same loop are renamed with it.
- If `t.` is referenced by arbitrary inline script or if the element boundary cannot be determined, the fix is skipped and the user is told that manual review is needed.
- Batch and single fix actions no longer perform global CSS or JS replacements. CSS compatibility transformations stay in the output conversion pipeline; source CSS/JS remain intact.
- Source auto-fixes are added to the existing undo history.
- Diagnostics not safe for source rewriting are labelled `Fixed in Output` when the converter already generated a fallback, or `Review Manually` when the source requires a human decision.

## Regression coverage

`src/core/tests/safe-auto-fix.test.ts` tests scope-aware loop alias renaming, preservation of unrelated aliases, CSS/JS source preservation, conservative skipping of arbitrary JavaScript references, and the safe-fix whitelist.
