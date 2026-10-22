import React, { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  Search,
  FileCode,
  Code,
  FileType,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface CodeEditorProps {
  title: string;
  badge?: string;
  value: string;
  onChange?: (val: string) => void;
  language?: 'html' | 'css' | 'js' | 'xml' | 'markdown' | 'json' | 'cpp';
  readOnly?: boolean;
  highlightLine?: number | null;
  actions?: React.ReactNode;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  title,
  badge,
  value,
  onChange,
  language = 'xml',
  readOnly = false,
  highlightLine = null,
  actions,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = value.split('\n');
  const lineCount = lines.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  // Scroll to highlightLine if requested
  useEffect(() => {
    if (highlightLine && textareaRef.current) {
      const lineHeight = 20; // approximate line height in px
      textareaRef.current.scrollTop = Math.max(0, (highlightLine - 5) * lineHeight);
    }
  }, [highlightLine]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
      {/* Editor Header Bar */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="safe-wrap font-semibold text-zinc-200">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-cyan-400 font-mono border border-zinc-700">
              {badge}
            </span>
          )}
          {readOnly && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1 rounded">
              Сгенерированный файл
            </span>
          )}
        </div>

        <div className="flex max-w-full shrink-0 items-center gap-1.5">
          {actions}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ${
              showSearch ? 'bg-zinc-800 text-cyan-400' : ''
            }`}
            title="Поиск по файлу"
            aria-label="Поиск по коду"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Копировать код"
            aria-label="Копировать код"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-[11px]">Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">Копировать</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Optional Search Bar */}
      {showSearch && (
        <div className="px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск в коде…"
            className="bg-transparent text-xs text-zinc-200 focus:outline-none flex-1 font-mono"
            autoFocus
          />
          {searchQuery && (
            <span className="text-[10px] text-zinc-500 font-mono">
              {lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase())).length} matches
            </span>
          )}
        </div>
      )}

      {/* Editor Main Content: Line Numbers + Textarea */}
      <div className="relative flex-1 flex overflow-hidden font-mono text-xs">
        {/* Line numbers gutter */}
        <div className="w-12 py-3 bg-zinc-900/60 border-r border-zinc-800/80 text-zinc-600 select-none text-right pr-2 font-mono text-[11px] leading-5 overflow-hidden">
          {Array.from({ length: lineCount }).map((_, i) => {
            const lineNum = i + 1;
            const isHighlight = highlightLine === lineNum;
            return (
              <div
                key={lineNum}
                className={isHighlight ? 'text-cyan-400 font-bold bg-cyan-950/80 -mr-2 pr-2' : ''}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange && onChange(e.target.value)}
          spellCheck={false}
          className={`flex-1 p-3 bg-transparent text-zinc-200 focus:outline-none resize-none font-mono text-[12px] leading-5 whitespace-pre overflow-auto ${
            readOnly ? 'cursor-default text-zinc-300' : ''
          }`}
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
        <div>
          <span>{lineCount} строк</span>
          <span className="mx-2">•</span>
          <span>{value.length} символов</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{language.toUpperCase()}</span>
          <span>•</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
};
