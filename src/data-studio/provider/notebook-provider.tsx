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
import type { NotebookCell, NotebookDocument } from "../runtime";
import { downloadNotebook, parseNotebook } from "../runtime";
import {
  getRelativePath,
  getUniqueName,
  sanitizeFileName,
  readNotebook as readNotebookUtil,
  writeNotebook as writeNotebookUtil,
} from "../runtime/notebook-utils";
import { listOPFSFiles, readOPFSFile } from "../runtime/opfs-list";
import { initialCells } from "../notebook/constants";

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
 * Notebook list and CRUD operations via useNotebook().
 * Scoped to the notebook view — non-notebook views should not need this.
 */
export interface NotebookContextValue {
  /** Whether the provider has finished loading initial data */
  isLoaded: boolean;

  /** All notebooks available */
  notebooks: NotebookEntry[];

  /** Currently active notebook (if activeFilePath is a notebook) */
  activeNotebook: NotebookEntry | null;

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

  /** Update cells for a specific notebook (used by CellProvider) */
  updateNotebookCells: (filePath: string, cells: NotebookCell[]) => void;
}
import { generateId } from "../notebook/utils";
import { useRuntime, useExecutionBackend } from "./runtime-provider";
import { useAppStore, useAppStoreApi, selectActiveFilePath } from "../store";


// ============================================================================
// Helper Functions
// ============================================================================

function createNotebookEntry(
  name: string,
  dirPath: string = "",
  cells?: NotebookCell[],
  defaultCells?: NotebookCell[],
): NotebookEntry {
  const now = Date.now();
  const sanitizedName = sanitizeFileName(name);
  const fileName = `${sanitizedName}.ipynb`;
  const filePath = dirPath ? `/mnt/local/${dirPath}/${fileName}` : `/mnt/local/${fileName}`;
  return {
    filePath,
    name,
    updated_at: now,
    document: {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { name: "dataspren", display_name: "DataSpren" },
        language_info: { name: "python" },
        dataspren: { name, created_at: now, updated_at: now },
      },
      cells: cells ?? defaultCells ?? [...initialCells],
    },
  };
}

// ============================================================================
// Notebook Provider
// ============================================================================

const NotebookContext = createContext<NotebookContextValue | null>(null);

interface NotebookProviderInternalProps {
  initialCells?: NotebookCell[];
  ephemeral?: boolean;
  children: ReactNode;
}

