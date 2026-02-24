"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MonacoCodeEditor, type MonacoEditorHandle } from "./monaco-code-editor";
import { Check, ChevronDown, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cellTypeConfig, type SelectableCellType } from "../../lib/constants";
import {
  extractAssertResults,
  extractTableData,
  getCellType,
  getSourceString,
  type AssertTest,
  type CodeCell as CodeCellType,
  type DataSprenCellType,
  type TableData,
  type TableInfo,
  type VisualizeConfig,
} from "../../../runtime";
import { useIsDark } from "../../hooks/use-is-dark";
import { CellToolbarActions, CellWrapper } from "./cell-chrome";
import { CellOutput } from "./cell-output";
import { InsightsPanel } from "./insights-panel";
import { TestPanel } from "./test-panel";

export interface CodeCellProps {
  cell: CodeCellType;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  isRunning: boolean;
  isQueued: boolean;
  isRuntimeReady?: boolean;
  tables?: TableInfo[];
  onSelect: () => void;
  onUpdate: (source: string) => void;
  onDelete: () => void;
  onRun: (queryOverride?: string) => void;
  onChangeType: (type: DataSprenCellType | "markdown") => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateAssertConfig?: (config: { tests: AssertTest[] }) => void;
  onRunTests?: () => void;
  onUpdateViewName?: (newName: string) => void;
  onUpdateMetadata?: (metadata: Record<string, unknown>) => void;
  onRefreshVizData?: (config: VisualizeConfig) => void;
}

