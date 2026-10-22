/** Select a likely vision-capable model only from exact IDs reported by the local OpenAI-compatible /v1/models endpoint. */
export function choosePreferredVisionModel(models: readonly string[], preferredId = ''): string {
  const available = [...new Set(models.map(value => String(value || '').trim()).filter(Boolean))];
  if (preferredId && available.includes(preferredId)) return preferredId;

  // Qwen3.8 and Qwen3.5 are vision-capable multimodal families; prefer them for this project's local setup.
  const qwen38 = available.find(id => /qwen.*3[._\s-]?8/i.test(id));
  if (qwen38) return qwen38;
  const qwen35 = available.find(id => /qwen.*3[._\s-]?5/i.test(id));
  if (qwen35) return qwen35;
  const qwenVl = available.find(id => /qwen.*(?:3[._\s-]?vl|vision|vl)/i.test(id));
  if (qwenVl) return qwenVl;

  const explicitVision = available.find(id => /(?:vision|visual|multimodal|\bvl\b|llava|pixtral|gemma.*3)/i.test(id));
  if (explicitVision) return explicitVision;

  // IDs can be arbitrary aliases. Do not guess that an unknown model supports image input; the user
  // can select it explicitly in Manual mode after confirming the exact /v1/models ID.
  return '';
}

export function isModelListed(modelId: string, models: readonly string[]): boolean {
  return Boolean(modelId.trim()) && models.includes(modelId.trim());
}
