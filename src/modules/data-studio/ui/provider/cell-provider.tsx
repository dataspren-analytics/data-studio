"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getCellType,
  getExecutableSource,
  getSourceString,
  extractTableData,
  isCodeCell,
  createAssertOutput,
  createImageOutput,
  createTableOutput,
  type AssertResult,
  type AssertTest,
  type CellOutput,
  type CodeCell,
  type MarkdownCell,
  type DataSprenCellType,
  type ErrorOutput,
  type NotebookCell,
  type StreamOutput,
  type VisualizeConfig,
} from "../../runtime";
import type { CellDataContextValue, CellActionsContextValue } from "../lib/types";
import { generateId, generateTestSQL } from "../lib/utils";
import {
  buildVizQuery,
  computeEffectiveVizConfig,
  computeNeedsAggregation,
} from "../components/cells/viz-utils";
import { useNotebook } from "./notebook-provider";
import { useRuntime } from "./runtime-provider";

// ============================================================================
// Helper Functions
// ============================================================================

function createCell(datasprenType: DataSprenCellType, viewNumber?: number): CodeCell {
  return {
    id: generateId(),
    cell_type: "code",
    source: datasprenType === "sql" ? "%sql\n" : "",
    outputs: [],
    execution_count: null,
    metadata: {
      viewName: datasprenType === "sql" ? `t${viewNumber ?? 1}` : undefined,
    },
  };
}

function getMaxExecutionCount(cells: NotebookCell[]): number {
  return Math.max(0, ...cells.map((c) => (isCodeCell(c) ? (c.execution_count ?? 0) : 0)));
}

// ============================================================================
// Contexts
// ============================================================================

const CellDataContext = createContext<CellDataContextValue | null>(null);
const CellActionsContext = createContext<CellActionsContextValue | null>(null);

// ============================================================================
// Cell Provider
// ============================================================================

