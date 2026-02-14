import {
  PyodideExecutionBackend,
  type IExecutionBackend,
  type NotebookCell,
} from "../../runtime";
import type { NotebookProviderConfig } from "../provider";

/**
 * Create a Pyodide execution backend instance.
 */
export function createPyodideBackend(): IExecutionBackend {
  return new PyodideExecutionBackend();
}

/**
 * Create configuration for browser-based storage (OPFS + Pyodide).
 * Notebooks are stored as .ipynb files alongside data files.
 * Best for production use where data should persist across sessions.
 */
export function createBrowserConfig(options?: {
  autoInit?: boolean;
  initialCells?: NotebookCell[];
}): NotebookProviderConfig {
  return {
    execution: createPyodideBackend(),
    autoInit: options?.autoInit ?? true,
    initialCells: options?.initialCells,
  };
}

/**
 * Create configuration for demo/ephemeral mode.
 * Single notebook, no persistence, no multi-notebook UI.
 * Best for embedded demos where you want minimal overhead.
 */
export function createDemoConfig(options: {
  cells: NotebookCell[];
  autoInit?: boolean;
}): NotebookProviderConfig {
  return {
    execution: createPyodideBackend(),
    ephemeral: true,
    initialCells: options.cells,
    autoInit: options.autoInit ?? true,
  };
}
