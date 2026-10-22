import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePreferredVisionModel, isModelListed } from '../visual-review-model-selection.ts';

test('model discovery prefers exact already selected model when it is still available', () => {
  assert.equal(choosePreferredVisionModel(['qwen/qwen3.8-27b', 'qwen3-vl-2b'], 'qwen3-vl-2b'), 'qwen3-vl-2b');
});

test('model discovery prefers Qwen3.8 for this multimodal review workflow', () => {
  assert.equal(choosePreferredVisionModel(['qwen3-vl-2b', 'qwen/qwen3.8-27b', 'text-model']), 'qwen/qwen3.8-27b');
});

test('model discovery prefers explicit vision IDs over an unrelated text model', () => {
  assert.equal(choosePreferredVisionModel(['text-model-a', 'qwen3-vl-8b-instruct']), 'qwen3-vl-8b-instruct');
  assert.equal(choosePreferredVisionModel(['text-model-a', 'llava-next']), 'llava-next');
});

test('model discovery avoids guessing between multiple unknown text models', () => {
  assert.equal(choosePreferredVisionModel(['text-model-a', 'text-model-b']), '');
  assert.equal(choosePreferredVisionModel(['custom-only-model']), '');
});

test('selected model is accepted only when exact ID appears in server list', () => {
  assert.equal(isModelListed('qwen/qwen3.8-27b', ['qwen/qwen3.8-27b']), true);
  assert.equal(isModelListed('Qwen3.8-27B', ['qwen/qwen3.8-27b']), false);
});
