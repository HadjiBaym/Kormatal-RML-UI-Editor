figma.showUI(__html__, { width: 420, height: 420, themeColors: true });

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function paintForExport(paint) {
  if (!paint || typeof paint !== 'object') return undefined;
  const result = { type: String(paint.type || 'SOLID'), visible: paint.visible !== false, opacity: safeNumber(paint.opacity, 1) };
  if (paint.color && typeof paint.color === 'object') {
    result.color = {
      r: safeNumber(paint.color.r),
      g: safeNumber(paint.color.g),
      b: safeNumber(paint.color.b),
      a: safeNumber(paint.color.a, 1),
    };
  }
  if (Array.isArray(paint.gradientStops)) result.gradientStops = paint.gradientStops.map(stop => ({ position: safeNumber(stop.position), color: { r: safeNumber(stop.color?.r), g: safeNumber(stop.color?.g), b: safeNumber(stop.color?.b), a: safeNumber(stop.color?.a, 1) } }));
  if (Array.isArray(paint.gradientTransform)) result.gradientTransform = paint.gradientTransform.map(row => Array.isArray(row) ? row.map(value => safeNumber(value)) : []);
  if (paint.imageHash) result.imageHash = String(paint.imageHash);
  if (paint.scaleMode) result.scaleMode = String(paint.scaleMode);
  if (paint.blendMode) result.blendMode = String(paint.blendMode);
  return result;
}

function numberOrMixed(value, fallback = 0) {
  return value === figma.mixed ? fallback : safeNumber(value, fallback);
}

function hasProperty(value, key) {
  return Boolean(value && typeof value === 'object' && key in value);
}

