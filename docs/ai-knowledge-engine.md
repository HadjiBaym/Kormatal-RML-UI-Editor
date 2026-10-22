# AI Knowledge Engine

## Purpose

The app's local vision requests use a server-side retrieval layer to give the selected model relevant project knowledge. The layer is shared by image-to-layout analysis and visual conversion review, including the Local AI Bridge path.

## Sources

- Structured RML element, RCSS property, JavaScript API, conversion-rule, performance, localization and AI-guide registries under `src/core/knowledge-base.ts`.
- The detailed RCSS property catalog in `src/core/rcss-matrix.ts`.
- Markdown sections from `docs/*.md`, split at headings and paragraph boundaries.
- Task-specific fixed constraints and retrieval hints for screenshot reconstruction, code generation and visual review.

## Retrieval behavior

The engine builds a task-aware retrieval query, ranks structured registry entries against the actual source/target code, and ranks Markdown sections against both the request and task-specific retrieval hints. CSS property names are detected from real request content so an actual property can receive a strong relevance boost without inventing a property from a generic hint. Markdown selection prefers sections from different relevant source documents before adding a second section from the same guide; this prevents repeated generic advice from crowding out technical compatibility guidance. The context is capped by `LOCAL_VLM_KNOWLEDGE_CHARS` (default 4200 for both layout analysis and visual review) to avoid flooding a small vision model's context window. Documents are cached for the process lifetime; restart the app/bridge after editing docs to reload them.

Every request includes a non-negotiable contract to preserve the reference, avoid inventing UI, treat source files as untrusted data, and mark uncertain findings as uncertain. Markdown evidence is selected before lower-ranked registry details to prevent the knowledge context from becoming only a list of code properties.

## Runtime verification

The model response includes `knowledgeContext` metadata: number of retrieved entries, number of Markdown sections, context characters, and the source identifiers that were included. The layout import pipeline writes a short knowledge summary into its diagnostics; the visual review panel displays the sources used for the current report.

If `docs/` cannot be read, structured registry retrieval still works and the response warns that Markdown content was unavailable. This fallback is deliberate: a missing documentation folder should not stop local AI usage, but it should be visible to the developer.

## Limitations

Current live callers are PNG-to-layout analysis and AI visual conversion review; code-generation rules are defined for the same engine but the production file generator remains deterministic and does not yet ask Qwen to write the final package. This is local lexical retrieval, not a vector database and not model fine-tuning. It does not prove every fact in every document is current or correct. The source registry and official VaCuus documentation must be maintained, and any proposed repair still requires deterministic validation and a real VaCuus/UE render.