export function CodeCell({
  cell,
  isSelected,
  isFirst,
  isLast,
  isRunning,
  isQueued,
  isRuntimeReady = true,
  tables = [],
  onSelect,
  onUpdate,
  onDelete,
  onRun,
  onChangeType,
  onMoveUp,
  onMoveDown,
  onUpdateAssertConfig,
  onRunTests,
  onUpdateViewName,
  onUpdateMetadata,
  onRefreshVizData,
}: CodeCellProps) {
  const isDark = useIsDark();
  const [isEditingViewName, setIsEditingViewName] = useState(false);
  const [editedViewName, setEditedViewName] = useState(cell.metadata.viewName || "");
  const viewNameInputRef = useRef<HTMLInputElement>(null);

  const cellRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorHandle>(null);

  useEffect(() => {
    if (isSelected) {
      if (editorRef.current) {
        editorRef.current.focus();
      } else {
        // Editor hasn't mounted yet (new cell), retry until it's ready 
        const timer = setInterval(() => {
          if (editorRef.current) {
            editorRef.current.focus();
            clearInterval(timer);
          }
        }, 50);
        return () => clearInterval(timer);
      }
    } else if (
      document.activeElement instanceof HTMLElement &&
      cellRef.current?.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }, [isSelected]);

  useEffect(() => {
    if (isEditingViewName && viewNameInputRef.current) {
      viewNameInputRef.current.focus();
      viewNameInputRef.current.select();
    }
  }, [isEditingViewName]);

  const handleViewNameSubmit = useCallback(() => {
    const trimmed = editedViewName.trim();
    if (trimmed && trimmed !== cell.metadata.viewName && onUpdateViewName) {
      onUpdateViewName(trimmed);
    } else {
      setEditedViewName(cell.metadata.viewName || "");
    }
    setIsEditingViewName(false);
  }, [editedViewName, cell.metadata.viewName, onUpdateViewName]);

  const savedTab = cell.metadata.activeTab as string | undefined;
  const [activeTab, setActiveTab] = useState<"results" | "tests" | "insights">(
    savedTab === "tests" || savedTab === "insights" ? savedTab : "results",
  );
  const handleSetActiveTab = useCallback((tab: "results" | "tests" | "insights") => {
    setActiveTab(tab);
    onUpdateMetadata?.({ activeTab: tab });
  }, [onUpdateMetadata]);
  const assertConfig = cell.metadata.assertConfig || { tests: [] };

  const assertResults = useMemo(() => extractAssertResults(cell.outputs) || [], [cell.outputs]);

  const allTestsPassed = assertResults.length > 0 && assertResults.every((r) => r.passed);
  const anyTestsFailed = assertResults.some((r) => !r.passed);
  const hasTests = assertConfig.tests.length > 0;

  const hasError = cell.outputs.some((o) => o.output_type === "error");

  const tableData = useMemo(() => extractTableData(cell.outputs) ?? null, [cell.outputs]);

  const viewExists = cell.metadata.viewName
    ? tables.some((t) => t.name === cell.metadata.viewName)
    : false;

  const viewBadgeStyles = hasError
    ? "text-red-500 bg-red-500/10 hover:bg-red-500/20"
    : viewExists
      ? "text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 dark:text-emerald-300 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
      : "text-neutral-400 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700";

  const errorMessage = useMemo(() => {
    const errorOutput = cell.outputs.find((o) => o.output_type === "error");
    return errorOutput?.output_type === "error" ? errorOutput.evalue : null;
  }, [cell.outputs]);
  const cellType = getCellType(cell.source);
  const isSQL = cellType === "sql";

  const typeConfig = cellTypeConfig[cellType as SelectableCellType] ?? cellTypeConfig.python;
  const hasOutput = cell.outputs.length > 0 || isQueued || isRunning;
  const showOutputArea = hasOutput || (isSQL && hasTests);

  const cellSource = useMemo(() => getSourceString(cell.source), [cell.source]);

  const lastSyncedRef = useRef(cellSource);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSourceChange = useCallback((value: string) => {
    lastSyncedRef.current = value;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => onUpdate(value), 300);
  }, [onUpdate]);

  useEffect(() => () => clearTimeout(syncTimerRef.current), []);

  useEffect(() => {
    if (cellSource !== lastSyncedRef.current) {
      lastSyncedRef.current = cellSource;
      editorRef.current?.replaceContent(cellSource);
    }
  }, [cellSource]);

  const handleRunCell = useCallback(() => {
    if (!isRuntimeReady || !editorRef.current) return;
    clearTimeout(syncTimerRef.current);
    const content = editorRef.current.getContent();
    lastSyncedRef.current = content;
    onUpdate(content);

    const selection = editorRef.current.getSelection();
    if (selection && cellType === "sql") {
      onRun(selection);
    } else {
      onRun();
    }
  }, [isRuntimeReady, onRun, onUpdate, cellType]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      handleRunCell();
    }
  }, [handleRunCell]);

  return (
    <div ref={cellRef} className="relative" data-cell-id={cell.id}>
      <span className="absolute -left-14 top-1.5 w-12 text-right text-xs text-neutral-400 dark:text-neutral-500 select-none">
        [{cell.execution_count ?? " "}]
      </span>

      <CellWrapper isSelected={isSelected} isRunning={isRunning} isQueued={isQueued} onSelect={onSelect}>
        <div className="relative z-20 flex items-center gap-1 px-3 py-1.5 border-b border-neutral-200/50 dark:border-border/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRunCell();
            }}
            disabled={!isRuntimeReady || isRunning}
            className="p-1 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 dark:text-neutral-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-950 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isRuntimeReady ? "Run cell (Shift+Enter)" : "Runtime is loading..."}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin text-white" /> : <Play size={14} />}
          </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors"
            >
              <typeConfig.icon size={12} />
              <span>{typeConfig.label}</span>
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[120px]">
            {(Object.keys(cellTypeConfig) as SelectableCellType[]).map((type) => {
              const config = cellTypeConfig[type];
              return (
                <DropdownMenuItem
                  key={type}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeType(type);
                  }}
                  className="text-xs"
                >
                  <config.icon size={12} />
                  <span>{config.label}</span>
                  {cellType === type && <Check size={12} className="ml-auto" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {cell.metadata.viewName &&
          (isEditingViewName ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">View:</span>
              <input
                ref={viewNameInputRef}
                type="text"
                value={editedViewName}
                onChange={(e) => setEditedViewName(e.target.value)}
                onBlur={handleViewNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleViewNameSubmit();
                  else if (e.key === "Escape") {
                    setEditedViewName(cell.metadata.viewName || "");
                    setIsEditingViewName(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "min-w-[80px] max-w-[200px] text-[10px] px-1.5 py-0.5 rounded border outline-none",
                  hasError
                    ? "text-red-500 bg-red-500/10 border-red-500/30 focus:border-red-500/50"
                    : viewExists
                      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30 focus:border-emerald-500/50"
                      : "text-neutral-600 bg-neutral-50 border-neutral-200 focus:border-neutral-950/30 dark:text-neutral-300 dark:bg-muted dark:border-border dark:focus:border-ring",
                )}
              />
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditedViewName(cell.metadata.viewName || "");
                setIsEditingViewName(true);
              }}
              className={cn("text-[10px] px-1.5 py-0.5 rounded", viewBadgeStyles)}
              title={`Click to rename view "${cell.metadata.viewName}"`}
            >
              <span className="text-neutral-500 dark:text-neutral-300">View:</span> {cell.metadata.viewName}
            </button>
          ))}

        <div className="flex-1" />

        <CellToolbarActions
          isFirst={isFirst}
          isLast={isLast}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      </div>

      <div
        className="p-3"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onKeyDown={handleKeyDown}
      >
        <MonacoCodeEditor
          ref={editorRef}
          defaultValue={cellSource}
          onChange={handleSourceChange}
          language={cellType === "sql" ? "sql" : "python"}
          minHeight={cellType === "sql" ? 42 : 80}
          autoFocus={isSelected}
          onMount={(editor) => {
            const styleId = "monaco-sql-magic-style";
            if (!document.getElementById(styleId)) {
              const style = document.createElement("style");
              style.id = styleId;
              style.textContent = `.sql-magic-decoration { color: #8b949e !important; }`;
              document.head.appendChild(style);
            }
            const decorations = editor.createDecorationsCollection([]);
            const update = () => {
              const model = editor.getModel();
              if (!model) return;
              const matches = model.findMatches("%%?sql\\b", false, true, false, null, false);
              decorations.set(
                matches.map((m) => ({
                  range: m.range,
                  options: { inlineClassName: "sql-magic-decoration" },
                })),
              );
            };
            update();
            editor.onDidChangeModelContent(update);
          }}
        />
      </div>

      {showOutputArea && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-muted/50 overflow-hidden rounded-b-lg">
          {isSQL && (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleSetActiveTab("results")}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  activeTab === "results"
                    ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                    : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
                )}
              >
                Results
              </button>
              <button
                onClick={() => handleSetActiveTab("insights")}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  activeTab === "insights"
                    ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                    : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
                )}
              >
                Insights
              </button>
              <button
                onClick={() => handleSetActiveTab("tests")}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5",
                  activeTab === "tests"
                    ? "text-neutral-950 dark:text-foreground border-b-2 border-neutral-950 dark:border-foreground"
                    : "text-neutral-400 dark:text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100",
                )}
              >
                Tests
                {hasTests && (
                  <span className={cn(
                    "text-[10px] px-1 py-px rounded",
                    assertResults.length === 0
                      ? "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                      : allTestsPassed
                        ? "bg-emerald-500/10 text-emerald-500"
                        : anyTestsFailed
                          ? "bg-red-500/10 text-red-500"
                          : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400",
                  )}>
                    {assertConfig.tests.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {isSQL && errorMessage && activeTab !== "results" && (
            <pre className="text-sm font-mono text-red-500 dark:text-red-400 whitespace-pre px-3 py-2 overflow-x-auto w-0 min-w-full border-b border-red-200/50 dark:border-red-900/30">
              {errorMessage}
            </pre>
          )}

          {(!isSQL || activeTab === "results") && (
            <CellOutput
              cell={cell}
              isQueued={isQueued}
              isRunning={isRunning}
              visibleRows={cell.metadata.visibleRows as number | undefined}
              onChangeVisibleRows={(rows) => onUpdateMetadata?.({ visibleRows: rows })}
            />
          )}

          {isSQL && activeTab === "insights" && (
            <InsightsPanel
              tableData={tableData}
              vizConfig={cell.metadata.visualizeConfig as VisualizeConfig | undefined}
              vizData={(cell.metadata.visualizeData as TableData | null) ?? null}
              isDark={isDark}
              onUpdateVisualizeConfig={(config) => onUpdateMetadata?.({ visualizeConfig: config })}
              onRefreshVizData={onRefreshVizData}
            />
          )}

          {isSQL && activeTab === "tests" && (
            <TestPanel
              assertConfig={assertConfig}
              assertResults={assertResults}
              tables={tables}
              viewName={cell.metadata.viewName}
              isRunning={isRunning}
              isRuntimeReady={isRuntimeReady}
              isDark={isDark}
              onUpdateAssertConfig={onUpdateAssertConfig}
              onRunTests={onRunTests}
            />
          )}

        </div>
      )}
    </CellWrapper>
    </div>
  );
}
