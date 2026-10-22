import test from 'node:test';
import assert from 'node:assert/strict';
import { convertProject, DEFAULT_CONVERSION_OPTIONS } from '../project-converter.ts';
import type { ProjectFile } from '../types.ts';

const file = (id: string, path: string, type: ProjectFile['type'], content: string): ProjectFile => ({ id, path, type, content });

test('golden conversion preserves RML envelope and target-specific RCSS transformations', () => {
  const output = convertProject([
    file(
      'html',
      'Content/DevUI/Golden/index.html',
      'html',
      '<!doctype html><html><head><title>Golden Screen</title><link rel="stylesheet" href="screen.css"></head><body><main id="app"><h1>Ready</h1><button class="play">Play</button></main></body></html>',
    ),
    file(
      'css',
      'Content/DevUI/Golden/screen.css',
      'css',
      '.play { display: inline-block; color: #ffffff; background: linear-gradient(90deg, #123456, #abcdef); transition: opacity 200ms ease-in-out; box-shadow: 0 0 8px #000000; }\n#app { display: flex; gap: 8px; }',
    ),
  ], 'Golden', DEFAULT_CONVERSION_OPTIONS);

  assert.equal(output.rml, `<rml>
  <head>
    <title>Golden Screen</title>
    <!-- VaCuus base reset stylesheet must be linked before screen styles -->
    <link type="text/rcss" href="vacuus-base.rcss"/>
    <link type="text/rcss" href="golden.rcss"/>
    <script src="golden.js"></script>
  </head>
  <body>
    <main id="app"><h1>Ready</h1><button class="play">Play</button></main>
  </body>
</rml>`);

  assert.equal(output.rcss, `.play { display: inline-block; color: #ffffff; decorator: linear-gradient(90deg, #123456, #abcdef); transition: opacity 200ms cubic-in-out; /*  VaCuus unsupported visual effect: box-shadow: 0 0 8px #000000  */ }\n#app { display: flex; gap: 8px; }`);
  assert.ok(output.diagnostics.some(issue => issue.message.includes('box-shadow') && issue.severity === 'warning'));
  assert.ok(output.diagnostics.some(issue => issue.message.includes('timing-function')));
});
