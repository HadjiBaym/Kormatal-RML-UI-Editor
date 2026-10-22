import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Monitor,
  Sparkles,
  RotateCcw,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Hand,
  MousePointer,
  Columns,
  Layers,
  Grid,
  Crosshair,
  Sliders,
  AlertCircle,
  Check,
  ChevronDown,
  RefreshCw,
  Eye,
  ShieldAlert,
  Smartphone,
  Tv,
  Gamepad2,
  SplitSquareVertical,
  Compass,
  Bug,
  ShieldCheck,
} from 'lucide-react';
import { RmlDebugInspector, InspectedRmlElement } from './RmlDebugInspector';
import { validateVisualDeclarationsForRmlUi } from '../core/visual-editor.ts';
import type { VisualCssDeclarations } from '../core/visual-editor.ts';
import { panCanvasByPointer, panCanvasByWheel, zoomCanvasAtPoint } from '../core/canvas-navigation.ts';
import { rewriteHtmlResourceUrls, rewriteRcssForBrowser, type PreviewAssetUrlMap } from '../core/preview-assets.ts';
import { buildOriginalPreviewDocument, type OriginalPreviewDiagnostic } from '../core/original-preview.ts';
import type { ProjectFile } from '../core/types.ts';
import { DEFAULT_UI_FONT_FAMILY, UI_FONT_FAMILIES, getBundledFontFaceBrowserCss, normalizeNativeRcssFontFamilies, resolveUiFontFamily } from '../core/ui-fonts.ts';
import { VisualReviewModal } from './VisualReviewModal.tsx';

const colorToHex = (raw: string): string => {
  const value = String(raw || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map(c => c + c).join('');
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('');
  return '#000000';
};

const ColorEditor: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => {
  const [draft, setDraft] = useState(colorToHex(value));
  useEffect(() => setDraft(colorToHex(value)), [value]);
  return (
    <label className="flex items-center justify-between gap-3 text-zinc-400">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <code className="max-w-[112px] truncate text-[10px] text-zinc-500">{value}</code>
        <input type="color" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.toLowerCase() !== colorToHex(value).toLowerCase()) onChange(draft); }} className="h-7 w-9 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5" />
      </span>
    </label>
  );
};

interface PreviewPanelProps {
  sourceHtml: string;
  sourceHtmlPath?: string;
  sourceFiles?: ProjectFile[];
  sourceRml?: string;
  sourceRcss?: string;
  sourceCss: string;
  sourceJs: string;
  convertedRml: string;
  convertedRcss: string;
  convertedJs: string;
  vacuusBaseRcss: string;
  conversionDiagnostics?: string;
  previewAssetUrls?: PreviewAssetUrlMap;
  onApplyVisualEdit?: (selector: string, declarations: VisualCssDeclarations) => void;
  onUndoVisualEdit?: () => void;
  onRedoVisualEdit?: () => void;
  canUndoVisualEdit?: boolean;
  canRedoVisualEdit?: boolean;
}

interface VisualDesignSelection {
  selector: string;
  tagName: string;
  id: string;
  className: string;
  text: string;
  styles: Record<string, string>;
  box: { x: number; y: number; width: number; height: number };
}

type ViewMode = 'dual' | 'split-diff' | 'emulated-only' | 'browser-only';
type CanvasTool = 'select' | 'hand';
type CanvasTheme = 'dots' | 'blueprint' | 'dark' | 'checker';

interface ResolutionPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  icon?: string;
  category: 'desktop' | 'gaming' | 'mobile';
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '1080p', name: '1080p FHD (UE5 HUD standard)', width: 1920, height: 1080, category: 'gaming' },
  { id: '1440p', name: '1440p 2K (игры с высоким DPI)', width: 2560, height: 1440, category: 'gaming' },
  { id: '4k', name: '4K UHD (3840 × 2160)', width: 3840, height: 2160, category: 'desktop' },
  { id: '720p', name: '720p HD (HUD для слабых систем)', width: 1280, height: 720, category: 'gaming' },
  { id: 'deck', name: 'Steam Deck (1280 × 800, 16:10)', width: 1280, height: 800, category: 'gaming' },
  { id: 'ultrawide', name: '21:9 Ultrawide (2560 × 1080)', width: 2560, height: 1080, category: 'desktop' },
  { id: 'mobile', name: 'Мобильный портрет (390 × 844)', width: 390, height: 844, category: 'mobile' },
];


