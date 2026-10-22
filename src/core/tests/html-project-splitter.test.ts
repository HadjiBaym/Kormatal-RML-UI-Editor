import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMonolithicHtmlProject } from '../html-project-splitter.ts';

test('lightweight HTML importer splits inline CSS and JS without loading the full converter', () => {
  const files = splitMonolithicHtmlProject('<html><head><style>.panel{color:red}</style></head><body><button id="go">Go</button><script>document.getElementById("go").textContent="Ready"</script></body></html>', 'index.html');
  assert.equal(files.length, 3);
  assert.equal(files[0].type, 'html');
  assert.match(files[0].content, /href="style\.css"/);
  assert.match(files[0].content, /src="script\.js"/);
  assert.match(files[1].content, /\.panel\{color:red\}/);
  assert.match(files[2].content, /textContent="Ready"/);
});

test('importer keeps source HTML when there are no inline assets', () => {
  const html = '<html><head><link rel="stylesheet" href="ui.css"></head><body><main>UI</main><script src="ui.js"></script></body></html>';
  const files = splitMonolithicHtmlProject(html, 'index.html');
  assert.equal(files.length, 1);
  assert.equal(files[0].content, html);
});
