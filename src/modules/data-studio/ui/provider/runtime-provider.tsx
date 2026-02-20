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
import { listOPFSFiles } from "../../runtime/opfs-list";
import type { RuntimeContextValue } from "../lib/types";
import { Button } from "@/components/ui/button";

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
const ExecutionBackendContext = createContext<IExecutionBackend | null>(null);

const TAB_LOCK_NAME = "data-studio-runtime";

interface RuntimeProviderProps {
  execution: IExecutionBackend;
  autoInit?: boolean;
  children: ReactNode;
}

export function RuntimeProvider({ execution, autoInit = true, children }: RuntimeProviderProps) {
  const [tabBlocked, setTabBlocked] = useState(false);

  // Acquire an exclusive Web Lock so only one tab can use the OPFS-backed
  // runtime at a time.  If another tab already holds the lock we show a
  // blocking dialog instead of initialising (which would crash on
  // createSyncAccessHandle).
  useEffect(() => {
    let released = false;

    navigator.locks.request(
      TAB_LOCK_NAME,
      { ifAvailable: true },
      (lock) => {
        if (released) return;
        if (!lock) {
          // Another tab holds the lock.
          setTabBlocked(true);
          return;
        }
        // Lock acquired – hold it for the lifetime of this tab by returning
        // a promise that only resolves on cleanup.
        setTabBlocked(false);
        return new Promise<void>((resolve) => {
          // Store resolve so we can release the lock on unmount.
          releaseRef.current = resolve;
        });
      },
    );

    return () => {
      released = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  const releaseRef = useRef<(() => void) | null>(null);

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

  // Cross-tab file change notifications via BroadcastChannel.
  // When this tab mutates files, it broadcasts so other tabs can refresh.
  // When another tab broadcasts, this tab refreshes its file list.
  const fileChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel("data-studio-files");
    fileChannelRef.current = channel;
    channel.onmessage = () => {
      execution.listFiles().then(setDataFiles);
    };
    return () => {
      channel.close();
      fileChannelRef.current = null;
    };
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

  // Early file listing: read OPFS directly from the main thread so the
  // file tree is visible before the Pyodide worker finishes initializing.
  const earlyLoadDoneRef = useRef(false);
  useEffect(() => {
    if (earlyLoadDoneRef.current) return;
    earlyLoadDoneRef.current = true;
    listOPFSFiles().then((files) => {
      if (files.length > 0) {
        setDataFiles((prev) => (prev.length === 0 ? files : prev));
      }
    });
  }, []);

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

  const broadcastFileChange = useCallback(() => {
    fileChannelRef.current?.postMessage("changed");
  }, []);

  const handleWriteFile = useCallback(
    async (file: File, targetDir?: string): Promise<void> => {
      const arrayBuffer = await file.arrayBuffer();
      const dir = targetDir ?? "/mnt/local";
      await execution.writeFile(getRelativePath(`${dir}/${file.name}`), new Uint8Array(arrayBuffer));
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, broadcastFileChange],
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
        broadcastFileChange();
      }
      return success;
    },
    [execution, broadcastFileChange],
  );

  const handleCreateDirectory = useCallback(
    async (path: string): Promise<void> => {
      await execution.createDirectory(path);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, broadcastFileChange],
  );

  const handleDeleteDirectory = useCallback(
    async (path: string): Promise<boolean> => {
      const success = await execution.deleteDirectory(path);
      if (success) {
        const files = await execution.listFiles();
        setDataFiles(files);
        broadcastFileChange();
      }
      return success;
    },
    [execution, broadcastFileChange],
  );

  const handleRenameDirectory = useCallback(
    async (oldPath: string, newName: string): Promise<void> => {
      await execution.renameDirectory(oldPath, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, broadcastFileChange],
  );

  const handleMoveFile = useCallback(
    async (sourcePath: string, targetDir: string): Promise<void> => {
      await execution.moveFile(sourcePath, targetDir);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, broadcastFileChange],
  );

  const handleRenameFile = useCallback(
    async (path: string, newName: string): Promise<void> => {
      await execution.renameFile(path, newName);
      const files = await execution.listFiles();
      setDataFiles(files);
      broadcastFileChange();
    },
    [execution, broadcastFileChange],
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

  if (tabBlocked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-xl font-semibold tracking-tight">DataStudio</p>
          <p className="text-sm text-muted-foreground">
            DataStudio uses the Origin Private File System for local data
            processing, which only supports a single active session. Please
            close the other tab, then click retry.
          </p>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

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
