import type { ProjectFile } from './types.ts';

export type LayoutImportKind = 'svg' | 'figma' | 'image';

export interface LayoutImportPlan {
  kind: LayoutImportKind;
  name: string;
  /** Raw text for SVG/JSON; data URL for bitmap-only imports. */
  content: string;
  primaryFile: ProjectFile;
  companionSvg?: { name: string; content: string };
  companionPng?: { name: string; dataUrl: string };
  /** Other selected inputs that the host may preserve in the project tree. */
  supplementalFiles: ProjectFile[];
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

function fileStem(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '') || 'GeneratedLayout';
}

export function getRasterSourceDataUrl(file: ProjectFile): string | null {
  if (file.contentEncoding !== 'base64' || !file.content) return null;
  const ext = /\.([^.]+)$/.exec(file.path)?.[1]?.toLowerCase() || '';
  const extMime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  const declaredMime = (file.mimeType || '').toLowerCase().split(';')[0].trim();
  const mimeType = IMAGE_MIME_TYPES.has(declaredMime) ? declaredMime : extMime[ext];
  if (!mimeType || !IMAGE_MIME_TYPES.has(mimeType)) return null;
  // ProjectFile stores binary sources as plain base64 without a data-URL prefix.
  const base64 = file.content.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) return null;
  return `data:${mimeType};base64,${base64}`;
}

function isTextFile(file: ProjectFile): boolean {
  return file.contentEncoding !== 'base64' && typeof file.content === 'string';
}

function svgContent(file: ProjectFile): { name: string; content: string } | null {
  if (!isTextFile(file) || !/\.svg$/i.test(file.path)) return null;
  return { name: basename(file.path), content: file.content };
}

function jsonContent(file: ProjectFile): boolean {
  return isTextFile(file) && /\.json$/i.test(file.path);
}

function imageContent(file: ProjectFile): { name: string; dataUrl: string } | null {
  const dataUrl = getRasterSourceDataUrl(file);
  return dataUrl ? { name: basename(file.path), dataUrl } : null;
}

/**
 * Routes a single design file or a small source bundle into the Layout Generator.
 * HTML/CSS/JS source projects deliberately stay on the normal project-conversion path.
 */
export function planLayoutImport(files: ProjectFile[]): LayoutImportPlan | null {
  if (!files.length) return null;

  // Handle a single source before considering bundles. Most importantly, never turn
  // every image in an ordinary HTML/CSS/JS project into a data URL just to discover
  // afterwards that this is not a layout-only import.
  if (files.length === 1) {
    const file = files[0];
    const svg = svgContent(file);
    if (svg) return { kind: 'svg', name: fileStem(file.path), content: svg.content, primaryFile: file, supplementalFiles: [] };
    if (jsonContent(file)) return { kind: 'figma', name: fileStem(file.path), content: file.content, primaryFile: file, supplementalFiles: [] };
    const image = imageContent(file);
    if (image) return { kind: 'image', name: image.name.replace(/\.[^.]+$/, '') || 'GeneratedLayout', content: image.dataUrl, primaryFile: file, supplementalFiles: [] };
    return null;
  }

  // Fast extension/encoding gate before parsing base64 or constructing data URLs.
  // A regular web project is deliberately left on the source-conversion path.
  const isLikelyLayoutSource = (file: ProjectFile): boolean => {
    if (/\.svg$/i.test(file.path)) return isTextFile(file);
    if (/\.json$/i.test(file.path)) return jsonContent(file);
    if (/\.(?:png|jpe?g|webp)$/i.test(file.path)) return file.contentEncoding === 'base64' && Boolean(file.content);
    return false;
  };
  if (!files.every(isLikelyLayoutSource)) return null;

  const jsonFiles = files.filter(jsonContent);
  const svgFiles = files.map(file => ({ file, value: svgContent(file) })).filter(item => item.value !== null);
  const imageFiles = files.map(file => ({ file, value: imageContent(file) })).filter(item => item.value !== null);
  const primaryJson = jsonFiles[0];
  const primarySvg = svgFiles[0];
  const companionSvg = primaryJson ? (svgFiles.find(item => item.file.id !== primaryJson.id)?.value || undefined) : undefined;
  const companionPng = imageFiles[0]?.value || undefined;

  if (primaryJson) {
    return {
      kind: 'figma', name: fileStem(primaryJson.path), content: primaryJson.content, primaryFile: primaryJson,
      companionSvg, companionPng,
      supplementalFiles: files.filter(file => file.id !== primaryJson.id),
    };
  }
  if (primarySvg) {
    return {
      kind: 'svg', name: fileStem(primarySvg.file.path), content: primarySvg.value!.content, primaryFile: primarySvg.file,
      companionPng,
      supplementalFiles: files.filter(file => file.id !== primarySvg.file.id),
    };
  }
  // Multiple unrelated screenshots have no safe automatic merge rule.
  return null;
}