export function NotebookProviderInternal({
  initialCells: configInitialCells,
  ephemeral = false,
  children,
}: NotebookProviderInternalProps) {
  const runtime = useRuntime();
  const execution = useExecutionBackend();
  const activeFilePath = useAppStore(selectActiveFilePath);
  const appStoreApi = useAppStoreApi();

  // ============================================================================
  // Notebooks State
  // ============================================================================

  const [notebooks, setNotebooks] = useState<NotebookEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const pendingSaves = useRef<Map<string, NotebookEntry>>(new Map());
  const deletedPaths = useRef<Set<string>>(new Set());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);
  const notebooksRef = useRef<NotebookEntry[]>(notebooks);

  useEffect(() => {
    notebooksRef.current = notebooks;
  }, [notebooks]);

  const flushPendingSaves = useCallback(async () => {
    if (ephemeral || pendingSaves.current.size === 0 || isFlushingRef.current) return;

    isFlushingRef.current = true;
    try {
      const toSave = Array.from(pendingSaves.current.values()).filter(
        (n) => !deletedPaths.current.has(n.filePath),
      );
      pendingSaves.current.clear();
      await Promise.all(toSave.map((n) => writeNotebookUtil(execution, n.filePath, n.document, { silent: true })));
    } finally {
      isFlushingRef.current = false;
      if (pendingSaves.current.size > 0) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => flushPendingSaves(), 100);
      }
    }
  }, [ephemeral, execution]);

  const scheduleSave = useCallback(
    (entry: NotebookEntry) => {
      pendingSaves.current.set(entry.filePath, entry);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => flushPendingSaves(), 500);
    },
    [flushPendingSaves],
  );

  // Early notebook loading: read .ipynb files directly from OPFS on the
  // main thread so notebooks are visible before the runtime is ready.
  const earlyLoadRef = useRef(false);
  useEffect(() => {
    if (ephemeral || earlyLoadRef.current) return;
    earlyLoadRef.current = true;

    async function loadFromOPFS() {
      try {
        const files = await listOPFSFiles();
        const notebookFiles = files.filter(
          (f) => !f.isDirectory && f.path.endsWith(".ipynb"),
        );

        if (notebookFiles.length === 0) {
          setIsLoaded(true);
          return;
        }

        const entries: NotebookEntry[] = [];
        for (const file of notebookFiles) {
          try {
            // Convert /mnt/local/path.ipynb to OPFS-relative path
            const opfsPath = file.path.replace(/^\/mnt\/local\//, "");
            const data = await readOPFSFile(opfsPath);
            const content = new TextDecoder().decode(data);
            const doc = parseNotebook(content);
            const name =
              doc.metadata.dataspren?.name ??
              file.name.replace(".ipynb", "");
            const updatedAt =
              doc.metadata.dataspren?.updated_at ?? Date.now();
            entries.push({
              filePath: file.path,
              name,
              updated_at: updatedAt,
              document: doc,
            });
          } catch (e) {
            console.warn(
              "[NotebookProvider] Failed to parse notebook from OPFS:",
              file.path,
              e,
            );
          }
        }

        entries.sort((a, b) => b.updated_at - a.updated_at);

        setNotebooks(entries);
      } catch (err) {
        console.warn("[NotebookProvider] Early OPFS load failed:", err);
      }
      setIsLoaded(true);
    }

    loadFromOPFS();
  }, [ephemeral]);

  // Ephemeral mode: create a demo notebook in-memory
  useEffect(() => {
    if (!ephemeral) return;
    const defaultEntry = createNotebookEntry("Demo", "", configInitialCells, configInitialCells);
    setNotebooks([defaultEntry]);
    appStoreApi.getState().selectFile(defaultEntry.filePath);
    setIsLoaded(true);
  }, [ephemeral, configInitialCells, appStoreApi]);

  // Flush pending saves on unmount instead of just cancelling
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (pendingSaves.current.size > 0) {
        flushPendingSaves();
      }
    };
  }, [flushPendingSaves]);

  // Reactive loading: when activeFilePath changes to a .ipynb not already loaded, load it
  useEffect(() => {
    if (!activeFilePath?.endsWith(".ipynb")) return;
    if (notebooksRef.current.some((n) => n.filePath === activeFilePath)) return;

    (async () => {
      try {
        const doc = await readNotebookUtil(execution, activeFilePath);
        const filename = activeFilePath.split("/").pop() ?? "Untitled";
        const name = filename.replace(/\.ipynb$/, "").replace(/_/g, " ");
        const now = Date.now();

        const entry: NotebookEntry = {
          filePath: activeFilePath,
          name: doc.metadata.dataspren?.name ?? name,
          updated_at: doc.metadata.dataspren?.updated_at ?? now,
          document: {
            ...doc,
            metadata: {
              ...doc.metadata,
              dataspren: {
                ...doc.metadata.dataspren,
                name: doc.metadata.dataspren?.name ?? name,
                created_at: doc.metadata.dataspren?.created_at ?? now,
                updated_at: doc.metadata.dataspren?.updated_at ?? now,
              },
            },
          },
        };

        setNotebooks((prev) => [...prev, entry]);
      } catch (e) {
        console.error("[NotebookProvider] Failed to load notebook reactively:", activeFilePath, e);
      }
    })();
  }, [activeFilePath, execution]);

  // Remove notebooks whose .ipynb files no longer exist in the runtime file list.
  // This handles cross-tab deletion: when another tab deletes a notebook file,
  // the BroadcastChannel triggers a dataFiles refresh, and this effect cleans up.
  const prevDataFilesRef = useRef(runtime.dataFiles);
  useEffect(() => {
    if (!isLoaded || runtime.dataFiles.length === 0) return;
    // Only react when dataFiles actually shrinks (files were removed)
    if (runtime.dataFiles.length >= prevDataFilesRef.current.length) {
      prevDataFilesRef.current = runtime.dataFiles;
      return;
    }
    prevDataFilesRef.current = runtime.dataFiles;

    const existingPaths = new Set(runtime.dataFiles.map((f) => f.path));
    setNotebooks((prev) => {
      const filtered = prev.filter((n) => existingPaths.has(n.filePath));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [runtime.dataFiles, isLoaded]);

  const activeNotebook = notebooks.find((n) => n.filePath === activeFilePath) ?? null;

  // ============================================================================
  // Notebook Actions
  // ============================================================================

  const handleCreateNotebook = useCallback(
    async (name?: string, cellsToUse?: NotebookCell[], filesToInclude?: File[]): Promise<NotebookEntry> => {
      const baseName = name || "Untitled";
      const uniqueName = getUniqueName(
        baseName,
        notebooksRef.current.map((n) => n.name),
      );
      const entry = createNotebookEntry(uniqueName, "", cellsToUse, configInitialCells);

      let filesAdded = 0;
      if (filesToInclude && filesToInclude.length > 0 && !ephemeral) {
        for (const file of filesToInclude) {
          const extension = file.name.split(".").pop()?.toLowerCase();
          if (!extension || !["csv", "parquet", "json"].includes(extension)) continue;

          const arrayBuffer = await file.arrayBuffer();
          await execution.writeFile(getRelativePath(`/mnt/local/${file.name}`), new Uint8Array(arrayBuffer));
          filesAdded++;
        }

        if (filesAdded > 0) {
          await runtime.refreshFiles();
        }
      }

      if (!ephemeral) {
        await writeNotebookUtil(execution, entry.filePath, entry.document);
      }
      setNotebooks((prev) => [entry, ...prev]);
      appStoreApi.getState().selectFile(entry.filePath);

      return entry;
    },
    [ephemeral, configInitialCells, execution, runtime, appStoreApi],
  );

  const handleDeleteNotebook = useCallback(
    async (filePath: string) => {
      deletedPaths.current.add(filePath);
      if (appStoreApi.getState().activeFilePath === filePath) {
        appStoreApi.getState().selectFile(null);
      }
      pendingSaves.current.delete(filePath);

      const notebook = notebooksRef.current.find((n) => n.filePath === filePath);

      if (!ephemeral && notebook) {
        await execution.deleteFile(getRelativePath(notebook.filePath));
      }

      const remaining = notebooksRef.current.filter((n) => n.filePath !== filePath);
      setNotebooks(remaining);
      if (remaining.length === 0) {
        appStoreApi.getState().selectFile(null);
      }
    },
    [ephemeral, execution, appStoreApi],
  );

  const handleRenameNotebook = useCallback(
    (filePath: string, name: string) => {
      setNotebooks((prev) => {
        const otherNames = prev.filter((n) => n.filePath !== filePath).map((n) => n.name);
        const uniqueName = getUniqueName(name, otherNames);
        return prev.map((entry) => {
          if (entry.filePath === filePath) {
            const now = Date.now();
            const dirPath = filePath.replace(/\/[^/]+\.ipynb$/, "");
            const sanitizedName = sanitizeFileName(uniqueName);
            const fileName = `${sanitizedName}.ipynb`;
            const newFilePath = `${dirPath}/${fileName}`;

            const updated: NotebookEntry = {
              ...entry,
              filePath: newFilePath,
              name: uniqueName,
              updated_at: now,
              document: {
                ...entry.document,
                metadata: {
                  ...entry.document.metadata,
                  dataspren: {
                    ...entry.document.metadata.dataspren!,
                    name: uniqueName,
                    updated_at: now,
                  },
                },
              },
            };
            if (!ephemeral && newFilePath !== filePath) {
              execution.deleteFile(getRelativePath(filePath));
            }
            scheduleSave(updated);
            return updated;
          }
          return entry;
        });
      });
    },
    [ephemeral, execution, scheduleSave],
  );

  const handleDuplicateNotebook = useCallback(
    async (filePath: string): Promise<NotebookEntry | null> => {
      const source = notebooksRef.current.find((n) => n.filePath === filePath);
      if (!source) return null;

      const baseName = `${source.name} (copy)`;
      const uniqueName = getUniqueName(
        baseName,
        notebooksRef.current.map((n) => n.name),
      );

      const sourceFileIds = source.document.metadata.dataspren?.files ?? [];
      const dirPath = filePath.replace(/\/[^/]+\.ipynb$/, "");

      const now = Date.now();
      const sanitizedName = sanitizeFileName(uniqueName);
      const fileName = `${sanitizedName}.ipynb`;
      const newFilePath = `${dirPath}/${fileName}`;

      const duplicate: NotebookEntry = {
        filePath: newFilePath,
        name: uniqueName,
        updated_at: now,
        document: {
          nbformat: 4,
          nbformat_minor: 5,
          metadata: {
            kernelspec: { name: "dataspren", display_name: "DataSpren" },
            language_info: { name: "python" },
            dataspren: {
              name: uniqueName,
              created_at: now,
              updated_at: now,
              files: [...sourceFileIds],
            },
          },
          cells: source.document.cells.map((c) => ({ ...c, id: generateId() })),
        },
      };

      if (!ephemeral) {
        await writeNotebookUtil(execution, duplicate.filePath, duplicate.document);
      }
      setNotebooks((prev) => {
        const index = prev.findIndex((n) => n.filePath === filePath);
        return [...prev.slice(0, index + 1), duplicate, ...prev.slice(index + 1)];
      });
      appStoreApi.getState().selectFile(duplicate.filePath);

      return duplicate;
    },
    [ephemeral, execution, appStoreApi],
  );

  const handleExportNotebook = useCallback((filePath: string) => {
    const notebook = notebooksRef.current.find((n) => n.filePath === filePath);
    if (notebook) {
      downloadNotebook(notebook.document, notebook.name);
    }
  }, []);

  const handleUpdateNotebookCells = useCallback(
    (filePath: string, cells: NotebookCell[]) => {
      setNotebooks((prev) =>
        prev.map((entry) => {
          if (entry.filePath === filePath) {
            const now = Date.now();
            const updated: NotebookEntry = {
              ...entry,
              updated_at: now,
              document: {
                ...entry.document,
                cells,
                metadata: {
                  ...entry.document.metadata,
                  dataspren: entry.document.metadata.dataspren
                    ? { ...entry.document.metadata.dataspren, updated_at: now }
                    : undefined,
                },
              },
            };
            scheduleSave(updated);
            return updated;
          }
          return entry;
        }),
      );
    },
    [scheduleSave],
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue = useMemo<NotebookContextValue>(
    () => ({
      isLoaded,
      notebooks,
      activeNotebook,
      createNotebook: handleCreateNotebook,
      deleteNotebook: handleDeleteNotebook,
      renameNotebook: handleRenameNotebook,
      duplicateNotebook: handleDuplicateNotebook,
      exportNotebook: handleExportNotebook,
      updateNotebookCells: handleUpdateNotebookCells,
    }),
    [
      isLoaded,
      notebooks,
      activeNotebook,
      handleCreateNotebook,
      handleDeleteNotebook,
      handleRenameNotebook,
      handleDuplicateNotebook,
      handleExportNotebook,
      handleUpdateNotebookCells,
    ],
  );

  if (!isLoaded) return null;

  return <NotebookContext.Provider value={contextValue}>{children}</NotebookContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useNotebook(): NotebookContextValue {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error("useNotebook must be used within a NotebookProvider");
  }
  return context;
}
