import type { ConversionOptions } from './types.ts';

export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  autoFixTransitions: true,
  convertGridToFlex: true,
  includeVacuusBase: true,
  sanitizeBrowserJs: true,
  generateUeBindings: true,
  rootRelativeFonts: true,
  // Keep browser CSS px as physical RmlUi px by default: the converter prioritizes visual pixel parity.
  // Projects that intentionally want Slate-DPI-scaled sizing can opt in with cssPixelsAsDp: true.
  cssPixelsAsDp: false,
};
