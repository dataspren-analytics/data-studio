/**
 * Runtime Package
 *
 * This package provides the core runtime functionality for notebook execution
 * and storage. It is framework-agnostic and can be used independently of React.
 *
 * ## Main Components
 *
 * ### Execution Backends
 * - `IExecutionBackend` - Interface for code execution and file storage
 * - `PyodideExecutionBackend` - Pyodide/DuckDB implementation
 *
 * ### File Storage
 * All files (notebooks and data) are stored using OPFS (Origin Private File System):
 * - Persistent storage across page reloads
 * - Byte-range access (files are NOT loaded entirely into memory)
 * - Efficient handling of large files (parquet, csv, etc.)
 * - Notebooks stored as .ipynb files alongside data files
 *
 * @example
 * ```typescript
 * import {
 *   PyodideExecutionBackend,
 *   type IExecutionBackend,
 *   type NotebookDocument,
 * } from "@/modules/notebook/runtime";
 *
 * const execution = new PyodideExecutionBackend();
 * await execution.init();
 *
 * // Write a file to storage (backed by OPFS)
 * const path = await execution.writeFile("data.csv", csvBuffer);
 *
 * // Use in Python - file is accessible at /mnt/local/data.csv
 * await execution.runPython("import pandas as pd; df = pd.read_csv('/mnt/local/data.csv')");
 * ```
 */

// ============================================================================
// Execution Backend
// ============================================================================

export type {
  ExecutionBackendChangeCallback,
  ExecutionBackendEvent,
  ExecutionStatus,
  FileInfo,
  FileType,
  IExecutionBackend,
  IRuntime,
  IRuntimeFileSystem,
} from "./backends/execution";

export { PyodideExecutionBackend } from "./backends/execution";

// ============================================================================
// Notebook Document Types (nbformat v4.5)
// ============================================================================

export type {
  // Cell types
  CellMetadata,
  CellOutput,
  CellType,
  CodeCell,
  DisplayDataOutput,
  ErrorOutput,
  ExecuteResultOutput,
  MarkdownCell,
  MimeBundle,
  MultilineString,
  NotebookCell,
  RawCell,
  StreamOutput,
  // Document types
  NotebookDocument,
  NotebookMetadata,
  // DataSpren extensions
  AssertResult,
  AssertTest,
  AssertTestType,
  DataSprenCellType,
  AggregationType,
  VisualizeChartType,
  VisualizeConfig,
} from "./core/nbformat";

// ============================================================================
// Notebook Document Functions
// ============================================================================

export {
  // Type guards
  isCodeCell,
  isMarkdownCell,
  // String utilities
  getMultilineString,
  getSourceString,
  // Output extraction
  extractAssertResults,
  extractImageData,
  extractMimeData,
  // Serialization
  downloadNotebook,
  parseNotebook,
  serializeNotebook,
} from "./core/nbformat";

// ============================================================================
// Runtime Types
// ============================================================================

export type {
  // Execution result
  ExecutionResult,
  PyodideExecutionResult,
  TableData,
  // Runtime entities
  PythonVariable,
  RegisteredFile,
  RegisteredFunction,
  TableColumn,
  TableInfo,
} from "./core/types";

// ============================================================================
// Runtime Helper Functions
// ============================================================================

export {
  // Table data utilities
  createAssertOutput,
  createImageOutput,
  createTableOutput,
  extractTableData,
  extractTotalRows,
  getTableColumns,
  isTableData,
} from "./core/types";

// ============================================================================
// Worker Types (for advanced usage)
// ============================================================================

export type { WorkerRequest, WorkerResponse } from "./workers";
