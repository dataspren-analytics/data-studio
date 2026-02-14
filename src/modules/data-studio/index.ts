/**
 * Notebook Module
 *
 * This module provides the complete data studio experience:
 * - Runtime execution (Python/SQL via Pyodide/DuckDB)
 * - Persistent storage (OPFS - notebooks and data files stored together)
 * - React components for notebook cells and layout
 *
 * ## Quick Start
 *
 * ```tsx
 * import { DataStudioView, NotebookProvider, createBrowserConfig } from "@/modules/notebook";
 *
 * function App() {
 *   return (
 *     <NotebookProvider config={createBrowserConfig()}>
 *       <DataStudioView />
 *     </NotebookProvider>
 *   );
 * }
 * ```
 */

// ============================================================================
// Runtime Package (re-export everything from runtime)
// ============================================================================

// Backends
export type {
  ExecutionBackendChangeCallback,
  ExecutionBackendEvent,
  ExecutionStatus,
  FileInfo,
  FileType,
  IExecutionBackend,
  IRuntime,
  IRuntimeFileSystem,
} from "./runtime";

export { PyodideExecutionBackend } from "./runtime";

// Notebook utilities
export { getRelativePath, listNotebooks, readNotebook, writeNotebook } from "./runtime/notebook-utils";
export type { NotebookInfo } from "./runtime/notebook-utils";

// Notebook document types
export type {
  AssertResult,
  AssertTest,
  AssertTestType,
  CellMetadata,
  CellOutput,
  CellType,
  CodeCell,
  DataSprenCellType,
  DisplayDataOutput,
  ErrorOutput,
  ExecuteResultOutput,
  MarkdownCell,
  MimeBundle,
  MultilineString,
  NotebookCell,
  NotebookDocument,
  NotebookMetadata,
  RawCell,
  StreamOutput,
} from "./runtime";

// Runtime types
export type {
  ExecutionResult,
  PyodideExecutionResult,
  PythonVariable,
  RegisteredFile,
  RegisteredFunction,
  TableColumn,
  TableData,
  TableInfo,
} from "./runtime";

// Notebook document functions
export {
  downloadNotebook,
  extractAssertResults,
  extractImageData,
  extractMimeData,
  getMultilineString,
  getSourceString,
  isCodeCell,
  isMarkdownCell,
  parseNotebook,
  serializeNotebook,
} from "./runtime";

// Runtime helper functions
export {
  createAssertOutput,
  createImageOutput,
  createTableOutput,
  extractTableData,
  getTableColumns,
  isTableData,
} from "./runtime";

// Worker types (for advanced usage)
export type { WorkerRequest, WorkerResponse } from "./runtime";

// ============================================================================
// UI - Provider & Hook
// ============================================================================

export { DataStudioProvider, NotebookProvider } from "./ui/provider";
export type { NotebookProviderConfig } from "./ui/provider";
export { useRuntime, useNotebook, useCells } from "./ui/provider";

// Configuration factory functions
export {
  createBrowserConfig,
  createDemoConfig,
  createPyodideBackend,
} from "./ui/lib/config";

// Context types (for consumers)
export type { CellContextValue, NotebookContextValue, NotebookEntry, RuntimeContextValue, RuntimeState } from "./ui/lib/types";

// ============================================================================
// UI - Layout Components (Data Studio)
// ============================================================================

export { DataStudioView } from "./ui/layout/data-studio-view";
export { DataStudioLayout } from "./ui/layout/data-studio-layout";
export { DataStudioHeader } from "./ui/layout/data-studio-header";
export { ContentArea } from "./ui/layout/content-area";
export { FileSidebar } from "./ui/layout/file-sidebar";

// ============================================================================
// UI - Cell Components
// ============================================================================

export { CodeCell as CodeCellComponent, type CodeCellProps } from "./ui/components/cells";
export { AddCellDivider } from "./ui/components/cells";

// ============================================================================
// UI - Utility Components
// ============================================================================

export { CellContentPopover } from "./ui/components/cell-content-popover";
export { ResultTable } from "./ui/components/result-table";
export { Sidebar } from "./ui/components/sidebar";
export { DataTable } from "./ui/components/data-table";

// ============================================================================
// UI - File Viewers
// ============================================================================

export { CsvFileViewer } from "./ui/viewers/csv-file-viewer";
export { ExcelFileViewer } from "./ui/viewers/excel-file-viewer";
export { JsonFileViewer } from "./ui/viewers/json-file-viewer";
export { ParquetFileViewer } from "./ui/viewers/parquet-file-viewer";
export { NotebookCellsViewer } from "./ui/viewers/notebook-cells-viewer";
export { getFileExtension, type FileExtension, type FileViewerProps } from "./ui/viewers/types";

// ============================================================================
// UI Constants and Utilities
// ============================================================================

export { assertTestTypeConfig, cellTypeConfig, editorTheme, initialCells } from "./ui/lib/constants";
export {
  downloadTableData,
  exportNotebook,
  formatFileSize,
  generateId,
  generateTestSQL,
  getFileIcon,
} from "./ui/lib/utils";
