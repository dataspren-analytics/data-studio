import type {
  ExecutionResult,
  PythonVariable,
  RegisteredFunction,
  TableInfo,
} from "../../core/types";

/**
 * File types supported by the execution backend
 */
export type FileType = "csv" | "parquet" | "json";

/**
 * Information about a file in the data directory
 */
export interface FileInfo {
  /** File name (e.g., "data.csv") */
  name: string;
  /** Full path in Pyodide filesystem (e.g., "/data/data.csv") */
  path: string;
  /** File size in bytes */
  size: number;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * Status of the execution backend
 */
export interface ExecutionStatus {
  /** Whether the backend is currently loading */
  isLoading: boolean;
  /** Whether the basic runtime is ready (e.g., Pyodide loaded) */
  isReady: boolean;
  /** Whether all extensions are ready (e.g., DuckDB initialized) */
  isDuckDBReady: boolean;
  /** S3 storage mount status */
  s3Status: "idle" | "mounting" | "ready" | "error";
  /** Error message if initialization failed */
  error: string | null;
}

/**
 * Event types emitted by the execution backend
 */
export type ExecutionBackendEvent =
  | { type: "status"; data: ExecutionStatus }
  | { type: "files"; data: FileInfo[] };

/**
 * Generic change callback for all execution backend events
 */
export type ExecutionBackendChangeCallback = (event: ExecutionBackendEvent) => void;

/**
 * Runtime execution interface: code execution, introspection, and lifecycle.
 */
export interface IRuntime {
  readonly status: ExecutionStatus;
  init(): Promise<void>;
  runPython(code: string): Promise<ExecutionResult>;
  runSQL(sql: string, viewName?: string): Promise<ExecutionResult>;
  getTables(): Promise<TableInfo[]>;
  getFunctions(): Promise<RegisteredFunction[]>;
  getVariables(): Promise<PythonVariable[]>;
  reset(): Promise<void>;
  dispose(): void;
  onChange(callback: ExecutionBackendChangeCallback): () => void;
}

/**
 * File system interface: file and directory operations in the runtime storage.
 */
export interface IRuntimeFileSystem {
  readonly storagePath: string;
  listFiles(): Promise<FileInfo[]>;
  writeFile(name: string, data: ArrayBuffer | Uint8Array, options?: { silent?: boolean }): Promise<string>;
  readFile(name: string): Promise<Uint8Array>;
  deleteFile(name: string): Promise<boolean>;
  fileExists(name: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<boolean>;
  renameDirectory(oldPath: string, newName: string): Promise<void>;
  moveFile(sourcePath: string, targetDir: string): Promise<void>;
  renameFile(path: string, newName: string): Promise<void>;
}

/**
 * Combined interface — execution backends implement both IRuntime and IRuntimeFileSystem.
 * Kept for backward compatibility.
 */
export interface IExecutionBackend extends IRuntime, IRuntimeFileSystem {}