export function CellProvider({ children }: { children: ReactNode }) {
  const { activeFilePath, activeNotebook, updateNotebookCells } = useNotebook();
  const runtime = useRuntime();

  const [cells, setCells] = useState<NotebookCell[]>(
    () => activeNotebook?.document.cells ?? [],
  );
  const [selectedCellId, setSelectedCellId] = useState<string | null>(cells[0]?.id ?? null);
  const [runningCellIds, setRunningCellIds] = useState<Set<string>>(new Set());
  const [queuedCellIds, setQueuedCellIds] = useState<Set<string>>(new Set());

  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const nextViewNumberRef = useRef(3);
  const prevFilePathRef = useRef(activeFilePath);

  const lastPersistedRef = useRef<NotebookCell[] | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const incoming = activeNotebook?.document.cells;
    if (incoming && incoming !== lastPersistedRef.current) {
      setCells(incoming);
    }
  }, [activeNotebook?.document.cells]);

  useEffect(() => {
    if (activeFilePath !== prevFilePathRef.current) {
      setSelectedCellId(cells[0]?.id ?? null);
      setRunningCellIds(new Set());
      setQueuedCellIds(new Set());
      prevFilePathRef.current = activeFilePath;
    }
  }, [activeFilePath, cells]);

  const schedulePersist = useCallback(() => {
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      if (activeFilePath) {
        lastPersistedRef.current = cellsRef.current;
        updateNotebookCells(activeFilePath, cellsRef.current);
      }
    }, 300);
  }, [activeFilePath, updateNotebookCells]);

  useEffect(() => () => clearTimeout(persistTimerRef.current), []);

  const persistNow = useCallback(() => {
    clearTimeout(persistTimerRef.current);
    if (activeFilePath) {
      queueMicrotask(() => {
        lastPersistedRef.current = cellsRef.current;
        updateNotebookCells(activeFilePath, cellsRef.current);
      });
    }
  }, [activeFilePath, updateNotebookCells]);

  const prevIsReadyRef = useRef(runtime.isReady);
  useEffect(() => {
    if (runtime.isReady && !prevIsReadyRef.current && cellsRef.current.length > 0) {
      setCells(prev => prev.map((c) =>
        isCodeCell(c) && c.execution_count != null
          ? { ...c, execution_count: null }
          : c,
      ));
      persistNow();
    }
    prevIsReadyRef.current = runtime.isReady;
  }, [runtime.isReady, persistNow]);

  // ============================================================================
  // Cell Document Actions — all use functional updaters (no stale closures)
  // ============================================================================

  const addCell = useCallback(
    (type: DataSprenCellType | "markdown" = "python", afterId?: string) => {
      let newCell: NotebookCell;
      if (type === "markdown") {
        newCell = {
          id: generateId(),
          cell_type: "markdown",
          source: "",
          metadata: {},
        } satisfies MarkdownCell;
      } else {
        newCell = createCell(type, nextViewNumberRef.current++);
      }
      setCells(prev => {
        if (afterId) {
          const index = prev.findIndex((c) => c.id === afterId);
          return [...prev.slice(0, index + 1), newCell, ...prev.slice(index + 1)];
        }
        return [...prev, newCell];
      });
      schedulePersist();
      setSelectedCellId(newCell.id);

    },
    [schedulePersist],
  );

  const updateCell = useCallback(
    (id: string, source: string) => {
      setCells(prev => prev.map((c) => (c.id === id ? { ...c, source } : c)));
      schedulePersist();
    },
    [schedulePersist],
  );

  const deleteCell = useCallback(
    (id: string) => {
      setCells(prev => {
        const filtered = prev.filter((c) => c.id !== id);
        if (filtered.length === 0) {
          return [{
            id: generateId(),
            cell_type: "code",
            source: "",
            outputs: [],
            execution_count: null,
            metadata: {},
          } as CodeCell];
        }
        return filtered;
      });
      schedulePersist();
    },
    [schedulePersist],
  );

  const changeCellType = useCallback(
    (id: string, datasprenType: DataSprenCellType | "markdown") => {
      setCells(prev => prev.map((c): NotebookCell => {
        if (c.id !== id) return c;
        if (datasprenType === "markdown") {
          return {
            id: c.id,
            cell_type: "markdown",
            source: getExecutableSource(c.source),
            metadata: {},
          } satisfies MarkdownCell;
        }
        const currentSource = getSourceString(c.source);
        const currentType = getCellType(c.source);
        let newSource: string;
        if (datasprenType === "sql" && currentType !== "sql") {
          newSource = `%sql\n${currentSource}`;
        } else if (datasprenType === "python" && currentType === "sql") {
          newSource = getExecutableSource(c.source);
        } else {
          newSource = currentSource;
        }
        const needsViewName = datasprenType === "sql" && !c.metadata.viewName;
        return {
          id: c.id,
          cell_type: "code",
          source: newSource,
          outputs: [],
          execution_count: null,
          metadata: {
            ...c.metadata,
            viewName: needsViewName ? `t${nextViewNumberRef.current++}` : c.metadata.viewName,
          },
        };
      }));
      schedulePersist();
    },
    [schedulePersist],
  );

  const updateCellMetadata = useCallback(
    (id: string, metadata: Record<string, unknown>) => {
      setCells(prev => prev.map((c) =>
        c.id === id ? { ...c, metadata: { ...c.metadata, ...metadata } } : c,
      ));
      schedulePersist();
    },
    [schedulePersist],
  );

  const refreshVizData = useCallback(
    async (id: string, configOverride?: VisualizeConfig) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell || !isCodeCell(cell)) return;

      const viewName = cell.metadata.viewName;
      if (!viewName) return;

      const tableData = extractTableData(cell.outputs) ?? null;
      if (!tableData || tableData.length === 0) return;

      const vizConfig = configOverride ?? (cell.metadata.visualizeConfig as VisualizeConfig | undefined);
      const effectiveConfig = computeEffectiveVizConfig(tableData, vizConfig);
      if (!effectiveConfig) return;

      const needsAggregation = computeNeedsAggregation(tableData, effectiveConfig);
      const query = buildVizQuery(viewName, effectiveConfig, needsAggregation);

      try {
        const result = await runtime.runSQL(query);
        const data = result.tableData && result.tableData.length > 0 ? result.tableData : null;
        setCells(prev => prev.map((c) =>
          c.id === id ? { ...c, metadata: { ...c.metadata, visualizeData: data } } : c,
        ));
        schedulePersist();
      } catch {
      }
    },
    [runtime, schedulePersist],
  );

  const updateAssertConfig = useCallback(
    (id: string, assertConfig: { tests: AssertTest[] }) => {
      setCells(prev => prev.map((c) =>
        c.id === id ? { ...c, metadata: { ...c.metadata, assertConfig } } : c,
      ));
      schedulePersist();
    },
    [schedulePersist],
  );

  const updateViewName = useCallback(
    (id: string, newName: string) => {
      setCells(prev => prev.map((c) =>
        c.id === id ? { ...c, metadata: { ...c.metadata, viewName: newName } } : c,
      ));
      schedulePersist();
    },
    [schedulePersist],
  );

  const moveCellUp = useCallback(
    (id: string) => {
      setCells(prev => {
        const index = prev.findIndex((c) => c.id === id);
        if (index <= 0) return prev;
        const newCells = [...prev];
        [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
        return newCells;
      });
      schedulePersist();
    },
    [schedulePersist],
  );

  const moveCellDown = useCallback(
    (id: string) => {
      setCells(prev => {
        const index = prev.findIndex((c) => c.id === id);
        if (index === -1 || index >= prev.length - 1) return prev;
        const newCells = [...prev];
        [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
        return newCells;
      });
      schedulePersist();
    },
    [schedulePersist],
  );

  // ============================================================================
  // Cell Execution
  // ============================================================================

  const executeAssertTests = useCallback(
    async (tests: AssertTest[]): Promise<AssertResult[]> => {
      const results: AssertResult[] = [];
      for (const test of tests) {
        if (test.enabled === false) continue;
        const testSQL = generateTestSQL(test);
        try {
          const result = await runtime.runSQL(testSQL);
          const tableData = result.tableData;
          const rowCount = tableData?.length || 0;
          const columns = tableData && tableData.length > 0 ? Object.keys(tableData[0]) : [];
          const rows = tableData?.map((row) => columns.map((col) => row[col]));
          results.push({
            testId: test.id,
            passed: rowCount === 0,
            rowCount,
            rows,
            columns,
            error: result.error,
          });
        } catch (err) {
          results.push({
            testId: test.id,
            passed: false,
            rowCount: 0,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
      return results;
    },
    [runtime],
  );

  const runCell = useCallback(
    async (id: string, queryOverride?: string) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell) return;

      const execCount = getMaxExecutionCount(cellsRef.current) + 1;
      setRunningCellIds((prev) => new Set(prev).add(id));
      setQueuedCellIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      setCells(prev => prev.map((c) =>
        c.id === id ? { ...c, outputs: [], execution_count: execCount } : c,
      ));
      persistNow();

      const outputs: CellOutput[] = [];
      const cellType = getCellType(cell.source);

      try {
        if (cellType === "python") {
          const result = await runtime.runPython(getSourceString(cell.source));
          if (result.error) {
            outputs.push({
              output_type: "error",
              ename: "ExecutionError",
              evalue: result.error,
              traceback: [result.error],
            } as ErrorOutput);
          } else {
            if (result.output)
              outputs.push({
                output_type: "stream",
                name: "stdout",
                text: result.output,
              } as StreamOutput);
            if (result.tableData) outputs.push(createTableOutput(result.tableData, execCount, result.totalRows));
            if (result.imageData) outputs.push(createImageOutput(result.imageData, execCount));
          }
          runtime.refreshFunctions();
          runtime.refreshVariables();
        } else if (cellType === "sql") {
          const queryToRun = queryOverride || getExecutableSource(cell.source);
          const result = await runtime.runSQL(
            queryToRun,
            queryOverride ? undefined : cell.metadata.viewName,
          );
          if (result.error) {
            outputs.push({
              output_type: "error",
              ename: "SQLError",
              evalue: result.error,
              traceback: [result.error],
            } as ErrorOutput);
          } else {
            if (result.output)
              outputs.push({
                output_type: "stream",
                name: "stdout",
                text: result.output,
              } as StreamOutput);
            if (result.tableData) outputs.push(createTableOutput(result.tableData, execCount, result.totalRows));
          }
          runtime.refreshTables();
          runtime.refreshVariables();

          const embeddedTests = cell.metadata.assertConfig?.tests;
          if (embeddedTests && embeddedTests.length > 0) {
            const assertResults = await executeAssertTests(embeddedTests);
            outputs.push(createAssertOutput(assertResults));
          }
        }
      } catch (err) {
        outputs.push({
          output_type: "error",
          ename: "ExecutionError",
          evalue: err instanceof Error ? err.message : String(err),
          traceback: [err instanceof Error ? err.message : String(err)],
        } as ErrorOutput);
      } finally {
        setCells(prev => prev.map((c) => (c.id === id ? { ...c, outputs } : c)));
        persistNow();
        setRunningCellIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        if (cellType === "sql" && cell.metadata.visualizeConfig) {
          refreshVizData(id).catch(() => {});
        }
      }
    },
    [
      runtime,
      executeAssertTests,
      refreshVizData,
      persistNow,
    ],
  );

  const runCellAndAdvance = useCallback(
    (id: string, queryOverride?: string) => {
      setQueuedCellIds((prev) => new Set(prev).add(id));
      const currentCells = cellsRef.current;
      const currentIndex = currentCells.findIndex((c) => c.id === id);
      if (currentIndex !== -1 && currentIndex < currentCells.length - 1) {
        setSelectedCellId(currentCells[currentIndex + 1].id);
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      runCell(id, queryOverride);
    },
    [runCell],
  );

  const runCellTests = useCallback(
    async (id: string) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell || !isCodeCell(cell)) return;

      const tests = cell.metadata.assertConfig?.tests;
      if (!tests || tests.length === 0) return;

      setRunningCellIds((prev) => new Set(prev).add(id));

      const assertResults = await executeAssertTests(tests);
      const assertOutput = createAssertOutput(assertResults);

      setCells(prev => prev.map((c) => {
        if (c.id !== id || !isCodeCell(c)) return c;
        const updatedOutputs = [
          ...c.outputs.filter(
            (o: CellOutput) =>
              !(o.output_type === "display_data" && "data" in o && (o.data as Record<string, unknown>)?.["application/vnd.dataspren.assert+json"]),
          ),
          assertOutput,
        ];
        return { ...c, outputs: updatedOutputs };
      }));
      persistNow();
      setRunningCellIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [executeAssertTests, persistNow],
  );

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.shiftKey || e.metaKey) && selectedCellId) {
        const target = e.target as HTMLElement;
        if (!target.closest?.(".monaco-editor")) {
          e.preventDefault();
          runCellAndAdvance(selectedCellId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCellId, runCellAndAdvance]);

  // ============================================================================
  // Context Values — split for performance
  // ============================================================================

  const dataValue = useMemo<CellDataContextValue>(
    () => ({
      cells,
      selectedCellId,
      runningCellIds,
      queuedCellIds,
    }),
    [cells, selectedCellId, runningCellIds, queuedCellIds],
  );

  const actionsValue = useMemo<CellActionsContextValue>(
    () => ({
      selectCell: setSelectedCellId,
      addCell,
      updateCell,
      deleteCell,
      runCell,
      runCellAndAdvance,
      changeCellType,
      moveCellUp,
      moveCellDown,
      updateViewName,
      updateAssertConfig,
      runCellTests,
      updateCellMetadata,
      refreshVizData,
    }),
    [
      addCell,
      updateCell,
      deleteCell,
      runCell,
      runCellAndAdvance,
      changeCellType,
      moveCellUp,
      moveCellDown,
      updateViewName,
      updateAssertConfig,
      runCellTests,
      updateCellMetadata,
      refreshVizData,
    ],
  );

  return (
    <CellDataContext.Provider value={dataValue}>
      <CellActionsContext.Provider value={actionsValue}>
        {children}
      </CellActionsContext.Provider>
    </CellDataContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useCellData(): CellDataContextValue {
  const context = useContext(CellDataContext);
  if (!context) {
    throw new Error("useCellData must be used within a CellProvider");
  }
  return context;
}

export function useCellActions(): CellActionsContextValue {
  const context = useContext(CellActionsContext);
  if (!context) {
    throw new Error("useCellActions must be used within a CellProvider");
  }
  return context;
}

export function useCells() {
  return { ...useCellData(), ...useCellActions() };
}