// Navigation bridge for sandboxed live-preview iframes. It keeps normal UI clicks,
// but forwards explicit canvas gestures to the host editor even with Active UI enabled.
const CANVAS_NAVIGATION_BRIDGE = String.raw`<script>
(function () {
  if (window.__vacuusCanvasNavigationInstalled) return;
  window.__vacuusCanvasNavigationInstalled = true;
  var source = 'vacuus-canvas-navigation';
  var spaceDown = false;
  var panGesture = null;
  var handTool = false;
  function send(type, data) {
    try { window.parent.postMessage(Object.assign({ type: type, source: source }, data || {}), '*'); } catch (_) {}
  }
  function isEditable(target) {
    return !!(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));
  }
  function canScroll(target, axis, delta) {
    var node = target;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.nodeType === 1) {
        var style = window.getComputedStyle(node);
        var overflow = axis === 'x' ? style.overflowX : style.overflowY;
        var hasOverflow = axis === 'x' ? node.scrollWidth > node.clientWidth + 1 : node.scrollHeight > node.clientHeight + 1;
        var offset = axis === 'x' ? node.scrollLeft : node.scrollTop;
        var max = axis === 'x' ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
        if (hasOverflow && /(auto|scroll|overlay)/.test(overflow)) {
          if ((delta < 0 && offset > 0) || (delta > 0 && offset < max - 1)) return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  }
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg && msg.type === 'CANVAS_NAV_SET_TOOL' && msg.source === 'vacuus-canvas-navigation-host') {
      handTool = msg.tool === 'hand';
      if (!panGesture) document.documentElement.style.setProperty('cursor', handTool ? 'grab' : '', handTool ? 'important' : '');
    }
  });
  window.addEventListener('keydown', function (event) {
    if (event.code === 'Space' && !isEditable(event.target)) spaceDown = true;
  }, true);
  window.addEventListener('keyup', function (event) { if (event.code === 'Space') spaceDown = false; }, true);
  window.addEventListener('blur', function () { spaceDown = false; });
  document.addEventListener('pointerdown', function (event) {
    if (isEditable(event.target)) return;
    var shouldPan = event.button === 1 || (event.button === 0 && (spaceDown || handTool));
    if (!shouldPan) return;
    panGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    document.documentElement.style.setProperty('cursor', 'grabbing', 'important');
    try { event.target.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
    event.stopImmediatePropagation();
    send('CANVAS_NAV_PAN_START', { x: event.clientX, y: event.clientY, pointerId: event.pointerId });
  }, true);
  document.addEventListener('pointermove', function (event) {
    if (!panGesture || event.pointerId !== panGesture.pointerId) return;
    send('CANVAS_NAV_PAN_MOVE', { x: event.clientX, y: event.clientY, pointerId: event.pointerId });
    event.preventDefault();
  }, true);
  function endPan(event) {
    if (!panGesture || event.pointerId !== panGesture.pointerId) return;
    send('CANVAS_NAV_PAN_END', { pointerId: event.pointerId });
    panGesture = null;
    document.documentElement.style.setProperty('cursor', handTool ? 'grab' : '', handTool ? 'important' : '');
    event.preventDefault();
  }
  document.addEventListener('pointerup', endPan, true);
  document.addEventListener('pointercancel', endPan, true);
  window.addEventListener('wheel', function (event) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      send('CANVAS_NAV_ZOOM', { x: event.clientX, y: event.clientY, deltaY: event.deltaY });
      return;
    }
    var scrollY = canScroll(event.target, 'y', event.deltaY);
    var scrollX = canScroll(event.target, 'x', event.deltaX);
    if (scrollY || scrollX) return;
    event.preventDefault();
    send('CANVAS_NAV_WHEEL', { deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey });
  }, { capture: true, passive: false });
  window.addEventListener('contextmenu', function (event) { if (panGesture) event.preventDefault(); }, true);
})();
</script>`;

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  sourceHtml,
  sourceHtmlPath = 'index.html',
  sourceFiles = [],
  sourceRml = '',
  sourceRcss = '',
  sourceCss,
  sourceJs,
  convertedRml,
  convertedRcss,
  convertedJs,
  vacuusBaseRcss,
  conversionDiagnostics = '',
  previewAssetUrls = {},
  onApplyVisualEdit,
  onUndoVisualEdit,
  onRedoVisualEdit,
  canUndoVisualEdit = false,
  canRedoVisualEdit = false,
}) => {
  // 1. Board & Canvas state
  const [viewMode, setViewMode] = useState<ViewMode>('dual');
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [isInteracting, setIsInteracting] = useState<boolean>(true);
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>('dots');
  const [isCanvasThemeMenuOpen, setIsCanvasThemeMenuOpen] = useState(false);
  const canvasThemeMenuRef = useRef<HTMLDivElement>(null);
  const hadNativeRmlRef = useRef(false);
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isDesignMode, setIsDesignMode] = useState<boolean>(false);
  const [isRmlDesignMode, setIsRmlDesignMode] = useState<boolean>(false);
  const [designSelection, setDesignSelection] = useState<VisualDesignSelection | null>(null);
  const [designLayers, setDesignLayers] = useState<Array<{ selector: string; tagName: string; id: string; className: string; text: string; depth: number }>>([]);
  const [designDraft, setDesignDraft] = useState({ width: '', height: '', fontSize: '' });
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [isVisualReviewOpen, setIsVisualReviewOpen] = useState(false);
  const [originalPreviewRuntimeDiagnostics, setOriginalPreviewRuntimeDiagnostics] = useState<OriginalPreviewDiagnostic[]>([]);
  const [isOriginalPreviewDiagnosticsOpen, setIsOriginalPreviewDiagnosticsOpen] = useState(false);

  // 2. Resolution State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('1080p');
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [isCustomRes, setIsCustomRes] = useState<boolean>(false);

  // 3. Zoom & Pan Transform State
  const [zoom, setZoom] = useState<number>(0.5);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 50 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number; scaleX?: number; scaleY?: number; source?: 'host' | 'iframe' } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Canvas navigation remains enabled while Active UI is on.
  // Wheel pans the board; Ctrl/Cmd+wheel zooms around the cursor.
  const handleZoomAtViewportPoint = useCallback((x: number, y: number, deltaY: number) => {
    const next = zoomCanvasAtPoint({ zoom: zoomRef.current, pan: panRef.current }, { x, y }, deltaY);
    zoomRef.current = next.zoom;
    panRef.current = next.pan;
    setZoom(next.zoom);
    setPan(next.pan);
  }, []);

  const setCanvasZoom = useCallback((value: number | ((current: number) => number)) => {
    const requested = typeof value === 'function' ? value(zoomRef.current) : value;
    const next = Math.min(3, Math.max(0.1, requested));
    const viewport = viewportRef.current;
    if (viewport && zoomRef.current > 0) {
      const center = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      const worldX = (center.x - panRef.current.x) / zoomRef.current;
      const worldY = (center.y - panRef.current.y) / zoomRef.current;
      const nextPan = { x: center.x - worldX * next, y: center.y - worldY * next };
      panRef.current = nextPan;
      setPan(nextPan);
    }
    zoomRef.current = next;
    setZoom(next);
  }, []);

  // Split-Diff comparison slider position (0 to 100%)
  const [diffSplitPercent, setDiffSplitPercent] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);

  // Active selected artboard for Figma-style focus
  const [selectedFrame, setSelectedFrame] = useState<'browser' | 'emulated' | null>('emulated');

  // 4. Режим отладки State: Thin borders around RML элементов & RCSS mapped properties inspector
  const [isDebugViewActive, setIsDebugViewActive] = useState<boolean>(false);
  const [inspectedElement, setInspectedElement] = useState<InspectedRmlElement | null>(null);
  const [allDetectedElements, setAllDetectedElements] = useState<InspectedRmlElement[]>([]);

  // DOM Container ref
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const browserFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const hasNativeRml = Boolean(sourceRml.trim());
    if (hasNativeRml && !hadNativeRmlRef.current) {
      setViewMode('emulated-only');
      setSelectedFrame('emulated');
    } else if (!hasNativeRml && hadNativeRmlRef.current) {
      // Switching from a native RML screen back to an HTML source restores browser comparison.
      setViewMode('dual');
      setSelectedFrame('browser');
    }
    hadNativeRmlRef.current = hasNativeRml;
  }, [Boolean(sourceRml.trim())]);

  useEffect(() => {
    if (!isCanvasThemeMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (canvasThemeMenuRef.current && !canvasThemeMenuRef.current.contains(event.target as Node)) setIsCanvasThemeMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsCanvasThemeMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [isCanvasThemeMenuOpen]);

  // Calculate current width and height
  const frameWidth = isCustomRes ? customWidth : (RESOLUTION_PRESETS.find(p => p.id === selectedPresetId)?.width || 1920);
  const frameHeight = isCustomRes ? customHeight : (RESOLUTION_PRESETS.find(p => p.id === selectedPresetId)?.height || 1080);
  const selectedRmlValidation = useMemo(() => {
    if (!designSelection) return [];
    const styles = designSelection.styles;
    return validateVisualDeclarationsForRmlUi({
      width: styles.width || '', height: styles.height || '', 'font-size': styles.fontSize || '',
      display: styles.display || '', position: styles.position || '', opacity: styles.opacity || '',
    });
  }, [designSelection]);

  // Canvas navigation is independent from Active UI. Explicit gestures can move the board
  // without disabling regular clicks inside the preview iframe.
  const canInteractWithUi = isInteracting && activeTool !== 'hand';

  // Keep the frame-side gesture bridge in sync when users switch Select/Hand tools or reload previews.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const payload = { type: 'CANVAS_NAV_SET_TOOL', source: 'vacuus-canvas-navigation-host', tool: activeTool };
    const frames = Array.from(viewport.querySelectorAll('iframe')) as HTMLIFrameElement[];
    const loadHandlers = new Map<HTMLIFrameElement, () => void>();
    const send = (frame: HTMLIFrameElement) => { try { frame.contentWindow?.postMessage(payload, '*'); } catch {} };
    frames.forEach(frame => {
      send(frame);
      const onLoad = () => send(frame);
      loadHandlers.set(frame, onLoad);
      frame.addEventListener('load', onLoad);
    });
    return () => loadHandlers.forEach((handler, frame) => frame.removeEventListener('load', handler));
  }, [activeTool, refreshKey, viewMode, isDesignMode, isRmlDesignMode]);

  // Listen for iframe RML debug inspector postMessages
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'ORIGINAL_PREVIEW_DIAGNOSTIC') {
        if (e.data.source !== 'vacuus-original-preview' || !Array.from(document.querySelectorAll('iframe')).some(frame => frame.contentWindow === e.source && /исходного браузера/i.test(frame.title))) return;
        const diagnostic: OriginalPreviewDiagnostic = {
          severity: e.data.severity === 'error' ? 'error' : 'warning',
          category: e.data.category === 'resource' ? 'resource' : 'javascript',
          file: typeof e.data.file === 'string' ? e.data.file : sourceHtmlPath,
          message: typeof e.data.message === 'string' ? e.data.message.slice(0, 500) : 'Ошибка исходного предпросмотра',
        };
        setOriginalPreviewRuntimeDiagnostics(current => {
          if (current.some(item => item.message === diagnostic.message && item.file === diagnostic.file)) return current;
          return [...current, diagnostic].slice(-30);
        });
        return;
      }
      if (typeof e.data.type === 'string' && e.data.type.startsWith('DESIGN_EDITOR_') && e.data.source !== 'vacuus-ui-designer') return;
      if (typeof e.data.type === 'string' && e.data.type.startsWith('CANVAS_NAV_')) {
        if (e.data.source !== 'vacuus-canvas-navigation') return;
        const frames = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
        const frame = frames.find(candidate => candidate.contentWindow === e.source);
        const viewport = viewportRef.current;
        if (!frame || !viewport) return;
        if (e.data.type === 'CANVAS_NAV_PAN_START') {
          const rect = frame.getBoundingClientRect();
          dragStartRef.current = {
            x: Number(e.data.x) || 0,
            y: Number(e.data.y) || 0,
            startPanX: panRef.current.x,
            startPanY: panRef.current.y,
            scaleX: rect.width / Math.max(1, frame.clientWidth),
            scaleY: rect.height / Math.max(1, frame.clientHeight),
            source: 'iframe',
          };
          setIsDragging(true);
        } else if (e.data.type === 'CANVAS_NAV_PAN_MOVE' && dragStartRef.current?.source === 'iframe') {
          const start = dragStartRef.current;
          const next = panCanvasByPointer({ x: start.startPanX, y: start.startPanY }, (Number(e.data.x) || 0) - start.x, (Number(e.data.y) || 0) - start.y, start.scaleX || 1, start.scaleY || 1);
          panRef.current = next;
          setPan(next);
        } else if (e.data.type === 'CANVAS_NAV_PAN_END' && dragStartRef.current?.source === 'iframe') {
          dragStartRef.current = null;
          setIsDragging(false);
        } else if (e.data.type === 'CANVAS_NAV_WHEEL') {
          const dx = Number(e.data.shiftKey) ? (Number(e.data.deltaY) || 0) : (Number(e.data.deltaX) || 0);
          const dy = Number(e.data.shiftKey) ? 0 : (Number(e.data.deltaY) || 0);
          const next = panCanvasByWheel(panRef.current, dx, dy);
          panRef.current = next;
          setPan(next);
        } else if (e.data.type === 'CANVAS_NAV_ZOOM') {
          const frameRect = frame.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          const scaleX = frameRect.width / Math.max(1, frame.clientWidth);
          const scaleY = frameRect.height / Math.max(1, frame.clientHeight);
          const x = frameRect.left + (Number(e.data.x) || 0) * scaleX - viewportRect.left;
          const y = frameRect.top + (Number(e.data.y) || 0) * scaleY - viewportRect.top;
          handleZoomAtViewportPoint(x, y, Number(e.data.deltaY) || 0);
        }
        return;
      }
      if (e.data.type === 'RML_DEBUG_ELEMENT_HOVERED') {
        if (!inspectedElement?.isPinned) {
          setInspectedElement(e.data.element);
        }
      } else if (e.data.type === 'RML_DEBUG_ELEMENT_PINNED') {
        setInspectedElement({ ...e.data.element, isPinned: true });
      } else if (e.data.type === 'RML_DEBUG_ALL_ELEMENTS') {
        if (Array.isArray(e.data.elements)) {
          setAllDetectedElements(e.data.elements);
        }
      } else if (e.data.type === 'DESIGN_EDITOR_LAYERS' && (isDesignMode || isRmlDesignMode)) {
        if (Array.isArray(e.data.layers)) setDesignLayers(e.data.layers.filter((layer: any) => layer && typeof layer.selector === 'string').slice(0, 500));
      } else if (e.data.type === 'DESIGN_EDITOR_SELECTED' && (isDesignMode || isRmlDesignMode)) {
        const payload = e.data.element;
        if (payload && typeof payload.selector === 'string' && payload.styles && payload.box) {
          setDesignSelection(payload as VisualDesignSelection);
          setDesignDraft({
            width: String(payload.styles.width || '' ).replace(/px$/, ''),
            height: String(payload.styles.height || '').replace(/px$/, ''),
            fontSize: String(payload.styles.fontSize || '').replace(/px$/, ''),
          });
        }
      } else if (e.data.type === 'DESIGN_EDITOR_COMMIT' && (isDesignMode || isRmlDesignMode)) {
        const selector = e.data.selector;
        const declarations = e.data.declarations;
        if (typeof selector === 'string' && declarations && typeof declarations === 'object' && onApplyVisualEdit) {
          onApplyVisualEdit(selector, declarations as VisualCssDeclarations);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [inspectedElement, isDesignMode, isRmlDesignMode, onApplyVisualEdit, handleZoomAtViewportPoint, sourceHtmlPath]);

  // Clean HTML helpers for iframe srcDoc
  const cleanHtml = (raw: string) => {
    return raw
      .replace(/<link[^>]*\/?>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!DOCTYPE[^>]*>|<html[^>]*>|<\/html>|<head[^>]*>[\s\S]*?<\/head>|<body[^>]*>|<\/body>/gi, '');
  };

  // The design script runs inside the source iframe so element geometry is measured in
  // the document's own coordinate system, independently from the canvas zoom/pan transform.
  const designEditorScript = useMemo(() => {
    if (!isDesignMode) return '';
    return `<script>
(function() {
  var selected = null;
  var selectedSelector = '';
  var outline = document.createElement('div');
  outline.id = '__vacuus_design_outline';
  outline.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:2px solid #00d4b5;box-sizing:border-box;pointer-events:none;z-index:2147483646;display:none;';
  var guideX = document.createElement('div'); guideX.id = '__vacuus_design_guide_x'; guideX.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100vh;background:rgba(0,212,181,.7);pointer-events:none;z-index:2147483645;display:none;';
  var guideY = document.createElement('div'); guideY.id = '__vacuus_design_guide_y'; guideY.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:1px;background:rgba(0,212,181,.7);pointer-events:none;z-index:2147483645;display:none;';
  var handle = document.createElement('div');
  handle.id = '__vacuus_design_resize';
  handle.style.cssText = 'position:fixed;width:11px;height:11px;background:#00d4b5;border:2px solid #f2fffc;box-sizing:border-box;z-index:2147483647;cursor:nwse-resize;display:none;';
  document.body.appendChild(guideX); document.body.appendChild(guideY);
  document.body.appendChild(outline);
  document.body.appendChild(handle);
  var drag = null;
  var snapStep = ${snapToGrid ? 8 : 1};
  var suppressClick = false;
  var lastDeclarations = null;
  var excluded = ['HTML','BODY','SCRIPT','STYLE','META','LINK','HEAD','TITLE'];
  function esc(value) { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/([^a-zA-Z0-9_-])/g, '\\\\$1'); }
  function unique(selector) { try { return document.querySelectorAll(selector).length === 1; } catch (e) { return false; } }
  function makeSelector(el) {
    if (el.id && unique('#' + esc(el.id))) return '#' + esc(el.id);
    var classNames = Array.prototype.slice.call(el.classList || []);
    for (var n = classNames.length; n > 0; n--) {
      var candidate = el.tagName.toLowerCase() + classNames.slice(0, n).map(function(c) { return '.' + esc(c); }).join('');
      if (unique(candidate)) return candidate;
    }
    var parts = [];
    var cur = el;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.id) {
        parts.unshift('#' + esc(cur.id));
        var idPath = parts.join(' > ');
        if (unique(idPath)) return idPath;
        break;
      }
      var part = cur.tagName.toLowerCase();
      var classes = Array.prototype.slice.call(cur.classList || []);
      if (classes.length) part += classes.map(function(c) { return '.' + esc(c); }).join('');
      var parent = cur.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function(x) { return x.tagName === cur.tagName; });
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      var candidatePath = parts.join(' > ');
      if (unique(candidatePath)) return candidatePath;
      cur = parent;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }
  function sendSelection() {
    if (!selected || !selected.isConnected) return;
    var cs = getComputedStyle(selected);
    var r = selected.getBoundingClientRect();
    var s = {
      width: cs.width, height: cs.height, color: cs.color,
      backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, fontFamily: cs.fontFamily,
      borderColor: cs.borderTopColor, borderWidth: cs.borderTopWidth,
      opacity: cs.opacity, position: cs.position, left: cs.left, top: cs.top,
      display: cs.display
    };
    var data = { selector: selectedSelector, tagName: selected.tagName.toLowerCase(), id: selected.id || '',
      className: typeof selected.className === 'string' ? selected.className : '',
      text: (selected.innerText || selected.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
      styles: s, box: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } };
    window.parent.postMessage({ type: 'DESIGN_EDITOR_SELECTED', element: data, source: 'vacuus-ui-designer' }, '*');
    updateOutline();
  }
  function updateOutline() {
    if (!selected || !selected.isConnected) { outline.style.display = 'none'; handle.style.display = 'none'; guideX.style.display = 'none'; guideY.style.display = 'none'; return; }
    var r = selected.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.left = Math.round(r.left) + 'px'; outline.style.top = Math.round(r.top) + 'px';
    outline.style.width = Math.max(0, Math.round(r.width)) + 'px'; outline.style.height = Math.max(0, Math.round(r.height)) + 'px';
    handle.style.display = 'block'; handle.style.left = Math.round(r.right - 5) + 'px'; handle.style.top = Math.round(r.bottom - 5) + 'px';
    if (drag && drag.moved) { guideX.style.display = 'block'; guideY.style.display = 'block'; guideX.style.left = Math.round(r.left + r.width / 2) + 'px'; guideY.style.top = Math.round(r.top + r.height / 2) + 'px'; } else { guideX.style.display = 'none'; guideY.style.display = 'none'; }
  }
  function publishLayers() {
    var nodes = Array.prototype.slice.call(document.body.querySelectorAll('*')).filter(function(el) { return excluded.indexOf(el.tagName) === -1 && el.id.indexOf('__vacuus_design_') !== 0 && !el.closest('#__vacuus_design_outline, #__vacuus_design_resize'); });
    var layers = nodes.slice(0, 500).map(function(el) { var text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 64); var depth = 0; var parent = el.parentElement; while (parent && parent !== document.body && depth < 12) { depth++; parent = parent.parentElement; } return { selector: makeSelector(el), tagName: el.tagName.toLowerCase(), id: el.id || '', className: typeof el.className === 'string' ? el.className : '', text: text, depth: depth }; });
    window.parent.postMessage({ type: 'DESIGN_EDITOR_LAYERS', layers: layers, source: 'vacuus-ui-designer' }, '*');
  }
  function selectElement(el) {
    if (!el || excluded.indexOf(el.tagName) !== -1 || el.id.indexOf('__vacuus_design_') === 0) return;
    selected = el; selectedSelector = makeSelector(el); sendSelection();
  }
  function emitCommit(declarations) {
    if (!selected || !selectedSelector || !declarations || !Object.keys(declarations).length) return;
    window.parent.postMessage({ type: 'DESIGN_EDITOR_COMMIT', selector: selectedSelector, declarations: declarations, source: 'vacuus-ui-designer' }, '*');
    sendSelection();
  }
  function stop(e) {
    if (!drag) return;
    var state = drag; drag = null;
    if (state.moved) {
      var declarations = {};
      if (state.mode === 'resize') {
        declarations.width = Math.max(16, Math.round(state.startWidth + state.dx)) + 'px';
        declarations.height = Math.max(12, Math.round(state.startHeight + state.dy)) + 'px';
      } else {
        if (state.originalPosition === 'static') declarations.position = 'relative';
        declarations.left = Math.round(state.startLeft + state.dx) + 'px';
        declarations.top = Math.round(state.startTop + state.dy) + 'px';
      }
      emitCommit(declarations);
    } else {
      sendSelection();
    }
    suppressClick = true;
    setTimeout(function() { suppressClick = false; }, 0);
    if (e && e.cancelable) e.preventDefault();
  }
  function beginDrag(e, el, mode) {
    if (!el) return;
    var cs = getComputedStyle(el); var r = el.getBoundingClientRect();
    drag = { element: el, mode: mode, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false,
      originalPosition: cs.position, startLeft: cs.left === 'auto' ? 0 : parseFloat(cs.left) || 0,
      startTop: cs.top === 'auto' ? 0 : parseFloat(cs.top) || 0,
      startWidth: r.width, startHeight: r.height, originalInlinePosition: el.style.position };
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault(); e.stopPropagation();
  }
  document.addEventListener('pointerdown', function(e) {
    if (e.target === handle) { if (selected) beginDrag(e, selected, 'resize'); return; }
    var el = e.target && e.target.closest ? e.target.closest('body *') : null;
    if (!el || excluded.indexOf(el.tagName) !== -1 || el.id.indexOf('__vacuus_design_') === 0) return;
    selectElement(el);
    beginDrag(e, el, 'move');
  }, true);
  document.addEventListener('pointermove', function(e) {
    if (!drag) { if (selected) updateOutline(); return; }
    drag.dx = Math.round((e.clientX - drag.startX) / snapStep) * snapStep; drag.dy = Math.round((e.clientY - drag.startY) / snapStep) * snapStep;
    if (Math.abs(drag.dx) > 2 || Math.abs(drag.dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    if (drag.mode === 'resize') {
      drag.element.style.width = Math.max(16, drag.startWidth + drag.dx) + 'px';
      drag.element.style.height = Math.max(12, drag.startHeight + drag.dy) + 'px';
    } else {
      if (drag.originalPosition === 'static') drag.element.style.position = 'relative';
      drag.element.style.left = Math.round(drag.startLeft + drag.dx) + 'px';
      drag.element.style.top = Math.round(drag.startTop + drag.dy) + 'px';
    }
    updateOutline(); e.preventDefault();
  }, true);
  document.addEventListener('pointerup', function(e) { stop(e); }, true);
  document.addEventListener('pointercancel', function(e) { stop(e); }, true);
  document.addEventListener('click', function(e) {
    if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.target === handle || e.target === outline) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('resize', updateOutline);
  window.addEventListener('scroll', updateOutline, true);
  window.addEventListener('load', publishLayers);
  setTimeout(publishLayers, 80);
  window.addEventListener('message', function(event) {
    var message = event.data;
    if (!message || message.type !== 'DESIGN_EDITOR_RESTORE' || typeof message.selector !== 'string') return;
    try { var restored = document.querySelector(message.selector); if (restored) selectElement(restored); }
    catch (e) { /* The selector may no longer exist after source editing. */ }
  });
  window.__vacuusDesignEditor = { select: selectElement, update: updateOutline };
})();
</script>`;
  }, [isDesignMode, snapToGrid]);

  // Faithful source-browser preview: preserve the imported document and CSS cascade,
  // resolve local project files by the references actually used in HTML, and report runtime errors.
  const originalPreviewBuild = useMemo(
    () => buildOriginalPreviewDocument(sourceHtml, sourceHtmlPath, sourceFiles, previewAssetUrls),
    [sourceHtml, sourceHtmlPath, sourceFiles, previewAssetUrls],
  );
  const originalPreviewDiagnostics = useMemo(() => {
    const merged = [...originalPreviewBuild.diagnostics, ...originalPreviewRuntimeDiagnostics];
    return merged.filter((item, index) => merged.findIndex(other => other.severity === item.severity && other.file === item.file && other.message === item.message) === index);
  }, [originalPreviewBuild.diagnostics, originalPreviewRuntimeDiagnostics]);
  const originalPreviewErrors = originalPreviewDiagnostics.filter(item => item.severity === 'error').length;
  const originalPreviewWarnings = originalPreviewDiagnostics.length - originalPreviewErrors;
  useEffect(() => {
    setOriginalPreviewRuntimeDiagnostics([]);
    setIsOriginalPreviewDiagnosticsOpen(false);
  }, [sourceHtml, sourceHtmlPath, sourceFiles]);
  const browserSrcDoc = useMemo(() => {
    const inject = `${CANVAS_NAVIGATION_BRIDGE}\n${designEditorScript}`;
    const html = originalPreviewBuild.html;
    const bodyClose = html.toLowerCase().lastIndexOf('</body>');
    if (bodyClose >= 0) return html.slice(0, bodyClose) + inject + html.slice(bodyClose);
    return html + inject;
  }, [originalPreviewBuild.html, designEditorScript]);

  const handleDesignFrameLoad = useCallback(() => {
    if (!isDesignMode || !designSelection?.selector) return;
    browserFrameRef.current?.contentWindow?.postMessage({
      type: 'DESIGN_EDITOR_RESTORE', selector: designSelection.selector, source: 'vacuus-ui-designer-host'
    }, '*');
  }, [isDesignMode, designSelection?.selector]);

  // Emulated RmlUi srcdoc
  const emulatedSrcDoc = useMemo(() => {
    const rmlDocument = sourceRml.trim() ? sourceRml : convertedRml;
    const bodyMatch = rmlDocument.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    const bodyInner = bodyMatch ? bodyMatch[1] : rmlDocument.replace(/<\/?rml\b[^>]*>/gi, '');
    const cleanedBody = rewriteHtmlResourceUrls(cleanHtml(bodyInner), previewAssetUrls);

    // For imported native RML/RCSS, preview those files directly instead of converting them as browser HTML/CSS.
    // The transformation only approximates VaCuus in an iframe; exported source stays unchanged.
    const rcssSource = sourceRml.trim() ? sourceRcss : convertedRcss;
    const sanitizedRcss = rewriteRcssForBrowser(sourceRml.trim() ? normalizeNativeRcssFontFamilies(rcssSource) : rcssSource, previewAssetUrls);
    const previewBaseRcss = sourceRml.trim() && /vacuus-base\.rcss/i.test(sourceRcss) ? '' : rewriteRcssForBrowser(vacuusBaseRcss, previewAssetUrls);

    // Режим отладки CSS: Thin borders with semantic colors + zero-dim warning outlines
    const debugStyles = isDebugViewActive ? `
    body.rml-debug-active * {
      cursor: crosshair !important;
    }

    /* Container blocks */
    body.rml-debug-active div,
    body.rml-debug-active section,
    body.rml-debug-active main,
    body.rml-debug-active header,
    body.rml-debug-active footer,
    body.rml-debug-active nav,
    body.rml-debug-active article,
    body.rml-debug-active aside,
    body.rml-debug-active ul,
    body.rml-debug-active ol,
    body.rml-debug-active li {
      outline: 1px dashed rgba(6, 182, 212, 0.75) !important;
      outline-offset: -1px;
    }

    /* Interactive controls */
    body.rml-debug-active button,
    body.rml-debug-active input,
    body.rml-debug-active select,
    body.rml-debug-active textarea,
    body.rml-debug-active a {
      outline: 1px solid rgba(16, 185, 129, 0.9) !important;
      outline-offset: -1px;
    }

    /* Text & Typography */
    body.rml-debug-active p,
    body.rml-debug-active span,
    body.rml-debug-active h1,
    body.rml-debug-active h2,
    body.rml-debug-active h3,
    body.rml-debug-active h4,
    body.rml-debug-active h5,
    body.rml-debug-active h6,
    body.rml-debug-active label,
    body.rml-debug-active strong,
    body.rml-debug-active em,
    body.rml-debug-active b,
    body.rml-debug-active i,
    body.rml-debug-active small {
      outline: 1px dotted rgba(245, 158, 11, 0.85) !important;
      outline-offset: -1px;
    }

    /* Media & Graphics */
    body.rml-debug-active img,
    body.rml-debug-active svg,
    body.rml-debug-active canvas,
    body.rml-debug-active progress {
      outline: 1px solid rgba(168, 85, 247, 0.9) !important;
      outline-offset: -1px;
    }

    /* Zero Dimensions Warning Highlight */
    body.rml-debug-active .rml-debug-zero-dim {
      outline: 2px dashed #ef4444 !important;
      background-color: rgba(239, 68, 68, 0.25) !important;
      min-width: 14px !important;
      min-height: 14px !important;
      display: inline-block !important;
      position: relative !important;
    }

    /* Hover highlight */
    body.rml-debug-active .rml-debug-hovered {
      outline: 2px solid #38bdf8 !important;
      outline-offset: 0px !important;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.85) !important;
    }

    /* Pinned selection highlight */
    body.rml-debug-active .rml-debug-pinned {
      outline: 2px solid #f59e0b !important;
      outline-offset: 0px !important;
      box-shadow: 0 0 16px rgba(245, 158, 11, 0.95) !important;
    }

    /* Floating tag badge */
    #rml-debug-badge {
      position: fixed;
      pointer-events: none;
      z-index: 999999;
      background: rgba(9, 13, 22, 0.95);
      border: 1px solid #f59e0b;
      color: #fbbf24;
      font-family: "JetBrains Mono";
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.7);
      display: none;
      white-space: nowrap;
    }
    ` : '';

    const debugScript = isDebugViewActive ? `
    <script>
    (function() {
      document.body.classList.add('rml-debug-active');

      const RCSS_SUPPORT_MAP = {
        'display': { status: 'supported-with-limits', notes: 'none, block, inline, inline-block, flex, inline-flex. (Grid/tables NOT supported)' },
        'position': { status: 'supported-with-limits', notes: 'static, relative, absolute, fixed. Absolute relative to positioned ancestor' },
        'top': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'right': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'bottom': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'left': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'z-index': { status: 'supported', notes: 'Integer layering' },
        'width': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'min-width': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'max-width': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'height': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'min-height': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'max-height': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'margin': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'margin-top': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'margin-right': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'margin-bottom': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'margin-left': { status: 'supported', notes: 'Supports px, %, em, rem, auto' },
        'padding': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'padding-top': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'padding-right': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'padding-bottom': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'padding-left': { status: 'supported', notes: 'Supports px, %, em, rem' },
        'box-sizing': { status: 'supported', notes: 'border-box, content-box' },
        'flex': { status: 'supported', notes: 'flex-grow, flex-shrink, flex-basis' },
        'flex-direction': { status: 'supported', notes: 'row, row-reverse, column, column-reverse' },
        'flex-wrap': { status: 'supported', notes: 'nowrap, wrap, wrap-reverse' },
        'justify-content': { status: 'supported', notes: 'flex-start, flex-end, center, space-between, space-around, space-evenly' },
        'align-items': { status: 'supported', notes: 'flex-start, flex-end, center, baseline, stretch' },
        'align-content': { status: 'supported', notes: 'Cross-axis multi-line alignment' },
        'align-self': { status: 'supported', notes: 'Item self cross-axis alignment' },
        'flex-grow': { status: 'supported', notes: 'Numeric factor' },
        'flex-shrink': { status: 'supported', notes: 'Numeric factor' },
        'flex-basis': { status: 'supported', notes: 'Length or auto' },
        'order': { status: 'supported', notes: 'Integer item ordering' },
        'gap': { status: 'supported-with-limits', notes: 'Supported in modern RmlUi; margin fallback recommended' },
        'background': { status: 'supported', notes: 'Colors, decorators, image URLs' },
        'background-color': { status: 'supported', notes: 'Supports hex, rgb, rgba' },
        'border': { status: 'supported', notes: 'width style color supported' },
        'border-top': { status: 'supported', notes: 'Top border supported' },
        'border-right': { status: 'supported', notes: 'Right border supported' },
        'border-bottom': { status: 'supported', notes: 'Bottom border supported' },
        'border-left': { status: 'supported', notes: 'Left border supported' },
        'border-width': { status: 'supported', notes: 'px lengths' },
        'border-color': { status: 'supported', notes: 'hex, rgb, rgba' },
        'border-style': { status: 'supported', notes: 'solid, double, none' },
        'border-radius': { status: 'supported', notes: 'Uniform or per-corner radius' },
        'border-top-left-radius': { status: 'supported', notes: 'Corner radius' },
        'border-top-right-radius': { status: 'supported', notes: 'Corner radius' },
        'border-bottom-left-radius': { status: 'supported', notes: 'Corner radius' },
        'border-bottom-right-radius': { status: 'supported', notes: 'Corner radius' },
        'color': { status: 'supported', notes: 'hex, rgb, rgba' },
        'font-family': { status: 'supported', notes: 'Must match registered fonts in DevUI/Fonts/' },
        'font-size': { status: 'supported', notes: 'Supports px, em, rem' },
        'font-weight': { status: 'supported', notes: '100-900, normal, bold' },
        'font-style': { status: 'supported', notes: 'normal, italic' },
        'text-align': { status: 'supported', notes: 'left, right, center, justify' },
        'text-decoration': { status: 'supported', notes: 'none, underline' },
        'text-transform': { status: 'supported', notes: 'none, capitalize, uppercase, lowercase' },
        'line-height': { status: 'supported', notes: 'normal, numeric, px' },
        'letter-spacing': { status: 'supported', notes: 'Kerning adjustment' },
        'white-space': { status: 'supported', notes: 'normal, pre, nowrap, pre-wrap, pre-line' },
        'word-break': { status: 'supported', notes: 'normal, break-all, break-word' },
        'transform': { status: 'supported', notes: 'translate, scale, rotate' },
        'transform-origin': { status: 'supported', notes: 'x y origin lengths or percentages' },
        'opacity': { status: 'supported', notes: '0.0 to 1.0 (non-compositing per-primitive in RmlUi)' },
        'visibility': { status: 'supported', notes: 'visible, hidden' },
        'overflow': { status: 'supported', notes: 'visible, hidden, auto, scroll' },
        'overflow-x': { status: 'supported', notes: 'visible, hidden, auto, scroll' },
        'overflow-y': { status: 'supported', notes: 'visible, hidden, auto, scroll' },
        'pointer-events': { status: 'supported', notes: 'auto, none' },
        'cursor': { status: 'supported-with-limits', notes: 'pointer, default, arrow' },
        'decorator': { status: 'supported', notes: 'image(), tiled-box(), gradient()' },
        'transition': { status: 'supported-with-limits', notes: 'Timing functions must be exact lowercase: cubic-in, cubic-out, linear' },
        'animation': { status: 'supported-with-limits', notes: 'CSS keyframe animations supported for transform, opacity, colors' },
        'box-shadow': { status: 'parses-not-rendered', notes: '⚠️ CRITICAL: Parses in RCSS, but RmlUi does NOT render shadows in UE5!' },
        'mask-image': { status: 'parses-not-rendered', notes: '⚠️ CRITICAL: mask-image parses, but masking is NOT drawn by RmlUi.' },
        'filter': { status: 'unsupported', notes: '✕ Unsupported: RmlUi lacks GPU post-process blur/filter pipeline.' },
        'backdrop-filter': { status: 'unsupported', notes: '✕ Unsupported: backdrop-filter is not supported by RmlUi.' },
        'grid': { status: 'unsupported', notes: '✕ Unsupported: CSS Grid not supported. Use flex with flex-wrap: wrap.' },
        'grid-template-columns': { status: 'unsupported', notes: '✕ Unsupported: CSS Grid not supported in RmlUi.' },
        'grid-template-rows': { status: 'unsupported', notes: '✕ Unsupported: CSS Grid not supported in RmlUi.' },
        'clip-path': { status: 'unsupported', notes: '✕ Unsupported: clip-path is not supported by RmlUi.' },
        'aspect-ratio': { status: 'unsupported', notes: '✕ Unsupported: Use explicit width/height in RCSS.' }
      };

      const badge = document.createElement('div');
      badge.id = 'rml-debug-badge';
      document.body.appendChild(badge);

      function inspectElement(el) {
        if (!el || el === document.body || el.id === 'rml-debug-badge') return null;
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        const propsMap = new Map();
        try {
          for (let s = 0; s < document.styleSheets.length; s++) {
            try {
              const sheet = document.styleSheets[s];
              const rules = sheet.cssRules || sheet.rules;
              if (!rules) continue;
              for (let r = 0; r < rules.length; r++) {
                const rule = rules[r];
                if (rule.selectorText && el.matches(rule.selectorText)) {
                  const style = rule.style;
                  if (style) {
                    for (let i = 0; i < style.length; i++) {
                      const prop = style[i];
                      const val = style.getPropertyValue(prop);
                      if (val) propsMap.set(prop, val);
                    }
                  }
                }
              }
            } catch (e) {}
          }
        } catch (e) {}

        if (el.style) {
          for (let i = 0; i < el.style.length; i++) {
            const prop = el.style[i];
            const val = el.style.getPropertyValue(prop);
            if (val) propsMap.set(prop, val);
          }
        }

        const essentialProps = ['display', 'position', 'width', 'height', 'color', 'background-color', 'font-family', 'font-size', 'margin', 'padding', 'border', 'opacity'];
        for (let ep = 0; ep < essentialProps.length; ep++) {
          const propName = essentialProps[ep];
          if (!propsMap.has(propName)) {
            const val = computed.getPropertyValue(propName);
            if (val && val !== 'initial') {
              propsMap.set(propName, val);
            }
          }
        }

        const mappedProperties = [];
        propsMap.forEach((val, prop) => {
          const catalogInfo = RCSS_SUPPORT_MAP[prop];
          let status = 'supported';
          let notes = '';

          if (catalogInfo) {
            status = catalogInfo.status;
            notes = catalogInfo.notes;
          } else if (prop.indexOf('-webkit-') === 0 || prop.indexOf('-moz-') === 0) {
            status = 'unsupported';
            notes = 'Vendor-prefixed property not supported in RCSS.';
          } else {
            const knownUnsupported = ['filter', 'backdrop-filter', 'mask', 'clip-path', 'aspect-ratio', 'caret-color', 'perspective', 'object-fit'];
            let isUnsup = false;
            for (let k = 0; k < knownUnsupported.length; k++) {
              if (prop.indexOf(knownUnsupported[k]) !== -1) {
                isUnsup = true;
                break;
              }
            }
            if (isUnsup) {
              status = 'unsupported';
              notes = 'Not supported by RmlUi core.';
            } else {
              status = 'supported';
              notes = 'Mapped standard RCSS property.';
            }
          }

          mappedProperties.push({
            property: prop,
            value: val,
            status: status,
            notes: notes
          });
        });

        const warnings = [];
        if ((rect.width === 0 || rect.height === 0) && computed.display !== 'none') {
          warnings.push({
            type: 'zero-dimension',
            title: 'Нулевой размер элемента (0×0 px)',
            description: 'Элемент имеет нулевой размер (' + Math.round(rect.width) + '×' + Math.round(rect.height) + 'px). В UE5 RmlUi элемент сожмется и не появится на экране. Задайте явную ширину/высоту (width/height, min-width/min-height) или flex-basis.',
            severity: 'error'
          });
        }

        if (computed.display === 'none') {
          warnings.push({
            type: 'display-collapse',
            title: 'Элемент скрыт (display: none)',
            description: 'Элемент исключен из дерева макета RmlUi и не рендерится в движке.',
            severity: 'warning'
          });
        } else if (computed.visibility === 'hidden') {
          warnings.push({
            type: 'display-collapse',
            title: 'Элемент невидим (visibility: hidden)',
            description: 'Элемент занимает место в структуре макета, но его отрисовка отключена.',
            severity: 'warning'
          });
        }

        const tagUpper = el.tagName.toUpperCase();
        let hasText = ['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'BUTTON', 'A'].indexOf(tagUpper) !== -1;
        if (!hasText && el.childNodes.length > 0) {
          for (let n = 0; n < el.childNodes.length; n++) {
            if (el.childNodes[n].nodeType === 3 && el.childNodes[n].textContent.trim().length > 0) {
              hasText = true;
              break;
            }
          }
        }

        if (hasText) {
          const textColor = computed.color;
          if (textColor === 'rgb(0, 0, 0)' || textColor === 'rgba(0, 0, 0, 1)' || textColor === '#000000' || textColor === 'transparent' || textColor === 'rgba(0, 0, 0, 0)') {
            warnings.push({
              type: 'missing-font',
              title: 'Невидимый черный текст на черном фоне UE5',
              description: 'Цвет текста (' + textColor + ') сливается с фоном вьюпорта Unreal Engine! В браузере по умолчанию цвет текста черный. В UE5 RmlUi текст физически рендерится, но невидим. Укажите color: #ffffff в vacuus-base.rcss.',
              severity: 'error'
            });
          }

          const ff = computed.fontFamily || '';
          const supportedFontFamily = ff.split(',').some((part: string) => {
            const family = part.trim().replace(/[\"']/g, '').toLowerCase();
            return family === 'onest' || family === 'tektur' || family === 'jetbrains mono';
          });
          if (!supportedFontFamily) {
            warnings.push({
              type: 'missing-font',
              title: 'Шрифт отсутствует в наборе проекта',
              description: 'Вычисленный шрифт: "' + ff + '". В проекте доступны только Onest, Tektur и JetBrains Mono; для обычного текста используется Onest Regular.',
              severity: 'warning'
            });
          }
        }

        for (let m = 0; m < mappedProperties.length; m++) {
          const p = mappedProperties[m];
          if (p.property === 'box-shadow' && p.value && p.value !== 'none') {
            warnings.push({
              type: 'unrendered-prop',
              title: 'box-shadow не отображается в UE5',
              description: 'Свойство box-shadow успешно читается парсером RCSS, но RmlUi не имеет рендерера для теней. Используйте границы (border) или декоратор-градиент.',
              severity: 'warning'
            });
          }
          if (p.property === 'display' && p.value.indexOf('grid') !== -1) {
            warnings.push({
              type: 'unsupported-prop',
              title: 'CSS Grid не поддерживается в RmlUi',
              description: 'Движок RmlUi не умеет вычислять сетку grid. Замените на display: flex с flex-wrap: wrap.',
              severity: 'error'
            });
          }
          if ((p.property === 'filter' || p.property === 'backdrop-filter') && p.value !== 'none') {
            warnings.push({
              type: 'unsupported-prop',
              title: 'Фильтры blur/backdrop-filter не поддерживаются',
              description: 'В RmlUi нет экранных шейдерных фильтров размытия. Элемент рендерится без размытия.',
              severity: 'info'
            });
          }
        }

        const opacityVal = parseFloat(computed.opacity);
        if (!isNaN(opacityVal) && opacityVal < 1) {
          warnings.push({
            type: 'non-compositing',
            title: 'Некомпозитная прозрачность (opacity: ' + computed.opacity + ')',
            description: 'В RmlUi opacity применяется к каждому примитиву отдельно (не группируется в оффскрин буфер), из-за чего перекрывающиеся дочерние элементы могут просвечивать.',
            severity: 'info'
          });
        }

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || '',
          className: el.className && typeof el.className === 'string' ? el.className : '',
          rect: {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left)
          },
          computedDisplay: computed.display,
          computedPosition: computed.position,
          computedColor: computed.color,
          computedBg: computed.backgroundColor,
          computedFontFamily: computed.fontFamily,
          computedFontSize: computed.fontSize,
          mappedProperties: mappedProperties,
          warnings: warnings,
          textSnippet: (el.textContent || '').trim().slice(0, 50)
        };
      }

      function scanElements() {
        const allNodes = document.body.querySelectorAll('*');
        const summaries = [];
        for (let i = 0; i < allNodes.length; i++) {
          const el = allNodes[i];
          if (el.id === 'rml-debug-badge') continue;
          const r = el.getBoundingClientRect();
          if ((r.width === 0 || r.height === 0) && window.getComputedStyle(el).display !== 'none') {
            el.classList.add('rml-debug-zero-dim');
          } else {
            el.classList.remove('rml-debug-zero-dim');
          }
          const inspected = inspectElement(el);
          if (inspected) summaries.push(inspected);
        }

        if (window.parent) {
          window.parent.postMessage({
            type: 'RML_DEBUG_ALL_ELEMENTS',
            elements: summaries
          }, '*');
        }
      }

      setTimeout(scanElements, 120);

      let currentHovered = null;
      document.body.addEventListener('mouseover', function(e) {
        const target = e.target.closest('*');
        if (!target || target === document.body || target.id === 'rml-debug-badge') return;
        if (currentHovered && currentHovered !== target) {
          currentHovered.classList.remove('rml-debug-hovered');
        }
        currentHovered = target;
        target.classList.add('rml-debug-hovered');

        const r = target.getBoundingClientRect();
        const tag = target.tagName.toLowerCase();
        const idStr = target.id ? '#' + target.id : '';
        const classStr = target.className && typeof target.className === 'string' ? '.' + target.className.trim().split(/\\s+/)[0] : '';
        badge.textContent = '<' + tag + idStr + classStr + '> ' + Math.round(r.width) + '×' + Math.round(r.height) + 'px';
        badge.style.display = 'block';
        badge.style.top = Math.max(5, r.top - 26) + 'px';
        badge.style.left = Math.max(5, r.left) + 'px';

        const info = inspectElement(target);
        if (info && window.parent) {
          window.parent.postMessage({
            type: 'RML_DEBUG_ELEMENT_HOVERED',
            element: info
          }, '*');
        }
      });

      document.body.addEventListener('mouseout', function(e) {
        if (currentHovered) {
          currentHovered.classList.remove('rml-debug-hovered');
          currentHovered = null;
        }
        badge.style.display = 'none';
      });

      document.body.addEventListener('click', function(e) {
        const target = e.target.closest('*');
        if (!target || target === document.body || target.id === 'rml-debug-badge') return;

        e.preventDefault();
        e.stopPropagation();

        const prevPinned = document.body.querySelectorAll('.rml-debug-pinned');
        for (let p = 0; p < prevPinned.length; p++) {
          prevPinned[p].classList.remove('rml-debug-pinned');
        }

        target.classList.add('rml-debug-pinned');
        const info = inspectElement(target);
        if (info && window.parent) {
          window.parent.postMessage({
            type: 'RML_DEBUG_ELEMENT_PINNED',
            element: info
          }, '*');
        }
      }, true);

    })();
    </script>
    ` : '';

    const rmlDesignScript = isRmlDesignMode ? `
    <style>
      body.rml-design-edit, body.rml-design-edit * { cursor: crosshair !important; }
      .rml-design-selected { outline: 2px solid #00d4b5 !important; outline-offset: 1px !important; }
      #rml-design-resize-handle { position: fixed; width: 12px; height: 12px; background: #00d4b5; border: 2px solid #071412; z-index: 2147483647; cursor: nwse-resize !important; display: none; box-sizing: border-box; }
      #rml-design-tag { position: fixed; z-index: 2147483647; background: #071412; color: #00d4b5; border: 1px solid #00d4b5; font: 11px "JetBrains Mono"; padding: 3px 5px; pointer-events: none; display:none; }
    </style>
    <script>
    (function(){
      document.body.classList.add('rml-design-edit');
      var selected=null, start=null, mode='';
      var snapStep=${snapToGrid ? 8 : 1};
      var guideX=document.createElement('div');guideX.id='rml-design-guide-x';guideX.style.cssText='position:fixed;left:0;top:0;width:1px;height:100vh;background:rgba(0,212,181,.7);pointer-events:none;z-index:2147483646;display:none';document.body.appendChild(guideX);
      var guideY=document.createElement('div');guideY.id='rml-design-guide-y';guideY.style.cssText='position:fixed;left:0;top:0;width:100vw;height:1px;background:rgba(0,212,181,.7);pointer-events:none;z-index:2147483646;display:none';document.body.appendChild(guideY);
      var handle=document.createElement('div'); handle.id='rml-design-resize-handle'; document.body.appendChild(handle);
      var tag=document.createElement('div'); tag.id='rml-design-tag'; document.body.appendChild(tag);
      function selectorFor(el){
        if(el.id) return '#'+CSS.escape(el.id);
        var classes=(el.className && typeof el.className==='string') ? el.className.trim().split(/\\s+/).filter(Boolean) : [];
        if(classes.length) return el.tagName.toLowerCase()+'.'+classes.map(function(c){return CSS.escape(c)}).join('.');
        var parts=[], node=el;
        while(node && node!==document.body && parts.length<5){
          var part=node.tagName.toLowerCase();
          if(node.parentElement){ var same=Array.from(node.parentElement.children).filter(function(n){return n.tagName===node.tagName}); if(same.length>1) part+=':nth-of-type('+(same.indexOf(node)+1)+')'; }
          parts.unshift(part); node=node.parentElement;
        }
        return parts.join(' > ');
      }
      function snapshot(el){
        var r=el.getBoundingClientRect(), cs=getComputedStyle(el), sel=selectorFor(el);
        return {selector:sel,tagName:el.tagName.toLowerCase(),id:el.id||'',className:typeof el.className==='string'?el.className:'',text:(el.innerText||el.textContent||'').trim().slice(0,100),styles:{width:Math.round(r.width)+'px',height:Math.round(r.height)+'px',fontSize:cs.fontSize,fontFamily:cs.fontFamily,backgroundColor:cs.backgroundColor,color:cs.color,borderColor:cs.borderColor,opacity:cs.opacity,position:cs.position,left:cs.left,top:cs.top},box:{x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}};
      }
      function publishLayers(){ var nodes=Array.from(document.body.querySelectorAll('*')).filter(function(el){return el!==handle&&el!==tag&&el!==guideX&&el!==guideY&&el.id!=='rml-design-resize-handle'&&el.id!=='rml-design-tag'&&el.tagName!=='SCRIPT'&&el.tagName!=='STYLE'}); parent.postMessage({type:'DESIGN_EDITOR_LAYERS',source:'vacuus-ui-designer',layers:nodes.slice(0,500).map(function(el){var depth=0,p=el.parentElement;while(p&&p!==document.body&&depth<12){depth++;p=p.parentElement;}return {selector:selectorFor(el),tagName:el.tagName.toLowerCase(),id:el.id||'',className:typeof el.className==='string'?el.className:'',text:(el.innerText||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,64),depth:depth};})},'*'); }
      function position(){ if(!selected){guideX.style.display='none';guideY.style.display='none';return;} var r=selected.getBoundingClientRect(); if(start&&start.moved){guideX.style.display='block';guideY.style.display='block';guideX.style.left=Math.round(r.left+r.width/2)+'px';guideY.style.top=Math.round(r.top+r.height/2)+'px';}else{guideX.style.display='none';guideY.style.display='none';} handle.style.display='block'; handle.style.left=Math.max(0,Math.min(innerWidth-12,r.right-6))+'px'; handle.style.top=Math.max(0,Math.min(innerHeight-12,r.bottom-6))+'px'; tag.style.display='block'; tag.textContent=selectorFor(selected); tag.style.left=Math.max(0,r.left)+'px'; tag.style.top=Math.max(0,r.top-22)+'px'; }
      function select(el){ if(!el||el===document.body||el===document.documentElement||el===handle||el===tag)return; if(selected)selected.classList.remove('rml-design-selected'); selected=el; selected.classList.add('rml-design-selected'); position(); parent.postMessage({type:'DESIGN_EDITOR_SELECTED',source:'vacuus-ui-designer',element:snapshot(selected)},'*'); }
      function commit(declarations){ if(!selected)return; parent.postMessage({type:'DESIGN_EDITOR_COMMIT',source:'vacuus-ui-designer',selector:selectorFor(selected),declarations:declarations},'*'); }
      document.addEventListener('click',function(e){ if(e.target===handle)return; var el=e.target.closest('*'); if(!el)return; e.preventDefault();e.stopPropagation();select(el); },true);
      document.addEventListener('pointerdown',function(e){ if(e.target===handle){ if(!selected)return; mode='resize'; } else if(selected && e.target===selected){mode='move';} else {return;} start={x:e.clientX,y:e.clientY,rect:selected.getBoundingClientRect(),left:parseFloat(getComputedStyle(selected).left)||0,top:parseFloat(getComputedStyle(selected).top)||0,moved:false}; try{e.target.setPointerCapture(e.pointerId)}catch(_){} e.preventDefault(); },true);
      document.addEventListener('pointermove',function(e){ if(!start||!selected)return; var dx=Math.round((e.clientX-start.x)/snapStep)*snapStep,dy=Math.round((e.clientY-start.y)/snapStep)*snapStep; if(Math.abs(dx)+Math.abs(dy)>2)start.moved=true; if(mode==='resize'){selected.style.width=Math.max(1,Math.round(start.rect.width+dx))+'px';selected.style.height=Math.max(1,Math.round(start.rect.height+dy))+'px';} else if(mode==='move'){selected.style.position='relative';selected.style.left=(start.left+dx)+'px';selected.style.top=(start.top+dy)+'px';} position(); },true);
      document.addEventListener('pointerup',function(){ if(!start||!selected)return; if(start.moved){var cs=getComputedStyle(selected);if(mode==='resize')commit({width:Math.round(selected.getBoundingClientRect().width)+'px',height:Math.round(selected.getBoundingClientRect().height)+'px'});else commit({position:'relative',left:cs.left,top:cs.top});} start=null;mode='';position();},true);
      window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
      window.addEventListener('load',publishLayers);setTimeout(publishLayers,100);
      window.addEventListener('message',function(event){var msg=event.data;if(!msg||msg.type!=='DESIGN_EDITOR_RESTORE'||typeof msg.selector!=='string')return;try{var target=document.querySelector(msg.selector);if(target)select(target);}catch(_){} });
    })();
    </script>` : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* 1. VaCuus Base Resets — browser approximation only */
    ${getBundledFontFaceBrowserCss()}
    ${previewBaseRcss}

    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      min-height: 100vh;
      background: radial-gradient(circle at 50% 50%, #090d16 0%, #020617 100%);
      color: #f8fafc;
      font-family: "Onest";
      overflow: auto;
    }

    /* 2. Converted RCSS */
    ${sanitizedRcss}

    /* 3. Режим отладки Styles (Thin outlines around RML элементов) */
    ${debugStyles}

  </style>
  ${CANVAS_NAVIGATION_BRIDGE}
</head>
<body>
  ${cleanedBody}
  <script>
    (function() {
      var __fakeStorage = {
        getItem: function() { return null; },
        setItem: function() {},
        removeItem: function() {},
        clear: function() {},
        length: 0,
        key: function() { return null; }
      };
      try {
        Object.defineProperty(window, 'localStorage', { value: __fakeStorage, configurable: true, writable: true });
      } catch (e) {}
      try {
        Object.defineProperty(window, 'sessionStorage', { value: __fakeStorage, configurable: true, writable: true });
      } catch (e) {}
      try {
        ${sourceRml.trim() ? sourceJs : convertedJs}
      } catch(e) {
        console.warn("VaCuus Script error:", e);
      }
    })();
  </script>
  ${debugScript}
  ${rmlDesignScript}
</body>
</html>`;
  }, [sourceRml, sourceRcss, sourceJs, convertedRml, convertedRcss, convertedJs, vacuusBaseRcss, previewAssetUrls, isDebugViewActive, isRmlDesignMode, snapToGrid]);

  // Handle Zoom to Fit
  const handleZoomToFit = useCallback(() => {
    if (!viewportRef.current) return;
    const { clientWidth, clientHeight } = viewportRef.current;

    let targetTotalWidth = frameWidth;
    let targetTotalHeight = frameHeight;

    if (viewMode === 'dual') {
      // Two frames side-by-side with 80px gap + margin
      targetTotalWidth = frameWidth * 2 + 100;
      targetTotalHeight = frameHeight + 120;
    } else {
      targetTotalWidth = frameWidth + 120;
      targetTotalHeight = frameHeight + 120;
    }

    const scaleX = (clientWidth - 80) / targetTotalWidth;
    const scaleY = (clientHeight - 80) / targetTotalHeight;
    const fitZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.15), 1.5);

    // Center content
    const centerX = (clientWidth - targetTotalWidth * fitZoom) / 2;
    const centerY = (clientHeight - targetTotalHeight * fitZoom) / 2 + 20;

    const nextPan = { x: Math.max(20, centerX), y: Math.max(20, centerY) };
    zoomRef.current = fitZoom;
    panRef.current = nextPan;
    setZoom(fitZoom);
    setPan(nextPan);
  }, [frameWidth, frameHeight, viewMode]);

  // Initial fit on mount or viewMode change
  useEffect(() => {
    const timer = setTimeout(() => {
      handleZoomToFit();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, selectedPresetId]);

  // Zoom to 100% (Actual Size)
  const handleZoomActual = useCallback(() => {
    if (!viewportRef.current) return;
    const { clientWidth, clientHeight } = viewportRef.current;
    const nextPan = { x: (clientWidth - frameWidth) / 2, y: (clientHeight - frameHeight) / 2 };
    zoomRef.current = 1.0;
    panRef.current = nextPan;
    setZoom(1.0);
    setPan(nextPan);
  }, [frameWidth, frameHeight]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        handleZoomAtViewportPoint(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
      } else {
        setPan(prev => {
          const next = panCanvasByWheel(prev, e.shiftKey ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY);
          panRef.current = next;
          return next;
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleZoomAtViewportPoint]);

  // Keyboard shortcuts: Space for Hand tool, Shift+1 for Fit, Shift+0 for 100%
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat) {
        setActiveTool('hand');
      } else if (e.code === 'KeyH') {
        setActiveTool('hand');
      } else if (e.code === 'KeyV') {
        setActiveTool('select');
      } else if (e.shiftKey && e.code === 'Digit1') {
        e.preventDefault();
        handleZoomToFit();
      } else if (e.shiftKey && e.code === 'Digit0') {
        e.preventDefault();
        handleZoomActual();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        setCanvasZoom(z => Math.min(3.0, z * 1.2));
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        setCanvasZoom(z => Math.max(0.1, z / 1.2));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleZoomToFit, handleZoomActual, setCanvasZoom]);

  // Pointer drag for canvas panning
  const handlePointerDown = (e: React.PointerEvent) => {
    // Pan and zoom gestures remain available while Active UI stays interactive.
    // Gestures started inside an iframe are forwarded by CANVAS_NAVIGATION_BRIDGE.
    // Pan with Hand tool, middle mouse button (button === 1), or clicking empty canvas
    const isCanvasBg = e.target === viewportRef.current || (e.target as HTMLElement)?.dataset?.canvasBackground === 'true';
    if (activeTool === 'hand' || e.button === 1 || isCanvasBg) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        source: 'host',
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging && dragStartRef.current && dragStartRef.current.source !== 'iframe') {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextPan = { x: dragStartRef.current.startPanX + dx, y: dragStartRef.current.startPanY + dy };
      panRef.current = nextPan;
      setPan(nextPan);
    }

    // Split diff slider dragging
    if (isDraggingSplit && viewportRef.current) {
      const splitFrame = document.getElementById('figma-split-diff-frame');
      if (splitFrame) {
        const rect = splitFrame.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const newPct = Math.min(Math.max((relativeX / rect.width) * 100, 5), 95);
        setDiffSplitPercent(newPct);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging && dragStartRef.current?.source !== 'iframe') {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
    if (isDraggingSplit) {
      setIsDraggingSplit(false);
    }
  };

  // Canvas background pattern style
  const getCanvasBgClass = () => {
    switch (canvasTheme) {
      case 'dots':
        return 'bg-[#18181b] bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:20px_20px]';
      case 'blueprint':
        return 'bg-[#0f172a] bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:32px_32px]';
      case 'checker':
        return 'bg-[#121214] bg-[linear-gradient(45deg,#1c1c20_25%,transparent_25%),linear-gradient(-45deg,#1c1c20_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1c1c20_75%),linear-gradient(-45deg,transparent_75%,#1c1c20_75%)] [background-size:24px_24px] [background-position:0_0,0_12px,12px_-12px,-12px_0px]';
      case 'dark':
      default:
        return 'bg-[#131416]';
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl select-none relative">
      {/* 1. FIGMA TOP TOOLBAR */}
      <div className="preview-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs z-30">
        {/* Left: View Mode Selector */}
        <div className="preview-toolbar-group flex flex-wrap items-center gap-1">
          <div className="flex max-w-full flex-wrap items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5 shadow-inner">
            <button
              disabled={isDesignMode}
              aria-pressed={viewMode === 'dual'}
              onClick={() => setViewMode('dual')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'dual'
                  ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Две рабочие области рядом (как в Figma)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Две области</span>
            </button>
            <button
              disabled={isDesignMode}
              aria-pressed={viewMode === 'split-diff'}
              onClick={() => setViewMode('split-diff')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'split-diff'
                  ? 'bg-purple-600 text-white shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Сравнение наложением по пикселям"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>Сравнение</span>
            </button>
            <button
              disabled={isDesignMode}
              aria-pressed={viewMode === 'emulated-only'}
              onClick={() => setViewMode('emulated-only')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'emulated-only'
                  ? 'bg-cyan-900/80 text-cyan-200 border border-cyan-700/60 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Только эмуляция VaCuus RmlUi"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Эмуляция VaCuus</span>
            </button>
            <button
              disabled={isDesignMode}
              aria-pressed={viewMode === 'browser-only'}
              onClick={() => setViewMode('browser-only')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                viewMode === 'browser-only'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
              title="Только исходный браузер"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Браузер</span>
            </button>
          </div>
        </div>

        {/* Center: Resolution Presets */}
        <div className="preview-toolbar-group flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-300">
            <Sliders className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={isCustomRes ? 'custom' : selectedPresetId}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setIsCustomRes(true);
                } else {
                  setIsCustomRes(false);
                  setSelectedPresetId(e.target.value);
                }
              }}
              className="bg-zinc-950 text-xs text-zinc-100 focus:outline-none cursor-pointer font-mono font-medium"
              style={{ backgroundColor: "#09090b", color: "#f4f4f5", colorScheme: "dark" }}
              aria-label="Разрешение предпросмотра"
            >
              <optgroup label="Игры и HUD Unreal" style={{ backgroundColor: "#09090b", color: "#e4e4e7" }}>
                <option value="1080p" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>1080p FHD (1920 × 1080)</option>
                <option value="1440p" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>1440p 2K (2560 × 1440)</option>
                <option value="4k" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>4K UHD (3840 × 2160)</option>
                <option value="720p" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>720p HD (1280 × 720)</option>
                <option value="deck" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>Steam Deck (1280 × 800)</option>
                <option value="ultrawide" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>21:9 сверхширокий (2560 × 1080)</option>
              </optgroup>
              <optgroup label="Мобильные и адаптивные" style={{ backgroundColor: "#09090b", color: "#e4e4e7" }}>
                <option value="mobile" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>iPhone (390 × 844)</option>
              </optgroup>
              <option value="custom" style={{ backgroundColor: "#09090b", color: "#f4f4f5" }}>Другой размер…</option>
            </select>

            {isCustomRes && (
              <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Math.max(100, parseInt(e.target.value) || 0))}
                  className="w-14 bg-zinc-900 border border-zinc-700 px-1 py-0.5 rounded text-[11px] text-zinc-200 font-mono text-center"
                  placeholder="Ш"
                />
                <span className="text-zinc-500">×</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Math.max(100, parseInt(e.target.value) || 0))}
                  className="w-14 bg-zinc-900 border border-zinc-700 px-1 py-0.5 rounded text-[11px] text-zinc-200 font-mono text-center"
                  placeholder="В"
                />
              </div>
            )}
          </div>

          {/* Reload Canvas */}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
            title="Обновить предпросмотр (R)"
            aria-label="Обновить предпросмотр"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: UI Interactivity Toggle & Mode Info */}
        <div className="preview-toolbar-group flex flex-wrap items-center gap-2">
          {/* Figma-like visual editing toggle. Edits are committed to source CSS. */}
          <button
            onClick={() => {
              const next = !isDesignMode;
              setIsDesignMode(next);
              setIsRmlDesignMode(false);
              setIsInteracting(true);
              setActiveTool('select');
              if (next) {
                setViewMode('browser-only');
                setSelectedFrame('browser');
              } else {
                setDesignSelection(null);
              }
            }}
            aria-pressed={isDesignMode}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition-all shadow-sm ${
              isDesignMode
                ? 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-400 ring-1 ring-fuchsia-500/40'
                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white hover:bg-zinc-800/60'
            }`}
            title="Выберите элемент в области просмотра, перемещайте его, меняйте размер и цвет; изменения записываются в CSS"
          >
            <MousePointer className={`w-3.5 h-3.5 ${isDesignMode ? 'text-fuchsia-300' : 'text-zinc-400'}`} />
            <span>{isDesignMode ? 'Завершить редактирование' : 'Визуальное редактирование'}</span>
          </button>

          <button
            onClick={() => {
              const next = !isRmlDesignMode;
              setIsRmlDesignMode(next);
              setIsDesignMode(false);
              setDesignSelection(null);
              setIsInteracting(true);
              setActiveTool('select');
              if (next) { setViewMode('emulated-only'); setSelectedFrame('emulated'); }
            }}
            aria-pressed={isRmlDesignMode}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold border transition-all shadow-sm ${isRmlDesignMode ? 'bg-cyan-950 text-cyan-200 border-cyan-400 ring-1 ring-cyan-500/40' : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:text-white hover:bg-zinc-800/60'}`}
            title="Редактировать элементы в эмуляции VaCuus RmlUi; изменения записываются в исходные стили и повторно преобразуются в RCSS"
          >
            <Layers className={`w-3.5 h-3.5 ${isRmlDesignMode ? 'text-cyan-300' : 'text-zinc-400'}`} />
            <span>{isRmlDesignMode ? 'Завершить правку RML' : 'Редактор RML'}</span>
          </button>

          {(isDesignMode || isRmlDesignMode) && (
            <button
              onClick={() => setSnapToGrid(value => !value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${snapToGrid ? 'bg-cyan-950 text-cyan-200 border-cyan-500/70' : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'}`}
              title="Привязка перемещения и изменения размеров к сетке 8 px"
              aria-pressed={snapToGrid}
            >
              <Grid className="w-3.5 h-3.5" /><span>{snapToGrid ? 'Сетка 8 px' : 'Без сетки'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsVisualReviewOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-cyan-800 bg-cyan-950/45 px-3 py-1 text-xs font-semibold text-cyan-200 shadow-sm transition-colors hover:border-cyan-500 hover:bg-cyan-900/60"
            title="Проверить скриншоты исходника и VaCuus локальной vision-моделью; изменения не применяются автоматически"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>AI-проверка</span>
          </button>

          {/* Режим отладки Toggle */}
          <button
            onClick={() => {
              setIsDebugViewActive(prev => !prev);
              if (!isDebugViewActive && !isInteracting) {
                setIsInteracting(true);
              }
            }}
            aria-pressed={isDebugViewActive}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-all shadow-sm cursor-pointer ${
              isDebugViewActive
                ? 'bg-amber-950/90 text-amber-300 border-amber-500/80 shadow-amber-950/40 ring-1 ring-amber-500/40'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
            title="Переключить режим отладки: границы элементов RML, сопоставление стилей RCSS и поиск скрытых элементов"
          >
            <Bug className={`w-3.5 h-3.5 ${isDebugViewActive ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-semibold">Режим отладки</span>
            {isDebugViewActive && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                ВКЛ
              </span>
            )}
          </button>

          {/* Interaction Switch */}
          <button
            onClick={() => setIsInteracting(!isInteracting)}
            aria-pressed={isInteracting}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium border transition-all shadow-sm ${
              isInteracting
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:bg-zinc-800/60'
            }`}
            title="Активный UI и навигация работают вместе: клики по элементам доступны, холст перемещается через пробел + перетаскивание или среднюю кнопку, масштаб — Ctrl/⌘+колесо"
          >
            <span className="relative flex h-2 w-2">
              {isInteracting && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isInteracting ? 'bg-emerald-500' : 'bg-zinc-500'}`}></span>
            </span>
            <span className="font-semibold">{isInteracting ? 'Активный UI + навигация по холсту' : 'Навигация по холсту'}</span>
          </button>
        </div>
      </div>

      {/* 2. RULERS (Optional, Figma Style) */}
      {showRulers && (
        <div className="h-4 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between px-3 text-[10px] text-zinc-500 font-mono z-20 shrink-0">
          <div className="flex items-center gap-3">
            <span>X: {Math.round(-pan.x / zoom)}px</span>
            <span>Y: {Math.round(-pan.y / zoom)}px</span>
            <span>Кадр: {frameWidth} × {frameHeight}px</span>
          </div>
          <div className="flex items-center gap-3 text-zinc-400">
            <span>Колесо: перемещение · Ctrl/⌘+колесо: масштаб · Пробел+перетаскивание / средняя кнопка: перемещение</span>
          </div>
        </div>
      )}

      {/* 3. INFINITE FIGMA CANVAS VIEWPORT */}
      <div
        ref={viewportRef}
        data-canvas-background="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex-1 overflow-hidden relative ${getCanvasBgClass()} ${
          activeTool === 'hand' || isDragging
            ? isDragging ? 'cursor-grabbing' : 'cursor-grab'
            : isInteracting ? 'cursor-default' : 'cursor-default'
        }`}
      >
        {/* Transformable Canvas Layer */}
        <div
          ref={canvasRef}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.05s ease-out',
          }}
          className="absolute top-0 left-0 flex items-start gap-16 p-8 pointer-events-auto"
        >
          {/* ======================= MODE A: DUAL ARTBOARDS (SIDE-BY-SIDE) ======================= */}
          {viewMode === 'dual' && (
            <>
              {/* ARTBOARD 1: ORIGINAL BROWSER */}
              <div
                onClick={() => setSelectedFrame('browser')}
                className="flex flex-col shrink-0 select-none"
              >
                {/* Figma Frame Header */}
                <div className="flex items-center justify-between mb-2 px-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                      Исходный веб-браузер
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                      {frameWidth} × {frameHeight}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                      Стандартный DOM / Blink
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-mono">Эталонная спецификация</span>
                    {originalPreviewDiagnostics.length > 0 && (
                      <button type="button" onClick={() => setIsOriginalPreviewDiagnosticsOpen(value => !value)}
                        title={originalPreviewDiagnostics.map(item => `${item.severity.toUpperCase()} ${item.file}: ${item.message}`).join('\n')}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${originalPreviewErrors ? 'text-rose-300 bg-rose-950/60 border-rose-800' : 'text-amber-300 bg-amber-950/50 border-amber-800'}`}>
                        {originalPreviewErrors ? `${originalPreviewErrors} ошибка(и)` : `${originalPreviewWarnings} предупрежд.`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Artboard Frame Box */}
                <div
                  style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                  className={`relative rounded-lg overflow-hidden bg-black shadow-2xl transition-all ${
                    selectedFrame === 'browser'
                      ? 'ring-2 ring-blue-500 shadow-blue-500/10'
                      : 'border-2 border-zinc-700/80 hover:border-zinc-500'
                  }`}
                >
                  <iframe
                    key={`browser-${refreshKey}`}
                    srcDoc={browserSrcDoc}
                    sandbox="allow-scripts"
                    title="Предпросмотр исходного браузера"
                    style={{
                      width: `${frameWidth}px`,
                      height: `${frameHeight}px`,
                      pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                    }}
                    className="border-none w-full h-full bg-black block"
                  />
                  {isOriginalPreviewDiagnosticsOpen && originalPreviewDiagnostics.length > 0 && (
                    <div className="absolute top-2 right-2 z-30 max-w-[min(440px,90%)] max-h-[70%] overflow-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-2xl text-[11px] select-text">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <strong className="text-zinc-100">Диагностика оригинального предпросмотра</strong>
                        <button type="button" onClick={() => setIsOriginalPreviewDiagnosticsOpen(false)} className="text-zinc-400 hover:text-white" aria-label="Закрыть диагностику">✕</button>
                      </div>
                      {originalPreviewDiagnostics.map((item, index) => (
                        <div key={`${item.file}-${item.message}-${index}`} className="border-t border-zinc-800 py-2">
                          <div className={item.severity === 'error' ? 'text-rose-300 font-semibold' : 'text-amber-300 font-semibold'}>{item.severity === 'error' ? 'ОШИБКА' : 'ПРЕДУПРЕЖДЕНИЕ'} · {item.file}</div>
                          <div className="text-zinc-300 whitespace-normal break-words mt-1">{item.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!canInteractWithUi && (
                    <div
                      data-canvas-background="true"
                      className="absolute inset-0 bg-transparent z-10"
                      title="Включите «Интерактивный режим UI» или инструмент «Рука», чтобы нажимать кнопки"
                    />
                  )}
                </div>
              </div>

              {/* Figma Artboard Distance Badge (Gap indicator) */}
              <div className="self-center flex flex-col items-center justify-center text-zinc-600 font-mono text-[10px] opacity-75">
                <div className="h-0.5 w-12 bg-zinc-700 my-1" />
                <span>64 px</span>
                <div className="h-0.5 w-12 bg-zinc-700 my-1" />
              </div>

              {/* ARTBOARD 2: VACUUS RMLUI EMULATION */}
              <div
                onClick={() => setSelectedFrame('emulated')}
                className="flex flex-col shrink-0 select-none"
              >
                {/* Figma Frame Header */}
                <div className="flex items-center justify-between mb-2 px-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-cyan-300 tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      Эмуляция VaCuus RmlUi
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                      {frameWidth} × {frameHeight}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-200 border border-cyan-700/60">
                      HUD для Unreal Engine 5
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                    <span className="text-amber-400 bg-amber-950/40 px-1 rounded border border-amber-800/40">
                      box-shadow отключён
                    </span>
                    <span className="text-cyan-400 bg-cyan-950/40 px-1 rounded border border-cyan-800/40">
                      правила RCSS
                    </span>
                  </div>
                </div>

                {/* Artboard Frame Box */}
                <div
                  style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                  className={`relative rounded-lg overflow-hidden bg-black shadow-2xl transition-all ${
                    selectedFrame === 'emulated'
                      ? 'ring-2 ring-cyan-400 shadow-cyan-400/20'
                      : 'border-2 border-cyan-700/80 hover:border-cyan-500'
                  }`}
                >
                  <iframe
                    key={`emulated-${refreshKey}`}
                    srcDoc={emulatedSrcDoc}
                    sandbox="allow-scripts"
                    title="Предпросмотр VaCuus RmlUi"
                    style={{
                      width: `${frameWidth}px`,
                      height: `${frameHeight}px`,
                      pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                    }}
                    className="border-none w-full h-full bg-black block"
                  />
                  {!canInteractWithUi && (
                    <div
                      data-canvas-background="true"
                      className="absolute inset-0 bg-transparent z-10"
                      title="Включите «Интерактивный режим UI» или инструмент «Рука», чтобы нажимать кнопки"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* ======================= MODE B: SPLIT DIFF SLIDER ======================= */}
          {viewMode === 'split-diff' && (
            <div
              id="figma-split-diff-frame"
              className="flex flex-col shrink-0 select-none relative"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2 px-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-purple-300 tracking-wide flex items-center gap-1.5">
                    <SplitSquareVertical className="w-3.5 h-3.5 text-purple-400" />
                    Сравнение исходника и VaCuus
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                    {frameWidth} × {frameHeight}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Слева: браузер • справа: VaCuus RmlUi
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                  <span>Разделитель: {Math.round(diffSplitPercent)}%</span>
                  <button
                    onClick={() => setDiffSplitPercent(50)}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  >
                    Сбросить на 50%
                  </button>
                </div>
              </div>

              {/* Split Comparison Frame */}
              <div
                style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                className="relative rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-purple-600/80"
              >
                {/* 1. Underlying Right Side: VaCuus Emulated */}
                <div className="absolute inset-0 w-full h-full">
                  <iframe
                    key={`diff-emulated-${refreshKey}`}
                    srcDoc={emulatedSrcDoc}
                    sandbox="allow-scripts"
                    title="Фон VaCuus"
                    style={{
                      width: `${frameWidth}px`,
                      height: `${frameHeight}px`,
                      pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                    }}
                    className="border-none w-full h-full bg-black block"
                  />
                  <div className="absolute top-3 right-3 px-2 py-1 rounded bg-cyan-950/90 border border-cyan-500/80 text-cyan-300 font-mono text-xs z-10 pointer-events-none">
                    ⚡ VaCuus (UE5)
                  </div>
                </div>

                {/* 2. Clipped Left Side: Original Browser */}
                <div
                  style={{ clipPath: `polygon(0 0, ${diffSplitPercent}% 0, ${diffSplitPercent}% 100%, 0 100%)` }}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <iframe
                    key={`diff-browser-${refreshKey}`}
                    srcDoc={browserSrcDoc}
                    sandbox="allow-scripts"
                    title="Передний план исходного браузера"
                    style={{
                      width: `${frameWidth}px`,
                      height: `${frameHeight}px`,
                      pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                    }}
                    className="border-none w-full h-full bg-black block"
                  />
                  <div className="absolute top-3 left-3 px-2 py-1 rounded bg-blue-950/90 border border-blue-500/80 text-blue-300 font-mono text-xs z-10 pointer-events-none">
                    🌐 Исходный браузер
                  </div>
                </div>

                {/* 3. Interactive Splitter Bar */}
                <div
                  style={{ left: `${diffSplitPercent}%` }}
                  onPointerDown={(e) => {
                    setIsDraggingSplit(true);
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    setIsDraggingSplit(false);
                    try {
                      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                    } catch {}
                  }}
                  className="absolute top-0 bottom-0 w-1 bg-purple-400 hover:bg-purple-300 -translate-x-1/2 cursor-ew-resize z-20 flex items-center justify-center transition-colors shadow-lg"
                >
                  <div className="w-6 h-8 rounded-full bg-purple-600 border border-purple-300 flex items-center justify-center shadow-xl text-white text-[10px]">
                    ↔
                  </div>
                </div>

                {!canInteractWithUi && (
                  <div
                    data-canvas-background="true"
                    className="absolute inset-0 bg-transparent z-10"
                  />
                )}
              </div>
            </div>
          )}

          {/* ======================= MODE C: VACUUS EMULATION ONLY ======================= */}
          {viewMode === 'emulated-only' && (
            <div className="flex flex-col shrink-0 select-none">
              <div className="flex items-center justify-between mb-2 px-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-cyan-300 tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Эмуляция VaCuus RmlUi
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {frameWidth} × {frameHeight}
                  </span>
                </div>
              </div>
              <div
                style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                className="relative rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-cyan-600/80"
              >
                <iframe
                  key={`single-emulated-${refreshKey}`}
                  srcDoc={emulatedSrcDoc}
                  sandbox="allow-scripts"
                  title="Предпросмотр VaCuus RmlUi"
                  style={{
                    width: `${frameWidth}px`,
                    height: `${frameHeight}px`,
                    pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                  }}
                  className="border-none w-full h-full bg-black block"
                />
                {isOriginalPreviewDiagnosticsOpen && originalPreviewDiagnostics.length > 0 && (
                  <div className="absolute top-2 right-2 z-30 max-w-[min(440px,90%)] max-h-[70%] overflow-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-2xl text-[11px] select-text">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <strong className="text-zinc-100">Диагностика оригинального предпросмотра</strong>
                      <button type="button" onClick={() => setIsOriginalPreviewDiagnosticsOpen(false)} className="text-zinc-400 hover:text-white" aria-label="Закрыть диагностику">✕</button>
                    </div>
                    {originalPreviewDiagnostics.map((item, index) => (
                      <div key={`${item.file}-${item.message}-${index}`} className="border-t border-zinc-800 py-2">
                        <div className={item.severity === 'error' ? 'text-rose-300 font-semibold' : 'text-amber-300 font-semibold'}>{item.severity === 'error' ? 'ОШИБКА' : 'ПРЕДУПРЕЖДЕНИЕ'} · {item.file}</div>
                        <div className="text-zinc-300 whitespace-normal break-words mt-1">{item.message}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!canInteractWithUi && (
                  <div data-canvas-background="true" className="absolute inset-0 bg-transparent z-10" />
                )}
              </div>
            </div>
          )}

          {/* ======================= MODE D: ORIGINAL BROWSER ONLY ======================= */}
          {viewMode === 'browser-only' && (
            <div className="flex flex-col shrink-0 select-none">
              <div className="flex items-center justify-between mb-2 px-1 text-xs">
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200 tracking-wide flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-zinc-400" />
                      Исходный веб-браузер
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {frameWidth} × {frameHeight}
                    </span>
                  </div>
                  {originalPreviewDiagnostics.length > 0 && (
                    <button type="button" onClick={() => setIsOriginalPreviewDiagnosticsOpen(value => !value)}
                      title={originalPreviewDiagnostics.map(item => `${item.severity.toUpperCase()} ${item.file}: ${item.message}`).join('\n')}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${originalPreviewErrors ? 'text-rose-300 bg-rose-950/60 border-rose-800' : 'text-amber-300 bg-amber-950/50 border-amber-800'}`}>
                      {originalPreviewErrors ? `${originalPreviewErrors} ошибка(и)` : `${originalPreviewWarnings} предупрежд.`}
                    </button>
                  )}
                </div>
              </div>
              <div
                style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                className="relative rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-zinc-700"
              >
                <iframe
                  ref={browserFrameRef}
                  key={`single-browser-${refreshKey}`}
                  srcDoc={browserSrcDoc}
                  onLoad={handleDesignFrameLoad}
                  sandbox="allow-scripts"
                  title="Предпросмотр исходного браузера"
                  style={{
                    width: `${frameWidth}px`,
                    height: `${frameHeight}px`,
                    pointerEvents: (canInteractWithUi || isDesignMode) ? 'auto' : 'none',
                  }}
                  className="border-none w-full h-full bg-black block"
                />
                {!canInteractWithUi && (
                  <div data-canvas-background="true" className="absolute inset-0 bg-transparent z-10" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4. FIGMA FLOATING BOTTOM DOCK / CONTROLS PILL */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 rounded-full px-3 py-1.5 shadow-2xl text-xs text-zinc-200">
          {/* Tool toggle: Pointer vs Hand */}
          <div className="flex items-center bg-zinc-950 rounded-full p-0.5 border border-zinc-800">
            <button
              onClick={() => setActiveTool('select')}
              className={`p-1.5 rounded-full transition-colors ${
                activeTool === 'select' ? 'bg-cyan-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Инструмент перемещения / выделения (V)"
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool('hand')}
              className={`p-1.5 rounded-full transition-colors ${
                activeTool === 'hand' ? 'bg-cyan-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Инструмент «Рука» — перетаскивание холста (H / Space); клики UI приостанавливаются"
            >
              <Hand className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-700/80 mx-0.5" />

          {/* Zoom controls */}
          <button
            onClick={() => setCanvasZoom(z => z / 1.25)}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-full transition-colors"
            title="Уменьшить масштаб (-); работает в интерактивном режиме"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <div className="relative group">
            <button className="px-2 py-0.5 hover:bg-zinc-800 rounded font-mono text-xs text-zinc-200 font-medium">
              {Math.round(zoom * 100)}%
            </button>
            {/* Zoom presets popover */}
            <div className="hidden group-hover:flex flex-col absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1 shadow-2xl min-w-[90px] text-xs">
              {[25, 50, 75, 100, 150, 200].map(pct => (
                <button
                  key={pct}
                  onClick={() => setCanvasZoom(pct / 100)}
                  className="px-2 py-1 text-left hover:bg-zinc-800 rounded text-zinc-300 hover:text-white font-mono"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={Math.round(zoom * 100)}
            onChange={e => setCanvasZoom(Number(e.target.value) / 100)}
            className="w-20 accent-cyan-400 cursor-ew-resize"
            aria-label="Масштаб холста"
            title="Масштаб холста: 10–300%. Доступен при включённом Активном UI"
          />

          <button
            onClick={() => setCanvasZoom(z => z * 1.25)}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-full transition-colors"
            title="Увеличить масштаб (+); работает в интерактивном режиме"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-zinc-700/80 mx-0.5" />

          {/* Вписать всё in view */}
          <button
            onClick={handleZoomToFit}
            className="px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
            title="Вписать всё в область просмотра (Shift+1)"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Вписать всё</span>
          </button>

          {/* 100% 1:1 view */}
          <button
            onClick={handleZoomActual}
            className="px-2 py-1 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
            title="Масштаб 100% (Shift+0)"
          >
            100%
          </button>

          <div className="h-4 w-px bg-zinc-700/80 mx-0.5" />

          {/* Background pattern theme */}
          <div ref={canvasThemeMenuRef} className="relative">
            <button
              onClick={() => setIsCanvasThemeMenuOpen(open => !open)}
              className={`p-1 hover:bg-zinc-800 rounded-full transition-colors ${isCanvasThemeMenuOpen ? 'text-cyan-300 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Стиль сетки холста"
              aria-expanded={isCanvasThemeMenuOpen}
              aria-label="Выбрать стиль холста"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <div className={`${isCanvasThemeMenuOpen ? 'flex' : 'hidden'} flex-col absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-900 border border-zinc-700 rounded-lg p-1 shadow-2xl min-w-[170px] text-xs z-50`}>
              <button
                onClick={() => { setCanvasTheme('dots'); setIsCanvasThemeMenuOpen(false); }}
                className={`px-2 py-1 text-left rounded flex items-center justify-between ${
                  canvasTheme === 'dots' ? 'bg-cyan-950 text-cyan-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>Точки (Figma)</span>
                {canvasTheme === 'dots' && <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={() => { setCanvasTheme('blueprint'); setIsCanvasThemeMenuOpen(false); }}
                className={`px-2 py-1 text-left rounded flex items-center justify-between ${
                  canvasTheme === 'blueprint' ? 'bg-cyan-950 text-cyan-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>Сетка Blueprint UE5</span>
                {canvasTheme === 'blueprint' && <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={() => { setCanvasTheme('checker'); setIsCanvasThemeMenuOpen(false); }}
                className={`px-2 py-1 text-left rounded flex items-center justify-between ${
                  canvasTheme === 'checker' ? 'bg-cyan-950 text-cyan-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>Шахматная сетка</span>
                {canvasTheme === 'checker' && <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={() => { setCanvasTheme('dark'); setIsCanvasThemeMenuOpen(false); }}
                className={`px-2 py-1 text-left rounded flex items-center justify-between ${
                  canvasTheme === 'dark' ? 'bg-cyan-950 text-cyan-300' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>Тёмный фон</span>
                {canvasTheme === 'dark' && <Check className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* 5. MINIMAP (Bottom Right Floating) */}
        {showMinimap && (
          <div className="absolute bottom-5 right-5 z-20 hidden md:block">
            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-2 shadow-2xl w-36 h-24 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                <span className="flex items-center gap-1">
                  <Compass className="w-2.5 h-2.5" />
                  МИНИ-КАРТА
                </span>
                <span>{Math.round(zoom * 100)}%</span>
              </div>

              {/* Minimap schematic artboards representation */}
              <div className="flex-1 my-1 bg-zinc-950/80 rounded border border-zinc-800 relative overflow-hidden flex items-center justify-center p-1">
                {viewMode === 'dual' ? (
                  <div className="flex items-center gap-1.5 w-full h-full justify-center">
                    <div className="w-10 h-7 rounded-xs bg-blue-900/60 border border-blue-500/80 shrink-0" />
                    <div className="w-10 h-7 rounded-xs bg-cyan-900/60 border border-cyan-400 shrink-0" />
                  </div>
                ) : (
                  <div className="w-14 h-9 rounded-xs bg-cyan-900/60 border border-cyan-400" />
                )}
              </div>

              <div className="text-[9px] text-zinc-500 text-center font-mono">
                {frameWidth}×{frameHeight}
              </div>
            </div>
          </div>
        )}

        {/* Figma-like properties inspector. Values are written into visual-editor-overrides.css. */}
        {(isDesignMode || isRmlDesignMode) && (
          <aside className="absolute top-3 right-3 bottom-28 z-40 w-[270px] max-w-[calc(100%-24px)] overflow-y-auto rounded-xl border border-fuchsia-500/50 bg-zinc-950/95 shadow-2xl backdrop-blur-md text-xs text-zinc-100">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-3 py-2.5">
              <div className="flex items-center gap-2 font-semibold text-fuchsia-200">
                <Sliders className="h-4 w-4" /> Параметры дизайна
              </div>
              <div className="flex items-center gap-1">
                <button onClick={onUndoVisualEdit} disabled={!canUndoVisualEdit} className="flex items-center gap-1 rounded px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" title="Отменить последнее изменение в редакторе или визуальном режиме">
                  <RotateCcw className="h-3 w-3" /><span>Отменить</span>
                </button>
                <button onClick={onRedoVisualEdit} disabled={!canRedoVisualEdit} className="flex items-center gap-1 rounded px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" title="Повторить последнее отменённое изменение">
                  <Redo2 className="h-3 w-3" /><span>Повторить</span>
                </button>
                <button onClick={() => setDesignSelection(null)} className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-white" title="Снять выделение">×</button>
              </div>
            </div>
            <section className="mx-3 mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between border-b border-zinc-800 px-2.5 py-2"><span className="font-semibold text-zinc-300" >Слои</span><span className="text-[10px] text-zinc-500">{designLayers.length} элементов</span></div>
              <div className="max-h-40 overflow-y-auto py-1">
                {designLayers.length === 0 ? <div className="px-2.5 py-2 text-[10px] text-zinc-500">Включи Визуальное редактирование и дождись построения дерева.</div> : designLayers.map((layer, index) => (
                  <button key={`${layer.selector}-${index}`} onClick={() => { const message = { type: 'DESIGN_EDITOR_RESTORE', selector: layer.selector, source: 'vacuus-ui-designer-host' }; document.querySelectorAll('iframe').forEach(frame => { try { frame.contentWindow?.postMessage(message, '*'); } catch {} }); }} className={`flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-zinc-800 ${designSelection?.selector === layer.selector ? 'bg-cyan-950/70 text-cyan-200' : 'text-zinc-400'}`} style={{ paddingLeft: `${8 + Math.min(layer.depth, 8) * 8}px` }} title={layer.selector}>
                    <Layers className="h-3 w-3 shrink-0 opacity-60" /><span className="w-8 shrink-0 font-mono text-[9px] text-zinc-600">{layer.tagName}</span><span className="truncate text-[10px]">{layer.id ? `#${layer.id}` : layer.className ? `.${layer.className.trim().split(/\s+/).slice(0,2).join('.')}` : layer.text || '(элемент)'}</span>
                  </button>
                ))}
              </div>
            </section>
            {!designSelection ? (
              <div className="p-4 text-zinc-400 leading-relaxed">
                Нажми на элемент на доске, чтобы выделить его. Потяни за сам элемент, чтобы переместить, или за бирюзовый уголок справа снизу, чтобы изменить размер.
              </div>
            ) : (
              <div className="space-y-3 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Выбранный элемент</div>
                  <div className="mt-1 truncate font-mono text-fuchsia-200">{designSelection.selector}</div>
                  <div className="mt-1 truncate text-zinc-500">&lt;{designSelection.tagName}&gt; {designSelection.text || '(без текста)'}</div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">{designSelection.box.width} × {designSelection.box.height} px</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-zinc-400">Ширина (px)
                    <input type="number" min="1" value={designDraft.width} onChange={e => setDesignDraft(d => ({ ...d, width: e.target.value }))} onBlur={() => { const n = Number(designDraft.width); if (designSelection && Number.isFinite(n) && n > 0) onApplyVisualEdit?.(designSelection.selector, { width: `${Math.round(n)}px` }); }} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-zinc-100 outline-none focus:border-fuchsia-400" />
                  </label>
                  <label className="block text-zinc-400">Высота (px)
                    <input type="number" min="1" value={designDraft.height} onChange={e => setDesignDraft(d => ({ ...d, height: e.target.value }))} onBlur={() => { const n = Number(designDraft.height); if (designSelection && Number.isFinite(n) && n > 0) onApplyVisualEdit?.(designSelection.selector, { height: `${Math.round(n)}px` }); }} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-zinc-100 outline-none focus:border-fuchsia-400" />
                  </label>
                  <label className="block text-zinc-400">Размер шрифта (px)
                    <input type="number" min="1" value={designDraft.fontSize} onChange={e => setDesignDraft(d => ({ ...d, fontSize: e.target.value }))} onBlur={() => { const n = Number(designDraft.fontSize); if (designSelection && Number.isFinite(n) && n > 0) onApplyVisualEdit?.(designSelection.selector, { 'font-size': `${Math.round(n)}px` }); }} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-zinc-100 outline-none focus:border-fuchsia-400" />
                  </label>
                  <label className="block text-zinc-400">Непрозрачность
                    <input type="number" min="0" max="1" step="0.05" value={designSelection.styles.opacity || '1'} onChange={e => setDesignSelection(prev => prev ? { ...prev, styles: { ...prev.styles, opacity: e.target.value } } : prev)} onBlur={() => { const n = Number(designSelection.styles.opacity); if (designSelection && Number.isFinite(n)) onApplyVisualEdit?.(designSelection.selector, { opacity: String(Math.max(0, Math.min(1, n))) }); }} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-zinc-100 outline-none focus:border-fuchsia-400" />
                  </label>
                </div>
                <label className="block text-zinc-400">Шрифт интерфейса
                  <select
                    value={UI_FONT_FAMILIES.find(font => (designSelection.styles.fontFamily || '').toLowerCase().includes(font.family.toLowerCase()))?.family || DEFAULT_UI_FONT_FAMILY}
                    onChange={e => {
                      const family = resolveUiFontFamily(e.target.value) || DEFAULT_UI_FONT_FAMILY;
                      setDesignSelection(prev => prev ? { ...prev, styles: { ...prev.styles, fontFamily: family } } : prev);
                      onApplyVisualEdit?.(designSelection.selector, { 'font-family': family });
                    }}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 outline-none focus:border-fuchsia-400"
                  >
                    {UI_FONT_FAMILIES.map(font => <option key={font.family} value={font.family}>{font.label} — {font.role}</option>)}
                  </select>
                </label>
                <div className="space-y-2 border-t border-zinc-800 pt-3">
                  <ColorEditor label="Заливка / фон" value={designSelection.styles.backgroundColor || 'rgba(0,0,0,0)'} onChange={value => onApplyVisualEdit?.(designSelection.selector, { background: value })} />
                  <ColorEditor label="Цвет текста" value={designSelection.styles.color || '#ffffff'} onChange={value => onApplyVisualEdit?.(designSelection.selector, { color: value })} />
                  <ColorEditor label="Цвет границы" value={designSelection.styles.borderColor || '#000000'} onChange={value => onApplyVisualEdit?.(designSelection.selector, { 'border-color': value })} />
                </div>
                <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                  <div className="mb-1 flex items-center justify-between font-semibold text-zinc-300"><span>Проверка RmlUi</span><span className={selectedRmlValidation.some(issue => issue.severity === 'error') ? 'text-red-300' : selectedRmlValidation.length ? 'text-amber-300' : 'text-emerald-300'}>{selectedRmlValidation.some(issue => issue.severity === 'error') ? 'Есть ошибки' : selectedRmlValidation.length ? 'Проверить' : 'Замечаний нет'}</span></div>
                  {selectedRmlValidation.length === 0 ? <p className="text-[10px] leading-relaxed text-zinc-500">Для проверенных свойств явных проблем размера или раскладки не обнаружено. Это статическая проверка, а не подтверждение отрисовки в UE.</p> : <ul className="space-y-1">{selectedRmlValidation.map((issue, index) => <li key={`${issue.property}-${index}`} className={`text-[10px] leading-relaxed ${issue.severity === 'error' ? 'text-red-300' : 'text-amber-200'}`}><code>{issue.property}: {issue.value}</code> — {issue.message}</li>)}</ul>}
                </section>
                <div className="rounded-lg border border-fuchsia-900/70 bg-fuchsia-950/30 p-2 text-[10px] leading-relaxed text-fuchsia-100/80">
                  {isRmlDesignMode ? 'Выбран элемент на VaCuus RmlUi-эмуляции. Правки записываются в исходные стили проекта и заново конвертируются в RCSS; обязательно проверь результат в целевом RmlUi.' : <>Изменения записываются в <code className="text-fuchsia-200">visual-editor-overrides.css</code> и проходят через конвертер вместе с проектом. Переключись на Две области после выключения Визуальное редактирование, чтобы сравнить результат.</>}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* 6. RML DEBUG INSPECTOR PANEL OVERLAY */}
        {isDebugViewActive && (
          <RmlDebugInspector
            element={inspectedElement}
            allElements={allDetectedElements}
            onSelectElement={(el) => setInspectedElement(el)}
            onClose={() => setIsDebugViewActive(false)}
            onClear={() => setInspectedElement(null)}
          />
        )}
        <VisualReviewModal
          isOpen={isVisualReviewOpen}
          onClose={() => setIsVisualReviewOpen(false)}
          sourceHtml={sourceHtml}
          sourceCss={sourceCss}
          targetRml={sourceRml.trim() ? sourceRml : convertedRml}
          targetRcss={sourceRml.trim() ? sourceRcss : convertedRcss}
          deterministicDiagnostics={conversionDiagnostics}
        />
      </div>
    </div>
  );
};
