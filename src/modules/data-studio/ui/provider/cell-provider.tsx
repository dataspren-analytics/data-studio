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
import type { CellContextValue } from "../lib/types";
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
// Cell Provider
// ============================================================================

const CellContext = createContext<CellContextValue | null>(null);

export function CellProvider({ children }: { children: ReactNode }) {
  const { activeFilePath, activeNotebook, updateNotebookCells } = useNotebook();
  const runtime = useRuntime();

  const cells = useMemo(
    () => activeNotebook?.document.cells ?? [],
    [activeNotebook?.document.cells],
  );
  const [selectedCellId, setSelectedCellId] = useState<string | null>(cells[0]?.id ?? null);
  const [runningCellIds, setRunningCellIds] = useState<Set<string>>(new Set());
  const [queuedCellIds, setQueuedCellIds] = useState<Set<string>>(new Set());

  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const nextViewNumberRef = useRef(3);
  const prevFilePathRef = useRef(activeFilePath);

  // Reset cell state when notebook changes
  useEffect(() => {
    if (activeFilePath !== prevFilePathRef.current) {
      setSelectedCellId(cells[0]?.id ?? null);
      setRunningCellIds(new Set());
      setQueuedCellIds(new Set());
      prevFilePathRef.current = activeFilePath;
    }
  }, [activeFilePath, cells]);

  // Reset execution counts when runtime restarts
  const prevIsReadyRef = useRef(runtime.isReady);
  useEffect(() => {
    if (runtime.isReady && !prevIsReadyRef.current && cells.length > 0) {
      updateNotebookCells(
        activeFilePath!,
        cells.map((c) =>
          isCodeCell(c) && c.execution_count != null
            ? { ...c, execution_count: null }
            : c,
        ),
      );
    }
    prevIsReadyRef.current = runtime.isReady;
  }, [runtime.isReady, cells, activeFilePath, updateNotebookCells]);

  // ============================================================================
  // Cell Document Actions
  // ============================================================================

  const updateCells = useCallback(
    (newCells: NotebookCell[]) => {
      if (activeFilePath) updateNotebookCells(activeFilePath, newCells);
    },
    [activeFilePath, updateNotebookCells],
  );

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
      if (afterId) {
        const index = cells.findIndex((c) => c.id === afterId);
        updateCells([...cells.slice(0, index + 1), newCell, ...cells.slice(index + 1)]);
      } else {
        updateCells([...cells, newCell]);
      }
      setSelectedCellId(newCell.id);

      // Focus the new cell's textarea via DOM polling.
      // Radix DropdownMenu steals focus back on close with variable timing,
      // so we keep retrying until focus actually sticks.
      const focusTimer = setInterval(() => {
        const el = document.querySelector(
          `[data-cell-id="${newCell.id}"] textarea`,
        ) as HTMLTextAreaElement | null;
        if (!el) return;
        el.focus();
        if (document.activeElement === el) {
          clearInterval(focusTimer);
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 50);
      setTimeout(() => clearInterval(focusTimer), 3000);
    },
    [cells, updateCells],
  );

  const updateCell = useCallback(
    (id: string, source: string) => {
      updateCells(cells.map((c) => (c.id === id ? { ...c, source } : c)));
    },
    [cells, updateCells],
  );

  const deleteCell = useCallback(
    (id: string) => {
      const filtered = cells.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const emptyCell: CodeCell = {
          id: generateId(),
          cell_type: "code",
          source: "",
          outputs: [],
          execution_count: null,
          metadata: {},
        };
        updateCells([emptyCell]);
      } else {
        updateCells(filtered);
      }
    },
    [cells, updateCells],
  );

  const changeCellType = useCallback(
    (id: string, datasprenType: DataSprenCellType | "markdown") => {
      updateCells(
        cells.map((c): NotebookCell => {
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
        }),
      );
    },
    [cells, updateCells],
  );


  const updateCellMetadata = useCallback(
    (id: string, metadata: Record<string, unknown>) => {
      updateCells(
        cells.map((c) =>
          c.id === id ? { ...c, metadata: { ...c.metadata, ...metadata } } : c,
        ),
      );
    },
    [cells, updateCells],
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
        updateCells(
          cellsRef.current.map((c) =>
            c.id === id ? { ...c, metadata: { ...c.metadata, visualizeData: data } } : c,
          ),
        );
      } catch {
        // Silently catch — DuckDB view may not exist (e.g. after reload)
      }
    },
    [runtime, updateCells],
  );

  const updateAssertConfig = useCallback(
    (id: string, assertConfig: { tests: AssertTest[] }) => {
      updateCells(
        cells.map((c) =>
          c.id === id ? { ...c, metadata: { ...c.metadata, assertConfig } } : c,
        ),
      );
    },
    [cells, updateCells],
  );

  const toggleCellEnabled = useCallback(
    (id: string) => {
      updateCells(
        cells.map((c) =>
          c.id === id
            ? { ...c, metadata: { ...c.metadata, enabled: c.metadata.enabled === false } }
            : c,
        ),
      );
    },
    [cells, updateCells],
  );

  const updateViewName = useCallback(
    (id: string, newName: string) => {
      updateCells(
        cells.map((c) =>
          c.id === id ? { ...c, metadata: { ...c.metadata, viewName: newName } } : c,
        ),
      );
    },
    [cells, updateCells],
  );

  const moveCellUp = useCallback(
    (id: string) => {
      const index = cells.findIndex((c) => c.id === id);
      if (index <= 0) return;
      const newCells = [...cells];
      [newCells[index - 1], newCells[index]] = [newCells[index], newCells[index - 1]];
      updateCells(newCells);
    },
    [cells, updateCells],
  );

  const moveCellDown = useCallback(
    (id: string) => {
      const index = cells.findIndex((c) => c.id === id);
      if (index === -1 || index >= cells.length - 1) return;
      const newCells = [...cells];
      [newCells[index], newCells[index + 1]] = [newCells[index + 1], newCells[index]];
      updateCells(newCells);
    },
    [cells, updateCells],
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

      // Clear outputs for this cell (read latest cells via ref)
      updateCells(cellsRef.current.map((c) =>
        c.id === id ? { ...c, outputs: [], execution_count: execCount } : c,
      ));

      await new Promise((resolve) => setTimeout(resolve, 50));

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

          // Run embedded tests if the SQL cell has assertConfig
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
        // Always update outputs and clear running state — use latest cells via ref
        updateCells(cellsRef.current.map((c) => (c.id === id ? { ...c, outputs } : c)));
        setRunningCellIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        // Refresh viz data after SQL execution if cell has insights configured
        if (cellType === "sql" && cell.metadata.visualizeConfig) {
          refreshVizData(id).catch(() => {});
        }
      }
    },
    [
      updateCells,
      runtime,
      executeAssertTests,
      refreshVizData,
    ],
  );

  const selectNextCell = useCallback(
    (currentId: string) => {
      const currentIndex = cells.findIndex((c) => c.id === currentId);
      if (currentIndex !== -1 && currentIndex < cells.length - 1) {
        setSelectedCellId(cells[currentIndex + 1].id);
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    [cells],
  );

  const runCellAndAdvance = useCallback(
    (id: string, queryOverride?: string) => {
      setQueuedCellIds((prev) => new Set(prev).add(id));
      selectNextCell(id);
      runCell(id, queryOverride);
    },
    [runCell, selectNextCell],
  );

  const runCellTests = useCallback(
    async (id: string) => {
      const cell = cells.find((c) => c.id === id);
      if (!cell || !isCodeCell(cell)) return;

      const tests = cell.metadata.assertConfig?.tests;
      if (!tests || tests.length === 0) return;

      setRunningCellIds((prev) => new Set(prev).add(id));

      const assertResults = await executeAssertTests(tests);
      const assertOutput = createAssertOutput(assertResults);

      // Replace any existing assert output, keep other outputs
      const updatedOutputs = [
        ...cell.outputs.filter(
          (o: CellOutput) =>
            !(o.output_type === "display_data" && "data" in o && (o.data as Record<string, unknown>)?.["application/vnd.dataspren.assert+json"]),
        ),
        assertOutput,
      ];

      updateCells(cells.map((c) => (c.id === id ? { ...c, outputs: updatedOutputs } : c)));
      setRunningCellIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [cells, executeAssertTests, updateCells],
  );

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.shiftKey || e.metaKey) && selectedCellId) {
        const target = e.target as HTMLElement;
        const isInEditor = target instanceof HTMLTextAreaElement;
        if (!isInEditor) {
          e.preventDefault();
          runCellAndAdvance(selectedCellId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCellId, runCellAndAdvance]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue = useMemo<CellContextValue>(
    () => ({
      cells,
      selectedCellId,
      runningCellIds,
      queuedCellIds,
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
      toggleCellEnabled,
      runCellTests,
      updateCellMetadata,
      refreshVizData,
    }),
    [
      cells,
      selectedCellId,
      runningCellIds,
      queuedCellIds,
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
      toggleCellEnabled,
      runCellTests,
      updateCellMetadata,
      refreshVizData,
    ],
  );

  return <CellContext.Provider value={contextValue}>{children}</CellContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useCells(): CellContextValue {
  const context = useContext(CellContext);
  if (!context) {
    throw new Error("useCells must be used within a CellProvider");
  }
  return context;
}
