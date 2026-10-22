import test from 'node:test';
import assert from 'node:assert/strict';

import { convertCssToRcss } from '../css-to-rcss.ts';
import { convertHtmlToRml } from '../html-to-rml.ts';
import {
  RML_ELEMENTS_REGISTRY,
  RCSS_PROPERTIES_REGISTRY,
  JS_API_REGISTRY,
  CONVERSION_RULES_REGISTRY,
} from '../knowledge-base.ts';

test('Knowledge Base: registries are populated and structured correctly', () => {
  assert.ok(RML_ELEMENTS_REGISTRY.length >= 10, 'RML elements registry should have elements');
  assert.ok(RCSS_PROPERTIES_REGISTRY.length >= 8, 'RCSS properties registry should have properties');
  assert.ok(JS_API_REGISTRY.length >= 6, 'JS API registry should have APIs');
  assert.ok(CONVERSION_RULES_REGISTRY.length >= 7, 'Conversion rules registry should have rules');

  // Verify calc() is registered as unsupported
  const calcEntry = RCSS_PROPERTIES_REGISTRY.find(p => p.property === 'calc()');
  assert.ok(calcEntry, 'calc() must be present in RCSS registry');
  assert.equal(calcEntry?.status, 'unsupported');

  // Verify transition timing is registered
  const transEntry = RCSS_PROPERTIES_REGISTRY.find(p => p.property === 'transition');
  assert.ok(transEntry, 'transition must be present in RCSS registry');
  assert.equal(transEntry?.status, 'convertible');
});

test('CSS to RCSS: detects calc() and emits an explicit renderable fallback', () => {
  const css = `
    .panel {
      width: calc(100% - 24px);
      height: calc(50vh + 10px);
    }
  `;
  const result = convertCssToRcss(css, 'layout.css');

  const responsiveDiags = result.diagnostics.filter(d => d.id.includes('responsive-fallback'));
  assert.equal(responsiveDiags.length, 2, 'Both calc() expressions should be diagnosed');
  assert.ok(responsiveDiags.every(d => d.severity === 'warning' && d.fixed), 'Each expression should have an explicit approximation');
  assert.match(result.rcss, /width:\s*100%/);
  assert.match(result.rcss, /height:\s*100%/);
  assert.ok(!/calc\(/i.test(result.rcss), 'No unsupported calc() expression should leak into RCSS');
});

test('CSS to RCSS: detects var() without fallback value and warns about runtime error', () => {
  const css = `
    .header {
      color: var(--accent-theme);
      background-color: var(--card-bg, #1e293b);
    }
  `;
  const result = convertCssToRcss(css, 'style.css');

  const varDiags = result.diagnostics.filter(d => d.id.includes('var-fallback'));
  assert.equal(varDiags.length, 1, 'Should only flag var without fallback');
  assert.ok(varDiags[0].message.includes('--accent-theme'));
  assert.ok(varDiags[0].message.includes('fallback'));
});

test('HTML to RML: detects invalid data-for alias "t" and flags error', () => {
  const html = `
    <div data-model="InventoryModel">
      <div data-for="t : Items">
        <span>{{t.Name}}</span>
      </div>
    </div>
  `;
  const result = convertHtmlToRml(html, 'screen.html');

  const forDiag = result.diagnostics.find(d => d.id.includes('data-for-alias'));
  assert.ok(forDiag, 'Should flag invalid data-for alias');
  assert.equal(forDiag?.severity, 'error');
  assert.ok(forDiag?.message.includes('cannot equal "t"'));
});
