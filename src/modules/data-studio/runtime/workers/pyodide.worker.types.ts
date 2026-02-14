/**
 * Worker communication protocol types.
 *
 * This file only contains types for the postMessage protocol between
 * the main thread and the Pyodide worker.
 */

import type {
  ExecutionResult,
  PythonVariable,
  RegisteredFunction,
  TableInfo,
} from "../core/types";
import type { FileInfo } from "./device";

export type { PythonVariable, RegisteredFunction, TableInfo };
export type { TableColumn } from "../core/types";

export type PyodideExecutionResult = ExecutionResult;

// Re-export FileInfo from device.ts (the single source of truth for storage types)
export type { FileInfo };

// ============================================================================
// Worker Request Types (Main Thread → Worker)
// ============================================================================

export type WorkerRequest =
  | { type: "init"; id: string }
  | { type: "runPython"; id: string; code: string }
  | { type: "runSQL"; id: string; sql: string; viewName?: string }
  | { type: "getTables"; id: string }
  | { type: "getFunctions"; id: string }
  | { type: "getVariables"; id: string }
  // File operations (backed by OPFS)
  | { type: "listFiles"; id: string }
  | { type: "writeFile"; id: string; name: string; data: ArrayBuffer }
  | { type: "readFile"; id: string; name: string }
  | { type: "deleteFile"; id: string; name: string }
  | { type: "fileExists"; id: string; name: string }
  // Directory operations
  | { type: "createDirectory"; id: string; path: string }
  | { type: "deleteDirectory"; id: string; path: string }
  | { type: "renameDirectory"; id: string; oldPath: string; newName: string }
  // Move/rename file operations
  | { type: "moveFile"; id: string; sourcePath: string; targetDir: string }
  | { type: "renameFile"; id: string; path: string; newName: string };

// ============================================================================
// Worker Response Types (Worker → Main Thread)
// ============================================================================

export type WorkerResponse =
  | { type: "init"; id: string; success: true }
  | { type: "init"; id: string; success: false; error: string }
  | { type: "runPython"; id: string; result: PyodideExecutionResult }
  | { type: "runSQL"; id: string; result: PyodideExecutionResult }
  | { type: "getTables"; id: string; tables: TableInfo[] }
  | { type: "getFunctions"; id: string; functions: RegisteredFunction[] }
  | { type: "getVariables"; id: string; variables: PythonVariable[] }
  // File operation responses
  | { type: "listFiles"; id: string; files: FileInfo[] }
  | { type: "writeFile"; id: string; success: true; path: string }
  | { type: "writeFile"; id: string; success: false; error: string }
  | { type: "readFile"; id: string; data: ArrayBuffer }
  | { type: "deleteFile"; id: string; success: boolean }
  | { type: "fileExists"; id: string; exists: boolean }
  // Directory operation responses
  | { type: "createDirectory"; id: string; success: boolean }
  | { type: "deleteDirectory"; id: string; success: boolean }
  | { type: "renameDirectory"; id: string; success: boolean }
  // Move/rename file operation responses
  | { type: "moveFile"; id: string; success: boolean; newPath?: string; error?: string }
  | { type: "renameFile"; id: string; success: boolean; newPath?: string; error?: string }
  // Status updates
  | { type: "status"; status: "loading" | "ready" | "duckdb-ready" | "s3-mounting" | "s3-ready" | "s3-error" }
  // S3 file list (sent asynchronously after S3 mount completes)
  | { type: "s3-files"; files: FileInfo[] }
  | { type: "error"; id: string; error: string };
