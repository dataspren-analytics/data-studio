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
import type {
  ExecutionStatus,
  IExecutionBackend,
  PythonVariable,
  RegisteredFile,
  RegisteredFunction,
  TableInfo,
} from "../../runtime";
import { getRelativePath } from "../../runtime/notebook-utils";
import type { RuntimeContextValue } from "../lib/types";

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
const ExecutionBackendContext = createContext<IExecutionBackend | null>(null);

interface RuntimeProviderProps {
  execution: IExecutionBackend;
  autoInit?: boolean;
  children: ReactNode;
}

export function RuntimeProvider({ execution, autoInit = true, children }: RuntimeProviderProps) {
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>(() => execution.status);
  const [dataFiles, setDataFiles] = useState<import("../../runtime").FileInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [functions, setFunctions] = useState<RegisteredFunction[]>([]);
  const [variables, setVariables] = useState<PythonVariable[]>([]);

  // Subscribe to execution backend events
  useEffect(() => {
    const unsub = execution.onChange((event) => {
      switch (event.type) {
        case "status":
          setExecutionStatus(event.data);
          break;
        case "files":
          setDataFiles(event.data);
          break;
      }
    });
    return unsub;
  }, [execution]);

  // Convert FileInfo to RegisteredFile for UI display
  const registeredFiles = useMemo<RegisteredFile[]>(() => {
    return dataFiles.map((dataFile) => {
      const ext = dataFile.name.split(".").pop()?.toLowerCase();
      const fileType = (ext === "csv" || ext === "parquet" || ext === "json") ? ext : "csv";
      return {
        name: dataFile.name,
        path: dataFile.path,
        size: dataFile.size,
        type: fileType as "csv" | "parquet" | "json",
      };
    });
  }, [dataFiles]);

  // Auto-init runtime
  const initStartedRef = useRef(false);
  useEffect(() => {
    if (autoInit && !initStartedRef.current) {
      initStartedRef.current = true;
      console.log("[RuntimeProvider] Initializing execution backend...");
      execution.init();
    }
  }, [autoInit, execution]);

  // Cleanup on unmount - use a ref to track pending disposal for StrictMode handling
  const disposeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (disposeTimeoutRef.current) {
      console.log("[RuntimeProvider] Cancelling pending disposal (StrictMode remount)");
      clearTimeout(disposeTimeoutRef.current);
      disposeTimeoutRef.current = null;
    }
    return () => {
      disposeTimeoutRef.current = setTimeout(() => {
        console.log("[RuntimeProvider] Disposing execution backend (delayed cleanup)");
        execution.dispose();
        disposeTimeoutRef.current = null;
      }, 100);
    };
  }, [execution]);

  // Refresh helpers
  const refreshTables = useCallback(async () => {
    const tableList = await execution.getTables();
    setTables(tableList);
  }, [execution]);

  const refreshFunctions = useCallback(async () => {
    const functionList = await execution.getFunctions();
    setFunctions(functionList);
  }, [execution]);

  const refreshVariables = useCallback(async () => {
    const variableList = await execution.getVariables();
    setVariables(variableList);
  }, [execution]);

  const refreshFiles = useCallback(async () => {
    const files = await execution.listFiles();
    setDataFiles(files);
  }, [execution]);

  // Load data when runtime is ready
  useEffect(() => {
    if (!executionStatus.isDuckDBReady) return;
    execution.listFiles().then(setDataFiles);
    refreshTables();
    refreshFunctions();
    refreshVariables();
  }, [executionStatus.isDuckDBReady, execution, refreshTables, refreshFunctions, refreshVariables]);

  // ============================================================================
  // File Operations
  // ============================================================================

  const handleWriteFile = useCallback(
    async (file: File, targetDir?: string): Promise<void> => {
      const arrayBuffer = await file.arrayBuffer();
      const dir = targetDir ?? "/mnt/local";
      await execution.writeFile(getRelativePath(`${dir}/${file.name}`), new Uint8Array(arrayBuffer));
      const files = await execution.listFiles();
      setDataFiles(files);
    },
    [execution],
  );

  const handleReadFile = useCallback(
    async (name: string): Promise<Uint8Array> => {
      const path = name.startsWith("/mnt/") ? name : `/mnt/local/${name}`;
      return execution.readFile(getRelativePath(path));
    },
    [execution],
  );

  const handleDeleteFile = useCallback(
    async (name: string): Promise<boolean> => {
      const path = name.startsWith("/mnt/") ? name : `/mnt/local/${name}`;
      const success = await execution.deleteFile(getRelativePath(path));
      if (success) {
        const files = await execution.listFiles();
        setDataFiles(files);
      }
      return success;
    },
    [execution],
  );

  const handleCreateDirectory = useCallback(
    async (path: string): Promise<void> => {
      await execution.createDirectory(path);
      const files = await execution.listFiles();
      setDataFiles(files);
    },
    [execution],
  );

  const handleDeleteDirectory = useCallback(
    async (path: string): Promise<boolean> => {
      const success = await execution.deleteDirectory(path);
      if (success) {
        const files = await execution.listFiles();
        setDataFiles(files);
      }
      return success;
    },
    [execution],
  );

  const handleRenameDirectory = useCallback(
    async (oldPath: string, newName: string): Promise<void> => {
      await execution.renameDirectory(oldPath, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
    },
    [execution],
  );

  const handleMoveFile = useCallback(
    async (sourcePath: string, targetDir: string): Promise<void> => {
      await execution.moveFile(sourcePath, targetDir);
      const files = await execution.listFiles();
      setDataFiles(files);
    },
    [execution],
  );

  const handleRenameFile = useCallback(
    async (path: string, newName: string): Promise<void> => {
      await execution.renameFile(path, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
    },
    [execution],
  );

  // ============================================================================
  // Execution
  // ============================================================================

  const handleRunSQL = useCallback(
    async (sql: string, viewName?: string) => execution.runSQL(sql, viewName),
    [execution],
  );

  const handleRunPython = useCallback(
    async (code: string) => execution.runPython(code),
    [execution],
  );

  const handleReset = useCallback(async () => {
    setTables([]);
    setFunctions([]);
    setVariables([]);
    console.log("[RuntimeProvider] Resetting execution backend...");
    await execution.reset();
    await execution.init();
    console.log("[RuntimeProvider] Reset complete");
    await refreshTables();
  }, [execution, refreshTables]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value = useMemo<RuntimeContextValue>(
    () => ({
      isReady: executionStatus.isDuckDBReady,
      isLoading: executionStatus.isLoading,
      error: executionStatus.error,
      s3Status: executionStatus.s3Status,
      dataFiles,
      registeredFiles,
      tables,
      functions,
      variables,
      writeFile: handleWriteFile,
      readFile: handleReadFile,
      deleteFile: handleDeleteFile,
      createDirectory: handleCreateDirectory,
      deleteDirectory: handleDeleteDirectory,
      renameDirectory: handleRenameDirectory,
      moveFile: handleMoveFile,
      renameFile: handleRenameFile,
      runSQL: handleRunSQL,
      runPython: handleRunPython,
      refreshTables,
      refreshFunctions,
      refreshVariables,
      refreshFiles,
      reset: handleReset,
    }),
    [
      executionStatus.isDuckDBReady, executionStatus.isLoading, executionStatus.error, executionStatus.s3Status,
      dataFiles, registeredFiles, tables, functions, variables,
      handleWriteFile, handleReadFile, handleDeleteFile,
      handleCreateDirectory, handleDeleteDirectory, handleRenameDirectory,
      handleMoveFile, handleRenameFile, handleRunSQL, handleRunPython,
      refreshTables, refreshFunctions, refreshVariables, refreshFiles, handleReset,
    ],
  );

  return (
    <ExecutionBackendContext.Provider value={execution}>
      <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
    </ExecutionBackendContext.Provider>
  );
}

export function useRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error("useRuntime must be used within a RuntimeProvider");
  return context;
}

/** @internal Used by NotebookProvider and CellProvider for direct backend access */
export function useExecutionBackend(): IExecutionBackend {
  const context = useContext(ExecutionBackendContext);
  if (!context) throw new Error("useExecutionBackend must be used within a RuntimeProvider");
  return context;
}
