import type {
  AssertTest,
  DataSprenCellType,
  ExecutionResult,
  FileInfo,
  NotebookCell,
  NotebookDocument,
  PythonVariable,
  RegisteredFile,
  RegisteredFunction,
  TableInfo,
} from "../../runtime";

/**
 * Notebook entry as displayed in the sidebar.
 * This is what UI components see - no storage implementation details.
 */
export interface NotebookEntry {
  /** The file path (e.g., "/mnt/local/folder/notebook.ipynb") - this is the unique identifier */
  filePath: string;
  name: string;
  updated_at: number;
  document: NotebookDocument;
}

/**
 * Runtime state exposed to components via useRuntime().
 * Hides execution service implementation details.
 */
export interface RuntimeContextValue {
  /** Whether the execution runtime is ready to run code */
  isReady: boolean;

  /** Whether the runtime is currently loading */
  isLoading: boolean;

  /** Fatal error message (e.g. worker crash) */
  error: string | null;

  /** S3 storage mount status */
  s3Status: "idle" | "mounting" | "ready" | "error";

  /** Files in the global data directory */
  dataFiles: FileInfo[];

  /** Files registered in the runtime (with schema info) */
  registeredFiles: RegisteredFile[];

  /** Tables available in the runtime (from DuckDB) */
  tables: TableInfo[];

  /** Python functions defined in the runtime */
  functions: RegisteredFunction[];

  /** Python variables in the runtime */
  variables: PythonVariable[];

  /** Write a file to the global data directory (or a specific directory if targetDir is provided) */
  writeFile: (file: File, targetDir?: string) => Promise<void>;

  /** Read a file from the global data directory */
  readFile: (name: string) => Promise<Uint8Array>;

  /** Delete a file from the global data directory */
  deleteFile: (name: string) => Promise<boolean>;

  /** Create a directory in the global data directory */
  createDirectory: (path: string) => Promise<void>;

  /** Delete a directory from the global data directory */
  deleteDirectory: (path: string) => Promise<boolean>;

  /** Rename a directory in the global data directory */
  renameDirectory: (oldPath: string, newName: string) => Promise<void>;

  /** Move a file to a different directory */
  moveFile: (sourcePath: string, targetDir: string) => Promise<void>;

  /** Rename a file */
  renameFile: (path: string, newName: string) => Promise<void>;

  /** Execute a SQL query via DuckDB */
  runSQL: (sql: string, viewName?: string) => Promise<ExecutionResult>;

  /** Execute Python code via Pyodide */
  runPython: (code: string) => Promise<ExecutionResult>;

  /** Refresh the tables list from DuckDB */
  refreshTables: () => Promise<void>;

  /** Refresh the functions list */
  refreshFunctions: () => Promise<void>;

  /** Refresh the variables list */
  refreshVariables: () => Promise<void>;

  /** Refresh the data files list */
  refreshFiles: () => Promise<void>;

  /** Reset the runtime (clear all state) */
  reset: () => Promise<void>;
}

/** @deprecated Use RuntimeContextValue instead */
export type RuntimeState = RuntimeContextValue;

/**
 * Notebook list and CRUD operations via useNotebook().
 */
export interface NotebookContextValue {
  /** Whether the provider has finished loading initial data */
  isLoaded: boolean;

  /** All notebooks available */
  notebooks: NotebookEntry[];

  /** Currently active/selected file path */
  activeFilePath: string | null;

  /** Currently active notebook (if activeFilePath is a notebook) */
  activeNotebook: NotebookEntry | null;

  /** Select a file by path */
  selectFile: (path: string | null) => void;

  /** Open a file by path (loads notebook if .ipynb, otherwise just selects it) */
  openFile: (path: string) => Promise<void>;

  /** Create a new notebook, optionally with initial cells and files */
  createNotebook: (name?: string, initialCells?: NotebookCell[], initialFiles?: File[]) => Promise<NotebookEntry>;

  /** Delete a notebook by file path */
  deleteNotebook: (filePath: string) => void;

  /** Rename a notebook */
  renameNotebook: (filePath: string, name: string) => void;

  /** Duplicate a notebook */
  duplicateNotebook: (filePath: string) => Promise<NotebookEntry | null>;

  /** Export a notebook as .ipynb file */
  exportNotebook: (filePath: string) => void;

  /** Reload notebooks from the file system */
  reloadNotebooks: () => Promise<void>;

  /** Update cells for a specific notebook (used by CellProvider) */
  updateNotebookCells: (filePath: string, cells: NotebookCell[]) => void;
}

/**
 * Cell editing state and actions via useCells().
 */
export interface CellContextValue {
  /** Cells in the active notebook */
  cells: NotebookCell[];

  /** Currently selected cell ID */
  selectedCellId: string | null;

  /** ID of the most recently created cell (for auto-focus) */
  newlyCreatedCellId: string | null;

  /** Set of cell IDs currently running */
  runningCellIds: Set<string>;

  /** Set of cell IDs queued to run */
  queuedCellIds: Set<string>;

  /** Select a cell (or null to deselect) */
  selectCell: (id: string | null) => void;

  /** Add a new cell */
  addCell: (type?: DataSprenCellType | "markdown", afterId?: string) => void;

  /** Update cell source code */
  updateCell: (id: string, source: string) => void;

  /** Delete a cell */
  deleteCell: (id: string) => void;

  /** Run a cell */
  runCell: (id: string, queryOverride?: string) => Promise<void>;

  /** Run a cell and advance selection to next cell */
  runCellAndAdvance: (id: string, queryOverride?: string) => void;

  /** Change cell type (python, sql, assert, markdown) */
  changeCellType: (id: string, type: DataSprenCellType | "markdown") => void;

  /** Move cell up in the list */
  moveCellUp: (id: string) => void;

  /** Move cell down in the list */
  moveCellDown: (id: string) => void;

  /** Update the view name for SQL cells */
  updateViewName: (id: string, newName: string) => void;

  /** Update assert configuration for assert cells */
  updateAssertConfig: (id: string, config: { tests: AssertTest[] }) => void;

  /** Toggle cell enabled state */
  toggleCellEnabled: (id: string) => void;

  /** Run only the tests for a cell (without re-executing the cell) */
  runCellTests: (id: string) => Promise<void>;

  /** Update arbitrary cell metadata */
  updateCellMetadata: (id: string, metadata: Record<string, unknown>) => void;
}
