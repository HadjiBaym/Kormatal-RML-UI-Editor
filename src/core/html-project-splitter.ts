import { extractEmbeddedAssetsFromHtml, type HtmlCssResource, type HtmlScriptResource } from './html-embedded-extractor.ts';
import type { ProjectFile } from './types.ts';

/**
 * Splits an HTML document with inline styles/scripts into separate project files.
 * This lightweight module is used by the importer, not by the full converter bundle.
 */
export function splitMonolithicHtmlProject(htmlContent: string, filename = 'index.html'): ProjectFile[] {
  const extracted = extractEmbeddedAssetsFromHtml(htmlContent, filename);
  const normalizedFilename = filename.replace(/\\/g, '/');
  const slashIndex = normalizedFilename.lastIndexOf('/');
  const sourceDirectory = slashIndex >= 0 ? normalizedFilename.slice(0, slashIndex) : '';
  const sourceLeaf = slashIndex >= 0 ? normalizedFilename.slice(slashIndex + 1) : normalizedFilename;
  const sourceStem = sourceLeaf.replace(/\.[^/.]+$/, '');
  const assetStem = sourceStem.toLowerCase() === 'index' ? 'style' : sourceStem;
  const inlineStyles = extracted.cssResources.filter((resource): resource is Extract<HtmlCssResource, { kind: 'inline' }> => resource.kind === 'inline');
  const nonEmptyInlineStyles = inlineStyles.filter(resource => resource.content.trim().length > 0);
  const cssAssets = nonEmptyInlineStyles.map((resource, index) => {
    const leaf = nonEmptyInlineStyles.length === 1 ? `${assetStem}.css` : `${assetStem}.inline-${index + 1}.css`;
    return { resource, leaf, path: sourceDirectory ? `${sourceDirectory}/${leaf}` : leaf };
  });
  const inlineScripts = extracted.jsResources.filter(
    (resource): resource is Extract<HtmlScriptResource, { kind: 'inline' }> => resource.kind === 'inline' && resource.content.trim().length > 0,
  );
  const jsAssets = inlineScripts.map((resource, index) => {
    const leaf = inlineScripts.length === 1
      ? `${sourceStem.toLowerCase() === 'index' ? 'script' : sourceStem}.js`
      : `${sourceStem.toLowerCase() === 'index' ? 'script' : sourceStem}.inline-${index + 1}.js`;
    return { resource, leaf, path: sourceDirectory ? `${sourceDirectory}/${leaf}` : leaf };
  });

  let updatedHtml = extracted.cleanedHtml;
  for (const asset of cssAssets) {
    const marker = `<!-- [VaCuus Converter: Embedded style extracted to RCSS at ${asset.resource.start}] -->`;
    const media = asset.resource.media ? ` media="${escapeHtmlAttribute(asset.resource.media)}"` : '';
    updatedHtml = updatedHtml.replace(marker, `<link rel="stylesheet" href="${escapeHtmlAttribute(asset.leaf)}"${media}>`);
  }
  for (const asset of jsAssets) {
    const marker = `<!-- [VaCuus Converter: Inline script extracted to JavaScript at ${asset.resource.start}] -->`;
    const attrs: string[] = [`src="${escapeHtmlAttribute(asset.leaf)}"`];
    if (asset.resource.scriptType) attrs.push(`type="${escapeHtmlAttribute(asset.resource.scriptType)}"`);
    if (asset.resource.async) attrs.push('async=""');
    if (asset.resource.defer) attrs.push('defer=""');
    if (asset.resource.noModule) attrs.push('nomodule=""');
    updatedHtml = updatedHtml.replace(marker, `<script ${attrs.join(' ')}></script>`);
  }

  const resultFiles: ProjectFile[] = [{
    id: `file-${Date.now()}-html`, path: filename, type: 'html', content: updatedHtml, isEntry: true,
  }];
  cssAssets.forEach((asset, index) => resultFiles.push({
    id: `file-${Date.now()}-css-${index}`, path: asset.path, type: 'css',
    content: `/* Extracted by Kormatal RML UI Editor from ${filename}, inline style ${index + 1} */\n\n${asset.resource.content}`,
  }));
  jsAssets.forEach((asset, index) => resultFiles.push({
    id: `file-${Date.now()}-js-${index}`, path: asset.path, type: 'js',
    content: `// Extracted by Kormatal RML UI Editor from ${filename}, inline script ${index + 1}\n\n${asset.resource.content}`,
  }));
  return resultFiles;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
