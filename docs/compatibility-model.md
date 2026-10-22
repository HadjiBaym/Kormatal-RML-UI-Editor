# VaCuus & RmlUi Compatibility Architecture Model

This document outlines the architectural data model and compilation pipeline for transforming modern web assets into the Unreal Engine 5 VaCuus / RmlUi runtime environment.

---

## 1. Architectural Principles

1. **Static Analysis & Single Source of Truth**:
   All conversion rules, diagnostics, syntax catalogs, and auto-fixes are defined in a typed knowledge base (`src/core/knowledge-base.ts`). No rule exists solely as a string literal inside UI components.

2. **Strict Verification Hierarchy**:
   Every diagnostic issue contains:
   - Severity level (`error`, `warning`, `manual-fix`, `info`, `unverified`).
   - Category (`html`, `css`, `js`, `asset`, `ue5`).
   - Line and column coordinates.
   - Original code snippet.
   - Technical reason for limitation grounded in RmlUi/VaCuus.
   - Impact on Unreal Engine viewport rendering or packaging.
   - Reversible auto-fix action where deterministic replacement is possible.
   - Reference documentation anchor (`docs/gotchas#...`).

3. **Multi-Stage Processing Pipeline**:

```text
[Input Sources] -> [Resolver & File Tree] 
                -> [HTML Parser / XML Normalizer] -> [RML Document (<rml>)]
                -> [CSS AST / Property Catalog]   -> [RCSS Document (.rcss)]
                -> [JS AST / Web API Detector]    -> [VaCuus Compatible Script (.js)]
                -> [UE5 Bridge & Base Resets]     -> [vacuus-base.rcss + C++ Snippets]
                -> [Packaging Engine]             -> [Content/DevUI ZIP Bundle]
```

4. **Runtime Reality vs Browser Simulation**:
   The compiler explicitly communicates three distinct execution domains:
   - **Browser Preview**: Standard Chromium DOM & CSS renderer.
   - **Converted Preview**: Emulates RmlUi specific quirks (suppresses `box-shadow`, enforces `vacuus-base.rcss` box model, rejects non-standard timing functions).
   - **UE5 Native Runtime**: Real in-engine rendering via `UVaCuusView`.
