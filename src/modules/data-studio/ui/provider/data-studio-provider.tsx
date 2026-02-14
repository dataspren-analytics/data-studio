"use client";

import type { ReactNode } from "react";
import type { IExecutionBackend, NotebookCell } from "../../runtime";
import { RuntimeProvider } from "./runtime-provider";
import { NotebookProviderInternal } from "./notebook-provider";
import { CellProvider } from "./cell-provider";

/**
 * Configuration for the DataStudio provider stack.
 */
export interface NotebookProviderConfig {
  /** Execution backend instance */
  execution: IExecutionBackend;

  /** Auto-initialize runtime on mount (default: true) */
  autoInit?: boolean;

  /** Initial cells for new notebooks (optional) */
  initialCells?: NotebookCell[];

  /**
   * Ephemeral mode - single notebook, no persistence, no multi-notebook UI.
   * When true, initialCells are used directly.
   */
  ephemeral?: boolean;
}

interface DataStudioProviderProps {
  config: NotebookProviderConfig;
  children: ReactNode;
}

/**
 * Composes RuntimeProvider, NotebookProvider, and CellProvider.
 *
 * Usage:
 * ```tsx
 * <DataStudioProvider config={config}>
 *   <DataStudioView />
 * </DataStudioProvider>
 * ```
 */
export function DataStudioProvider({ config, children }: DataStudioProviderProps) {
  return (
    <RuntimeProvider execution={config.execution} autoInit={config.autoInit}>
      <NotebookProviderInternal initialCells={config.initialCells} ephemeral={config.ephemeral}>
        <CellProvider>
          {children}
        </CellProvider>
      </NotebookProviderInternal>
    </RuntimeProvider>
  );
}

/** @deprecated Use DataStudioProvider instead */
export const NotebookProvider = DataStudioProvider;
