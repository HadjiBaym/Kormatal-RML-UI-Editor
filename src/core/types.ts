export type DiagnosticSeverity = 'error' | 'warning' | 'manual-fix' | 'info' | 'unverified';
export type DiagnosticCategory = 'html' | 'css' | 'js' | 'asset' | 'ue5';

export interface DiagnosticIssue {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  file: string;
  line: number;
  column: number;
  originalSnippet: string;
  message: string;
  impact: string;
  autoFixAvailable: boolean;
  autoFixDescription?: string;
  fixed: boolean;
  recommendedAction: string;
  docRef?: string;
}

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  type: 'html' | 'css' | 'js' | 'asset';
  isEntry?: boolean;
  /** Binary source assets are kept as base64 so ZIP import/export never corrupts their bytes. */
  contentEncoding?: 'text' | 'base64';
  /** Original MIME type for binary assets and inline SVG source files. */
  mimeType?: string;
}

export interface PackagedProjectAsset {
  sourcePath: string;
  filename: string;
  directory: 'Assets' | 'Fonts';
  /** URL as referenced from the generated screen document, or root-relative for fonts. */
  referencePath: string;
  outputPath: string;
  mimeType: string;
  contentBase64?: string;
  contentText?: string;
  sourceKind: 'binary' | 'svg';
  previewDataUrl: string;
  sourceAliases: string[];
}

export interface ConversionMetrics {
  htmlTagsProcessed: number;
  cssRulesProcessed: number;
  cssDeclarationsAnalyzed: number;
  cssUnsupportedFeatures: number;
  jsFunctionsProcessed: number;
  jsBrowserApisFlagged: number;
  htmlUnsupportedElements: number;
  autoFixesApplied: number;
  warningsCount: number;
  errorsCount: number;
  manualFixesCount: number;
}

export type ConversionReadinessStatus = 'not-run' | 'static-clean' | 'needs-review' | 'blocked';

export interface ConversionReadiness {
  status: ConversionReadinessStatus;
  blockingIssues: number;
  reviewIssues: number;
  /** Static analysis cannot replace a render test in the exact UE5/VaCuus build. */
  nativeRuntimeVerified: false;
}

export interface SvgRasterAsset {
  /** Stable relative filename written under Content/DevUI/Assets/. */
  filename: string;
  /** Standalone, sanitized SVG source ready for rasterization during export. */
  sourceSvg: string;
  width: number;
  height: number;
  altText?: string;
  /** Classes on the source SVG and its immediate parent, used to inline paint styles for rasterization. */
  elementClasses?: string[];
  parentClasses?: string[];
  elementId?: string;
}

export interface PseudoElementSpec {
  /** Base CSS selector without ::before/::after, e.g. '.nav button.active'. */
  targetSelector: string;
  position: 'before' | 'after';
  /** Stable helper class added to the generated RML span and referenced by RCSS. */
  className: string;
  /** Text from a supported quoted CSS content value. Empty string is valid. */
  contentText: string;
}

export interface ExternalImageAsset {
  /** Original CSS url(), retained so export can fetch and package the image. */
  url: string;
  /** Stable relative PNG filename written under Content/DevUI/Assets/. */
  filename: string;
}

export interface ConvertedProjectResult {
  rml: string;
  rcss: string;
  js: string;
  vacuusBaseRcss: string;
  readmeMd: string;
  conversionReportMd: string;
  compatibilityJson: string;
  projectManifestJson: string;
  ueIntegrationSnippet: string;
  cppHeader?: string;
  cppSource?: string;
  diagnostics: DiagnosticIssue[];
  metrics: ConversionMetrics;
  readiness: ConversionReadiness;
  /** Inline SVG icons replaced with local PNG references in generated RML. */
  svgAssets?: SvgRasterAsset[];
  /** External CSS images rewritten to local PNG references for VaCuus export. */
  externalImageAssets?: ExternalImageAsset[];
  /** Imported local images/fonts to be packaged alongside generated SVG and remote image assets. */
  projectAssets?: PackagedProjectAsset[];
}

export interface ConversionOptions {
  autoFixTransitions: boolean;
  convertGridToFlex: boolean;
  includeVacuusBase: boolean;
  sanitizeBrowserJs: boolean;
  generateUeBindings: boolean;
  rootRelativeFonts: boolean;
  /** Convert browser CSS px dimensions/breakpoints to RmlUi dp for Slate DPI scaling. Off by default for pixel-fidelity conversion. */
  cssPixelsAsDp: boolean;
}
