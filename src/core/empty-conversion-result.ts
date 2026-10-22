import { VACUUS_BASE_RCSS } from './vacuus-base.ts';
import type { ConvertedProjectResult } from './types.ts';

/** Lightweight initial state; the full converter is loaded only inside the worker. */
export function createEmptyConversionResult(): ConvertedProjectResult {
  return {
    rml: '',
    rcss: '',
    js: '',
    vacuusBaseRcss: VACUUS_BASE_RCSS,
    readmeMd: '',
    conversionReportMd: '',
    compatibilityJson: '{"issues":[]}',
    projectManifestJson: '{}',
    ueIntegrationSnippet: '',
    cppHeader: '',
    cppSource: '',
    diagnostics: [],
    metrics: {
      htmlTagsProcessed: 0,
      cssRulesProcessed: 0,
      cssDeclarationsAnalyzed: 0,
      cssUnsupportedFeatures: 0,
      jsFunctionsProcessed: 0,
      jsBrowserApisFlagged: 0,
      htmlUnsupportedElements: 0,
      autoFixesApplied: 0,
      warningsCount: 0,
      errorsCount: 0,
      manualFixesCount: 0,
    },
    readiness: { status: 'not-run', blockingIssues: 0, reviewIssues: 0, nativeRuntimeVerified: false },
    svgAssets: [],
    externalImageAssets: [],
    projectAssets: [],
  };
}
