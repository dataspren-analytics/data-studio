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
import type { NotebookCell } from "../../runtime";
import {
  getRelativePath,
  listNotebooks as listNotebooksUtil,
  readNotebook as readNotebookUtil,
  writeNotebook as writeNotebookUtil,
  type NotebookInfo,
} from "../../runtime/notebook-utils";
import { initialCells } from "../lib/constants";
import type { NotebookContextValue, NotebookEntry } from "../lib/types";
import { exportNotebook, generateId } from "../lib/utils";
import { useRuntime, useExecutionBackend } from "./runtime-provider";


// ============================================================================
// Helper Functions
// ============================================================================

function getUniqueName(baseName: string, existingNames: string[]): string {
  const otherNames = new Set(existingNames);
  if (!otherNames.has(baseName)) return baseName;

  let counter = 1;
  let candidate = `${baseName} ${counter}`;
  while (otherNames.has(candidate)) {
    counter++;
    candidate = `${baseName} ${counter}`;
  }
  return candidate;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim() || "Untitled";
}

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

  // ============================================================================
  // Notebooks State
  // ============================================================================

  const [notebooks, setNotebooks] = useState<NotebookEntry[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
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

  // Reloadable function to load notebooks from the file system
  const reloadNotebooks = useCallback(async () => {
    try {
      const notebookInfos = await listNotebooksUtil(execution);

      if (notebookInfos.length === 0) {
        setNotebooks([]);
      } else {
        const entries: NotebookEntry[] = await Promise.all(
          notebookInfos.map(async (info: NotebookInfo) => {
            const doc = await readNotebookUtil(execution, info.path);
            return {
              filePath: info.path,
              name: info.name,
              updated_at: info.updatedAt,
              document: doc,
            };
          })
        );
        setNotebooks(entries);
        if (!activeFilePath && entries.length > 0) {
          setActiveFilePath(entries[0].filePath);
        }
      }
    } catch (err) {
      console.error("Failed to reload notebooks:", err);
    }
  }, [execution, configInitialCells, activeFilePath]);

  // Load notebooks on mount - wait for runtime to be ready
  const loadNotebooksRef = useRef(false);
  useEffect(() => {
    if (ephemeral) {
      const defaultEntry = createNotebookEntry("Demo", "", configInitialCells, configInitialCells);
      setNotebooks([defaultEntry]);
      setActiveFilePath(defaultEntry.filePath);
      setIsLoaded(true);
      return;
    }

    if (!runtime.isReady || loadNotebooksRef.current) return;
    loadNotebooksRef.current = true;

    async function loadNotebooks() {
      try {
        const notebookInfos = await listNotebooksUtil(execution);

        if (notebookInfos.length === 0) {
          setNotebooks([]);
        } else {
          const entries: NotebookEntry[] = await Promise.all(
            notebookInfos.map(async (info: NotebookInfo) => {
              const doc = await readNotebookUtil(execution, info.path);
              return {
                filePath: info.path,
                name: info.name,
                updated_at: info.updatedAt,
                document: doc,
              };
            })
          );
          setNotebooks(entries);
          setActiveFilePath(entries[0].filePath);
        }
      } catch (err) {
        console.error("Failed to load notebooks:", err);
        setNotebooks([]);
      }
      setIsLoaded(true);
    }
    loadNotebooks();
  }, [ephemeral, runtime.isReady, configInitialCells, execution, runtime]);

  // Cleanup save timeout
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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
      setActiveFilePath(entry.filePath);

      return entry;
    },
    [ephemeral, configInitialCells, execution, runtime],
  );

  const handleDeleteNotebook = useCallback(
    async (filePath: string) => {
      deletedPaths.current.add(filePath);
      setActiveFilePath((currentPath) => (currentPath === filePath ? null : currentPath));
      pendingSaves.current.delete(filePath);

      const notebook = notebooksRef.current.find((n) => n.filePath === filePath);

      if (!ephemeral && notebook) {
        await execution.deleteFile(getRelativePath(notebook.filePath));
      }

      const remaining = notebooksRef.current.filter((n) => n.filePath !== filePath);
      setNotebooks(remaining);
      if (remaining.length === 0) {
        setActiveFilePath(null);
      }
    },
    [ephemeral, execution],
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

  const handleSelectFile = useCallback((path: string | null) => {
    setActiveFilePath(path);
  }, []);

  const handleOpenFile = useCallback(
    async (path: string): Promise<void> => {
      if (!path.endsWith(".ipynb")) {
        setActiveFilePath(path);
        return;
      }

      const existingNotebook = notebooksRef.current.find((n) => n.filePath === path);
      if (existingNotebook) {
        setActiveFilePath(path);
        return;
      }

      try {
        const doc = await readNotebookUtil(execution, path);
        const filename = path.split("/").pop() ?? "Untitled";
        const name = filename.replace(/\.ipynb$/, "").replace(/_/g, " ");
        const now = Date.now();

        const entry: NotebookEntry = {
          filePath: path,
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
        setActiveFilePath(path);
      } catch (e) {
        console.error("[NotebookProvider] Failed to open notebook:", path, e);
      }
    },
    [execution],
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
      setActiveFilePath(duplicate.filePath);

      return duplicate;
    },
    [ephemeral, execution],
  );

  const handleExportNotebook = useCallback((filePath: string) => {
    const notebook = notebooksRef.current.find((n) => n.filePath === filePath);
    if (notebook) {
      exportNotebook(notebook.document, notebook.name);
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
      activeFilePath,
      activeNotebook,
      selectFile: handleSelectFile,
      openFile: handleOpenFile,
      createNotebook: handleCreateNotebook,
      deleteNotebook: handleDeleteNotebook,
      renameNotebook: handleRenameNotebook,
      duplicateNotebook: handleDuplicateNotebook,
      exportNotebook: handleExportNotebook,
      reloadNotebooks,
      updateNotebookCells: handleUpdateNotebookCells,
    }),
    [
      isLoaded,
      notebooks,
      activeFilePath,
      activeNotebook,
      handleSelectFile,
      handleOpenFile,
      handleCreateNotebook,
      handleDeleteNotebook,
      handleRenameNotebook,
      handleDuplicateNotebook,
      handleExportNotebook,
      reloadNotebooks,
      handleUpdateNotebookCells,
    ],
  );

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