function valueOrFallback(node, key, fallback) {
  if (!hasProperty(node, key)) return fallback;
  const value = node[key];
  return value === figma.mixed || value === undefined || value === null ? fallback : value;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function shouldExportAsRasterAsset(node) {
  if (!['RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR', 'LINE'].includes(String(node?.type || ''))) return false;
  if (['VECTOR', 'POLYGON', 'STAR'].includes(node.type)) return true;
  const nonSolidPaint = hasProperty(node, 'fills') && Array.isArray(node.fills)
    && node.fills.some(paint => paint?.visible !== false && paint?.type !== 'SOLID');
  const rasterEffect = hasProperty(node, 'effects') && Array.isArray(node.effects)
    && node.effects.some(effect => effect?.visible !== false && effect?.type !== 'BACKGROUND_BLUR');
  return nonSolidPaint || rasterEffect;
}

async function exportRasterAsset(node) {
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
  return { mimeType: 'image/png', contentBase64: bytesToBase64(bytes) };
}

function textStyleFor(node) {
  if (node.type !== 'TEXT') return undefined;
  const fontName = node.fontName && node.fontName !== figma.mixed ? node.fontName : null;
  const fontSize = numberOrMixed(node.fontSize, 16);
  const styleName = String(fontName?.style || '').toLowerCase();
  let fontWeight = 400;
  if (styleName.includes('thin')) fontWeight = 100;
  else if (styleName.includes('extra light') || styleName.includes('extralight')) fontWeight = 200;
  else if (styleName.includes('light')) fontWeight = 300;
  else if (styleName.includes('medium')) fontWeight = 500;
  else if (styleName.includes('semi') || styleName.includes('demi')) fontWeight = 600;
  else if (styleName.includes('extra bold') || styleName.includes('extrabold')) fontWeight = 800;
  else if (styleName.includes('black') || styleName.includes('heavy')) fontWeight = 900;
  else if (styleName.includes('bold')) fontWeight = 700;
  return {
    fontFamily: String(fontName?.family || 'Onest'),
    fontSize,
    fontWeight,
    textAlignHorizontal: String(node.textAlignHorizontal || 'LEFT'),
    textAlignVertical: String(node.textAlignVertical || 'TOP'),
    letterSpacing: node.letterSpacing === figma.mixed ? undefined : node.letterSpacing,
    lineHeight: node.lineHeight === figma.mixed ? undefined : node.lineHeight,
    textCase: String(node.textCase || 'ORIGINAL'),
    textDecoration: String(node.textDecoration || 'NONE'),
  };
}

async function serializeNode(node, depth = 0, budget = { count: 0 }) {
  budget.count++;
  if (depth > 80 || budget.count > 12000) return null;
  const bounds = hasProperty(node, 'absoluteBoundingBox') ? node.absoluteBoundingBox : undefined;
  const out = {
    id: String(node.id || `${node.type}-${budget.count}`),
    name: String(node.name || node.type || 'Layer'),
    type: String(node.type || 'UNKNOWN'),
    visible: node.visible !== false,
    rotation: safeNumber(node.rotation),
    width: safeNumber(node.width),
    height: safeNumber(node.height),
    absoluteBoundingBox: bounds ? { x: safeNumber(bounds.x), y: safeNumber(bounds.y), width: safeNumber(bounds.width), height: safeNumber(bounds.height) } : undefined,
    // Keep both absolute and parent-relative positions so downstream tools can either
    // preserve pixel geometry or rebuild Auto Layout in local container coordinates.
    position: bounds ? { x: safeNumber(bounds.x), y: safeNumber(bounds.y) } : { x: safeNumber(node.x), y: safeNumber(node.y) },
    relativePosition: { x: safeNumber(node.x), y: safeNumber(node.y) },
    style: textStyleFor(node),
  };
  // Figma node types expose different mixins. Guard every optional surface with `in`:
  // direct reads such as GROUP.fills or SLICE.opacity can throw in the plugin runtime.
  if (hasProperty(node, 'opacity')) out.opacity = safeNumber(node.opacity, 1);
  if (hasProperty(node, 'fills') && Array.isArray(node.fills)) out.fills = node.fills.map(paintForExport).filter(Boolean);
  if (hasProperty(node, 'strokes') && Array.isArray(node.strokes)) out.strokes = node.strokes.map(paintForExport).filter(Boolean);
  if (hasProperty(node, 'strokeWeight')) out.strokeWeight = numberOrMixed(node.strokeWeight, 0);
  if (hasProperty(node, 'cornerRadius')) out.cornerRadius = numberOrMixed(node.cornerRadius, 0);
  if (hasProperty(node, 'clipsContent')) out.clipsContent = node.clipsContent === true;
  if (hasProperty(node, 'layoutMode')) Object.assign(out, {
    layoutMode: String(valueOrFallback(node, 'layoutMode', 'NONE')),
    itemSpacing: safeNumber(valueOrFallback(node, 'itemSpacing', 0)),
    paddingTop: safeNumber(valueOrFallback(node, 'paddingTop', 0)),
    paddingRight: safeNumber(valueOrFallback(node, 'paddingRight', 0)),
    paddingBottom: safeNumber(valueOrFallback(node, 'paddingBottom', 0)),
    paddingLeft: safeNumber(valueOrFallback(node, 'paddingLeft', 0)),
    primaryAxisAlignItems: String(valueOrFallback(node, 'primaryAxisAlignItems', 'MIN')),
    counterAxisAlignItems: String(valueOrFallback(node, 'counterAxisAlignItems', 'MIN')),
    layoutWrap: String(valueOrFallback(node, 'layoutWrap', 'NO_WRAP')),
  });
  if (hasProperty(node, 'layoutPositioning')) out.layoutPositioning = String(valueOrFallback(node, 'layoutPositioning', 'AUTO'));
  if (hasProperty(node, 'layoutGrow')) out.layoutGrow = safeNumber(node.layoutGrow);
  if (hasProperty(node, 'layoutSizingHorizontal')) out.layoutSizingHorizontal = String(valueOrFallback(node, 'layoutSizingHorizontal', 'FIXED'));
  if (hasProperty(node, 'layoutSizingVertical')) out.layoutSizingVertical = String(valueOrFallback(node, 'layoutSizingVertical', 'FIXED'));
  if (node.type === 'TEXT') out.characters = String(node.characters || '');
  if (hasProperty(node, 'effects') && Array.isArray(node.effects)) out.effects = node.effects.filter(effect => effect && typeof effect === 'object').map(effect => {
    const exported = { type: String(effect.type || ''), visible: effect.visible !== false };
    if (hasProperty(effect, 'radius')) exported.radius = safeNumber(effect.radius);
    if (hasProperty(effect, 'spread')) exported.spread = safeNumber(effect.spread);
    if (hasProperty(effect, 'offset')) exported.offset = { x: safeNumber(effect.offset?.x), y: safeNumber(effect.offset?.y) };
    if (hasProperty(effect, 'color')) exported.color = { r: safeNumber(effect.color?.r), g: safeNumber(effect.color?.g), b: safeNumber(effect.color?.b), a: safeNumber(effect.color?.a, 1) };
    return exported;
  });
  if (shouldExportAsRasterAsset(node)) {
    try { out.embeddedAsset = await exportRasterAsset(node); budget.assetCount = (budget.assetCount || 0) + 1; }
    catch (error) { out.assetExportError = error instanceof Error ? error.message : 'Не удалось экспортировать слой в PNG.'; }
  }
  if ('children' in node && Array.isArray(node.children)) {
    out.children = (await Promise.all(node.children.map(child => serializeNode(child, depth + 1, budget)))).filter(Boolean);
  } else out.children = [];
  return out;
}

figma.ui.onmessage = async (message) => {
  if (message?.type === 'EXPORT_SELECTED') {
    const selection = figma.currentPage.selection;
    if (!selection.length) {
      figma.ui.postMessage({ type: 'ERROR', message: 'Сначала выберите один или несколько Frame/Component в Figma.' });
      return;
    }
    const invalid = selection.filter(node => !['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type));
    if (invalid.length) {
      figma.ui.postMessage({ type: 'ERROR', message: 'Выделите целые Frame/Component. Для сохранения иерархии не выбирайте отдельные дочерние слои.' });
      return;
    }
    const budget = { count: 0, assetCount: 0, referenceImageCount: 0 };
    const frames = (await Promise.all(selection.map(async (node) => {
      const serialized = await serializeNode(node, 0, budget);
      if (!serialized) return null;
      try {
        const bytes = await node.exportAsync({ format: 'PNG' });
        serialized.referenceImage = { mimeType: 'image/png', contentBase64: bytesToBase64(bytes) };
        budget.referenceImageCount++;
      } catch (error) {
        serialized.referenceImageExportError = error instanceof Error ? error.message : 'Не удалось экспортировать PNG-эталон.';
      }
      return serialized;
    }))).filter(Boolean);
    const payload = { schema: 'kormatal-figma-layout-v1', document: { id: 'document', name: figma.currentPage.name, type: 'DOCUMENT', children: [{ id: 'canvas', name: figma.currentPage.name, type: 'CANVAS', children: frames }] } };
    const filename = `figma-layout-${figma.currentPage.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export'}.json`;
    const json = JSON.stringify(payload, null, 2);
    const byteLength = new TextEncoder().encode(json).byteLength;
    if (byteLength > 10 * 1024 * 1024) {
      figma.ui.postMessage({ type: 'ERROR', message: `Экспорт получился ${(byteLength / (1024 * 1024)).toFixed(1)} МБ. Импортёр принимает до 12 МБ; экспортируйте один Frame или уменьшите число сложных слоёв.` });
      return;
    }
    figma.ui.postMessage({ type: 'EXPORT_READY', filename, json, frames: frames.length, nodes: budget.count, assets: budget.assetCount, referenceImages: budget.referenceImageCount, bytes: byteLength });
  }
  if (message?.type === 'CLOSE') figma.closePlugin();
};
