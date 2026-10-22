import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiKnowledgeContext, clearAiKnowledgeDocumentCacheForTests } from '../ai-knowledge-engine.ts';

test('Knowledge Engine always provides the no-invention contract and strict RML fundamentals', async () => {
  const result = await buildAiKnowledgeContext({ task: 'layout-analysis', query: 'PNG screenshot layout reconstruction', documents: [] });
  assert.match(result.text, /Do not redesign, beautify, add conventional UI elements/);
  assert.match(result.text, /CORE-VACUUS-PACKAGE/);
  assert.match(result.text, /RML is parsed as XML/);
  assert.ok(result.entries.length > 5);
  assert.ok(result.chars <= 4800);
});

test('Knowledge Engine retrieves relevant checked-in documentation and property rules', async () => {
  clearAiKnowledgeDocumentCacheForTests();
  const result = await buildAiKnowledgeContext({
    task: 'visual-review',
    query: 'Review converted screenshot: .card { box-shadow: 0 0 20px; display: grid; background-image: url(mode.png); }',
    maxChars: 6500,
    documents: [
      { path: 'rcss-compatibility.md', content: '# RCSS compatibility\n\n## Box shadows\nIn VaCuus 1.1.0, the target refuses layer capture and emits a warning; the shadow is dropped while normal background and border remain.\n\n## Display grid\nCSS Grid is not implemented. Convert simple layouts to flexbox. Native table display keywords remain available.' },
      { path: 'javascript-runtime.md', content: '# JavaScript runtime\n\n## Event API\nUnrelated model event reference.' },
    ],
  });
  assert.match(result.text, /TARGET-RCSS-box-shadow/);
  assert.match(result.text, /refused at layer capture|normal background and border remain|shadow is dropped/i);
  assert.match(result.text, /TARGET-FACT-box-shadow-refusal/);
  assert.match(result.text, /docs\/rcss-compatibility\.md/);
  assert.ok(result.documentSections >= 1);
  assert.ok(result.sources.some(source => source.includes('rcss-compatibility.md')));
  assert.ok(result.chars <= 6500);
});

test('Knowledge Engine selects layout/image rules for visual reconstruction rather than unrelated runtime notes', async () => {
  const result = await buildAiKnowledgeContext({
    task: 'layout-analysis',
    query: 'Find panels and image regions in PNG screenshot and preserve exact coordinates and empty space',
    maxChars: 4800,
    documents: [
      { path: 'layout-generator.md', content: '# Layout generator\n\n## Screenshot reconstruction\nUse pixel coordinates. Only add visible elements. Do not infer hidden UI, preserve empty space.' },
      { path: 'javascript-runtime.md', content: '# JavaScript runtime\n\n## fetch\nNetwork APIs are forbidden in the embedded JS runtime.' },
    ],
  });
  assert.match(result.text, /pixel coordinates/i);
  assert.match(result.text, /Do not redesign, beautify/);
  assert.ok(result.sources.some(source => source.includes('layout-generator.md')));
  assert.ok(!result.text.includes('Network APIs are forbidden'));
});

test('Knowledge Engine falls back to structured registries if Markdown docs are unavailable', async () => {
  const result = await buildAiKnowledgeContext({ task: 'code-generation', query: '<button> background calc() @font-face' , docsRoot: '/definitely/missing/vacuus-docs' });
  assert.match(result.text, /RML is parsed as XML/);
  assert.match(result.text, /RCSS-display|calc\(\)/);
  assert.equal(result.documentSections, 0);
  assert.ok(result.entries.length > 0);
});


test('Knowledge Engine prefers source diversity so visual-review guidance does not crowd out RCSS documentation', async () => {
  clearAiKnowledgeDocumentCacheForTests();
  const result = await buildAiKnowledgeContext({
    task: 'visual-review',
    query: 'Compare original and converted view. .card { background-image: url(card.png); background-size: cover; background-position: center; box-shadow: 0 0 10px; display: grid; }',
    maxChars: 6500,
    documents: [
      { path: 'visual-review.md', content: `# Visual review\n\n## Purpose\nCompare against the original.\n\n## Limitations\nDo not overstate screenshot fidelity.` },
      { path: 'rcss-compatibility.md', content: `# RCSS Compatibility\n\n## Background images\nLayered backgrounds and background-size may need conversion to a VaCuus decorator.\n\n## Box shadows\nIn VaCuus 1.1.0 the shadow is refused at layer capture and normal background/border remain.` },
      { path: 'conversion-rules.md', content: `# Conversion rules\n\n## Resource paths\nLocal images should be copied and referenced with packaged project paths.` },
    ],
  });
  assert.match(result.text, /docs\/rcss-compatibility\.md/);
  assert.match(result.text, /docs\/conversion-rules\.md/);
  assert.equal(new Set(result.sources.filter(source => source.startsWith('docs/')).map(source => source.split('#')[0])).size, result.documentSections);
});


test('Knowledge Engine uses the supplied VaCuus 1.1.0 UE5.8 matrix as target truth, distinct from input conversion rules', async () => {
  const result = await buildAiKnowledgeContext({
    task: 'visual-review',
    query: '.x { display: table; backdrop-filter: blur(8px); box-shadow: 0 0 8px #000; }',
    maxChars: 7000,
    documents: [],
  });
  assert.match(result.text, /VaCuus 1\.1\.0/);
  assert.match(result.text, /TARGET-RCSS-display/);
  assert.match(result.text, /table-row/);
  assert.match(result.text, /backdrop-filter:blur/);
  assert.match(result.text, /CSS import conversion/i);
  assert.doesNotMatch(result.text, /CSS Grid or table display values are absent/i);
});


test('Knowledge Engine knows the public runtime font API and flags the stale RCSS-matrix sentence', async () => {
  const result = await buildAiKnowledgeContext({
    task: 'code-generation',
    query: 'Register a custom font at runtime with UVaCuusSubsystem LoadFontFace fallback face, and package its font asset.',
    documents: [],
  });
  assert.match(result.text, /TARGET-FACT-public-font-api/);
  assert.match(result.text, /LoadFontFace\(VfsPath, bFallbackFace\)/);
  assert.match(result.text, /VaCuusSubsystem\.h/);
  assert.match(result.text, /stale sentence claiming there is no public C\+\+ font API/i);
});
