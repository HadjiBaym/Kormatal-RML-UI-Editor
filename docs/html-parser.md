# HTML tokenizer/tree builder in the converter

`src/core/html-parser.ts` is the shared source of truth for markup structure used by both `html-to-rml.ts` and `html-embedded-extractor.ts`.

## Why it exists

HTML tags cannot be safely found with a whole-document regular expression. A tag-like string can appear inside a quoted attribute, an HTML comment, a JavaScript string, or CSS `content`. The parser first tokenizes source into nodes; diagnostics, RML serialization, and embedded resource extraction then operate on those nodes.

## Implemented behavior

- element start/end tags and case-insensitive tag/attribute names;
- double-quoted, single-quoted, and unquoted attribute values;
- HTML comments and doctype;
- raw-text handling for `script` and `style` blocks;
- RCDATA-style handling for `title` and `textarea`;
- self-closing syntax and the standard void-element set;
- common optional end tags for list items, definition terms, options, table rows/cells, headings, and paragraphs;
- source offsets and line/column lookup;
- common stylesheet resource order (`<link rel="stylesheet">` and inline `<style>`) in `html-embedded-extractor.ts`;
- split mode can emit one generated CSS file per inline style block and replace it at its original source position.
- a limited set of common named character references and numeric references; unknown named references in visible text now receive an explicit diagnostic instead of being silently treated as supported.

## Known limitations

This is a deliberately lightweight parser for common game UI markup, **not a complete HTML5 parser**. It does not implement every HTML5 tree-construction insertion mode or error-recovery rule; table repair, foreign SVG/MathML namespaces, and the full named-character-reference table are incomplete. Unsupported named entities remain visible as literal entity text after XML-safe serialization. For arbitrary websites or high-fidelity round-tripping of malformed HTML, use a vetted HTML5 parser such as `parse5` and add the required dependency/lockfile update.

## Test coverage

`src/core/tests/html-parser.test.ts` covers structure and quoted attributes, false-positive tag detection, void and boolean attributes, common omitted list-item end tags, VaCuus bindings, and extraction of real inline `<style>`/`<script>` blocks while ignoring tag-like text inside comments, attributes, CSS and JS. `src/core/tests/source-order-imports.test.ts` additionally verifies a warning for unsupported named HTML entities.

## Validation boundary

Passing these tests proves only the listed structural behaviors. It does not prove visual parity with Chromium or successful loading in Unreal Engine. Those require fixture-based screenshot comparisons and a real VaCuus runtime test.
