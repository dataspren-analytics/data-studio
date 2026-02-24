"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Csv,
  DataTable,
  Document,
  DocumentBlank,
  FolderAdd,
  Json,
  LogoJupyter,
  Txt,
  Xls,
  Sql,
  DeliveryParcel,
} from "@carbon/icons-react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Home,
  Loader2,
  Pencil,
  Plus,
  Share,
  Trash2,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileInfo, NotebookCell } from "../../runtime";
import { ResizablePanel } from "../components/resizable-panel";
import { formatFileSize } from "../lib/utils";
import { useNotebook, useRuntime } from "../provider";

// ============================================================================
// Pending Move State (for confirmation dialog)
// ============================================================================

interface PendingMove {
  sourcePath: string;
  targetDir: string;
  fileName: string;
  existingFileName: string;
}

// The path of the directory that will receive the dropped file
type DropTargetDir = string | null;

interface FileSidebarProps {
  onCreateNotebook?: (name?: string, cells?: NotebookCell[]) => Promise<void>;
  showHome?: boolean;
  onShowHome?: () => void;
  onSelectFile?: (path: string | null) => void;
}

// ============================================================================
// File Tree Types & Helpers
// ============================================================================

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileTreeNode[];
  isNotebook?: boolean;
}

/**
 * Check if a file path is a notebook (based on extension)
 */
function isNotebookFile(path: string): boolean {
  return path.endsWith(".ipynb");
}

/**
 * Build a file tree from a flat list of files.
 * Notebooks are detected by .ipynb extension.
 */
function buildFileTree(files: FileInfo[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "mnt",
    path: "/mnt",
    isDirectory: true,
    children: [
      // Always include the local directory (OPFS mount point)
      {
        name: "local",
        path: "/mnt/local",
        isDirectory: true,
        children: [],
      },
    ],
  };

  // Add all files and directories
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = "/" + parts.slice(0, i + 1).join("/");

      if (!current.children) current.children = [];

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        // For the last part, use the file's isDirectory flag
        const isDir = isLast ? file.isDirectory : true;
        const isNotebook = isLast && !isDir && isNotebookFile(currentPath);
        
        child = {
          name: part,
          path: currentPath,
          isDirectory: isDir,
          size: isLast && !file.isDirectory ? file.size : undefined,
          children: isDir ? [] : undefined,
          isNotebook,
        };
        current.children.push(child);
      } else if (isLast && file.isDirectory && !child.children) {
        // Ensure directories have children array
        child.children = [];
      }
      current = child;
    }
  }

  // Sort: directories first, then notebooks, then other files, all alphabetically
  function sortChildren(node: FileTreeNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        // Notebooks come before other files
        if (a.isNotebook !== b.isNotebook) return a.isNotebook ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  }
  sortChildren(root);

  return root;
}

function FileIconForName({ name, size, className }: { name: string; size: number; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  let icon;
  switch (ext) {
    case "ipynb": icon = <LogoJupyter size={size} color="var(--color-orange-400)" />; break;
    case "csv": icon = <Csv size={size} color="var(--color-green-400)" />; break;
    case "parquet": icon = <DeliveryParcel size={size} color="var(--color-amber-700)" />; break;
    case "xlsx":
    case "xls": icon = <Xls size={size} color="var(--color-emerald-500)" />; break;
    case "json": icon = <Json size={size} color="var(--color-yellow-400)" />; break;
    case "txt": icon = <Txt size={size} color="var(--color-zinc-400)" />; break;
    case "md": icon = <Document size={size} color="var(--color-blue-400)" />; break;
    case "sql": icon = <Sql size={size} color="var(--color-sky-400)" />; break;
    default: icon = <DocumentBlank size={size} />; break;
  }
  return <span className={className}>{icon}</span>;
}

export function FileSidebar({ onCreateNotebook: onCreateNotebookProp, showHome, onShowHome, onSelectFile: onSelectFileProp }: FileSidebarProps = {}) {
  const {
    notebooks,
    activeFilePath,
    selectFile,
    openFile,
    createNotebook,
    reloadNotebooks,
  } = useNotebook();
  const onSelectFile = onSelectFileProp ?? selectFile;
  const onOpenFile = useCallback(async (path: string) => {
    await openFile(path);
    onSelectFileProp?.(path);
  }, [openFile, onSelectFileProp]);
  const runtime = useRuntime();

  const dataFiles = runtime.dataFiles;
  const onDeleteFile = useCallback(
    async (name: string): Promise<boolean> => {
      const success = await runtime.deleteFile(name);
      if (success && name.endsWith(".ipynb")) {
        await reloadNotebooks();
      }
      return success;
    },
    [runtime, reloadNotebooks],
  );
  const onWriteFile = runtime.writeFile;
  const onReadFile = runtime.readFile;
  const onCreateDirectory = runtime.createDirectory;
  const onDeleteDirectory = runtime.deleteDirectory;
  const onRenameDirectory = runtime.renameDirectory;
  const onRenameFile = runtime.renameFile;
  const onMoveFile = runtime.moveFile;

  const onCreateNotebook = onCreateNotebookProp ?? (async (name?: string, cells?: NotebookCell[]) => {
    const newNotebook = await createNotebook(name, cells);
    onSelectFile(newNotebook.filePath);
  });
  const [collapsed, setCollapsed] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["/mnt", "/mnt/local"])
  );
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Multi-selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  // DnD state
  const [draggedNode, setDraggedNode] = useState<FileTreeNode | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<DropTargetDir>(null);
  const dropTargetDirRef = useRef<DropTargetDir>(null);
  useEffect(() => { dropTargetDirRef.current = dropTargetDir; }, [dropTargetDir]);

  // Confirmation dialog state for file overwrite
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // Transfer loading state
  const [transferring, setTransferring] = useState<{ fileName: string; targetDir: string; sourcePath: string } | null>(null);

  // Shared context menu state (positioned at cursor, key forces remount)
  const [contextMenu, setContextMenu] = useState<{ node: FileTreeNode; x: number; y: number; key: number; selectedPaths: Set<string> } | null>(null);
  const contextKeyRef = useRef(0);
  const handleNodeContextMenu = useCallback((node: FileTreeNode, x: number, y: number) => {
    contextKeyRef.current++;
    // If right-clicking a node that's in the current selection, keep it; otherwise clear
    const snapshotSelection = selectedPaths.has(node.path)
      ? selectedPaths
      : new Set<string>();
    if (!snapshotSelection.size) {
      clearSelection();
    }
    setContextMenu({ node, x, y, key: contextKeyRef.current, selectedPaths: snapshotSelection });
  }, [selectedPaths, clearSelection]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Auto-expand target directory when transfer starts
  useEffect(() => {
    if (transferring) {
      setExpandedPaths((prev) => {
        if (prev.has(transferring.targetDir)) return prev;
        const next = new Set(prev);
        next.add(transferring.targetDir);
        return next;
      });
    }
  }, [transferring]);

  const fileTree = useMemo(() => buildFileTree(dataFiles), [dataFiles]);

  // Build a map of paths to nodes for quick lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, FileTreeNode>();
    function traverse(node: FileTreeNode) {
      map.set(node.path, node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    }
    traverse(fileTree);
    return map;
  }, [fileTree]);

  // Flat list of visible node paths in render order (files + directories) — for shift-click ranges
  const flatVisibleNodes = useMemo(() => {
    const result: string[] = [];
    function walk(node: FileTreeNode) {
      // Skip the invisible root node (/mnt)
      if (node.path !== "/mnt") result.push(node.path);
      if (node.isDirectory && node.children && expandedPaths.has(node.path))
        for (const child of node.children) walk(child);
    }
    walk(fileTree);
    return result;
  }, [fileTree, expandedPaths]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    clearSelection();
    const node = event.active.data.current?.node as FileTreeNode | undefined;
    // Extract path from the drag ID (format: "drag:/path/to/file")
    const dragId = String(event.active.id);
    const path = dragId.startsWith("drag:") ? dragId.slice(5) : dragId;
    const fallbackNode = nodeMap.get(path);
    const sourceNode = node || fallbackNode;

    // Files (including notebooks) can be dragged, but not directories
    if (sourceNode && !sourceNode.isDirectory) {
      setDraggedNode(sourceNode);
    }
  }, [nodeMap, clearSelection]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const targetDir = dropTargetDirRef.current;
    setDraggedNode(null);
    setDropTargetDir(null);

    if (!targetDir || !onMoveFile) return;

    const sourceNode = event.active.data.current?.node as FileTreeNode | undefined;
    const activeId = String(event.active.id);
    const sourcePath = activeId.startsWith("drag:") ? activeId.slice(5) : activeId;
    const source = sourceNode || nodeMap.get(sourcePath);

    if (!source) return;

    // Can't drop on same parent directory (no-op)
    const sourceParentPath = source.path.substring(0, source.path.lastIndexOf("/"));
    if (sourceParentPath === targetDir) return;

    // Check if a file with the same name already exists in the target directory
    const fileName = source.name;
    const targetFilePath = `${targetDir}/${fileName}`;
    const existingFile = nodeMap.get(targetFilePath);

    if (existingFile && !existingFile.isDirectory) {
      setPendingMove({
        sourcePath: source.path,
        targetDir,
        fileName,
        existingFileName: existingFile.name,
      });
      return;
    }

    // No conflict - proceed with move
    try {
      setTransferring({ fileName: source.name, targetDir, sourcePath: source.path });
      await onMoveFile(source.path, targetDir);
      await reloadNotebooks();
    } catch (e) {
      console.error("Failed to move file:", e);
    } finally {
      setTransferring(null);
    }
  }, [nodeMap, onMoveFile, reloadNotebooks]);

  // Store pending move in a ref so it's available even after state is cleared
  const pendingMoveRef = useRef<PendingMove | null>(null);
  useEffect(() => {
    pendingMoveRef.current = pendingMove;
  }, [pendingMove]);

  const handleConfirmMove = useCallback(async () => {
    const move = pendingMoveRef.current;
    if (!move || !onMoveFile) return;

    setPendingMove(null);

    try {
      setTransferring({ fileName: move.fileName, targetDir: move.targetDir, sourcePath: move.sourcePath });
      await onMoveFile(move.sourcePath, move.targetDir);
      await reloadNotebooks();
    } catch (e) {
      console.error("Failed to move file:", e);
    } finally {
      setTransferring(null);
    }
  }, [onMoveFile, reloadNotebooks]);

  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!event.over) {
      setDropTargetDir(null);
      return;
    }

    const overId = String(event.over.id);
    const path = overId.startsWith("drop:") ? overId.slice(5) : overId;
    const targetNode = nodeMap.get(path);

    if (!targetNode) {
      setDropTargetDir(null);
      return;
    }

    // Don't show indicator when hovering over the dragged item itself
    if (draggedNode && path === draggedNode.path) {
      setDropTargetDir(null);
      return;
    }

    // Resolve the target directory:
    // - Directory → drop into that directory
    // - File → drop into its parent directory
    const resolvedDir = targetNode.isDirectory
      ? targetNode.path
      : targetNode.path.substring(0, targetNode.path.lastIndexOf("/"));

    // Skip if target dir equals source parent dir (no-op move)
    if (draggedNode) {
      const sourceParent = draggedNode.path.substring(0, draggedNode.path.lastIndexOf("/"));
      if (resolvedDir === sourceParent) {
        setDropTargetDir(null);
        return;
      }
    }

    // Avoid unnecessary re-renders
    if (dropTargetDirRef.current === resolvedDir) return;

    setDropTargetDir(resolvedDir);
  }, [nodeMap, draggedNode]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingPath && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPath]);

  const handleStartRename = useCallback((path: string, currentName: string) => {
    clearSelection();
    setEditingPath(path);
    setEditingName(currentName);
  }, [clearSelection]);

  // Use refs to capture current values for the blur handler
  const editingPathRef = useRef(editingPath);
  const editingNameRef = useRef(editingName);
  useEffect(() => {
    editingPathRef.current = editingPath;
    editingNameRef.current = editingName;
  }, [editingPath, editingName]);
  
  const handleFinishRename = useCallback(async () => {
    // Use refs to get the current values (state might be stale in blur handler)
    const currentEditingPath = editingPathRef.current;
    const currentEditingName = editingNameRef.current;
    
    if (!currentEditingPath || !currentEditingName?.trim()) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    const node = nodeMap.get(currentEditingPath);
    if (!node) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    const trimmedName = currentEditingName.trim();
    
    // Skip rename if name hasn't changed
    if (trimmedName === node.name) {
      setEditingPath(null);
      setEditingName("");
      return;
    }

    // Capture values before clearing state
    const pathToRename = currentEditingPath;
    const isDirectory = node.isDirectory;

    // Clear editing state and refs immediately to prevent double-calls
    editingPathRef.current = null;
    editingNameRef.current = "";
    setEditingPath(null);
    setEditingName("");

    try {
      if (isDirectory && onRenameDirectory) {
        await onRenameDirectory(pathToRename, trimmedName);
        await reloadNotebooks();
      } else if (!isDirectory && onRenameFile) {
        await onRenameFile(pathToRename, trimmedName);
        await reloadNotebooks();
      }
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  }, [nodeMap, onRenameDirectory, onRenameFile, reloadNotebooks]);

  const handleCancelRename = useCallback(() => {
    setEditingPath(null);
    setEditingName("");
  }, []);

  const handleDuplicateFile = useCallback(async (filePath: string) => {
    if (!onReadFile || !onWriteFile) return;
    try {
      const data = await onReadFile(filePath);
      const fileName = filePath.split("/").pop() ?? "file";
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
      const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
      const baseName = ext ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;

      // Find next available copy name
      let copyName = `${baseName} (copy)${ext}`;
      if (nodeMap.has(`${parentDir}/${copyName}`)) {
        let n = 1;
        while (nodeMap.has(`${parentDir}/${baseName} (copy ${n})${ext}`)) n++;
        copyName = `${baseName} (copy ${n})${ext}`;
      }

      const blob = new Blob([new Uint8Array(data)]);
      const file = new File([blob], copyName);
      await onWriteFile(file, parentDir);
    } catch (e) {
      console.error("Failed to duplicate file:", e);
    }
  }, [onReadFile, onWriteFile, nodeMap]);

  const handleDownloadFile = useCallback(async (filePath: string) => {
    if (!onReadFile) return;
    try {
      const data = await onReadFile(filePath);
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from path
      a.download = filePath.split("/").pop() ?? "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download file:", e);
    }
  }, [onReadFile]);

  const handleExportFile = useCallback(async (filePath: string, targetFormat: "csv" | "json" | "parquet" | "xlsx") => {
    const runPython = runtime.runPython;
    if (!runPython) return;

    const fileName = filePath.split("/").pop() ?? "file";
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const sourceExt = fileName.split(".").pop()?.toLowerCase();
    const outputFileName = `${baseName}.${targetFormat}`;

    try {
      // Build DuckDB read function based on source format
      let readFunc = "";
      if (sourceExt === "csv") {
        readFunc = `read_csv('${filePath}')`;
      } else if (sourceExt === "parquet") {
        readFunc = `read_parquet('${filePath}')`;
      } else if (sourceExt === "xlsx" || sourceExt === "xls") {
        readFunc = `st_read('${filePath}')`;
      } else {
        console.error("Unsupported source format:", sourceExt);
        return;
      }

      // For Excel export, use JavaScript XLSX library
      if (targetFormat === "xlsx") {
        // First get the data as JSON from DuckDB
        const jsonCode = `
import json
rows = _duckdb_conn.execute("SELECT * FROM ${readFunc}").fetchdf().to_dict(orient='records')
json.dumps(rows, default=str)
`.trim();

        const result = await runPython(jsonCode);
        
        if (result.error) {
          console.error("Failed to read file:", result.error);
          alert(`Failed to export file: ${result.error}`);
          return;
        }

        const output = result.output?.trim();
        if (!output) {
          alert("Failed to export file: No data received");
          return;
        }

        // Parse JSON and create Excel file using XLSX library
        const XLSX = await import("xlsx");
        const data = JSON.parse(output);
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        
        const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = outputFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // Use DuckDB to read and export
      // DuckDB COPY writes to temp file, then we read it back as base64
      const tempFile = `/tmp/_export_temp.${targetFormat}`;
      let exportCode = "";
      if (targetFormat === "csv") {
        exportCode = `
import base64

_duckdb_conn.execute("COPY (SELECT * FROM ${readFunc}) TO '${tempFile}' (FORMAT CSV, HEADER)")
with open('${tempFile}', 'rb') as f:
    content = f.read()
import os
os.remove('${tempFile}')
content.decode('utf-8')
`.trim();
      } else if (targetFormat === "json") {
        exportCode = `
import base64

_duckdb_conn.execute("COPY (SELECT * FROM ${readFunc}) TO '${tempFile}' (FORMAT JSON, ARRAY true)")
with open('${tempFile}', 'rb') as f:
    content = f.read()
import os
os.remove('${tempFile}')
content.decode('utf-8')
`.trim();
      } else if (targetFormat === "parquet") {
        exportCode = `
import base64

_duckdb_conn.execute("COPY (SELECT * FROM ${readFunc}) TO '${tempFile}' (FORMAT PARQUET)")
with open('${tempFile}', 'rb') as f:
    content = f.read()
import os
os.remove('${tempFile}')
base64.b64encode(content).decode('utf-8')
`.trim();
      }

      const result = await runPython(exportCode);
      
      if (result.error) {
        console.error("Failed to convert file:", result.error);
        alert(`Failed to convert file: ${result.error}`);
        return;
      }

      const output = result.output?.trim();
      if (!output) {
        alert("Failed to convert file: No output received");
        return;
      }

      // Create blob and download
      let blob: Blob;
      if (targetFormat === "parquet") {
        const binaryStr = atob(output);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: "application/octet-stream" });
      } else {
        const mimeType = targetFormat === "json" ? "application/json" : "text/csv";
        blob = new Blob([output], { type: mimeType });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export file:", e);
      alert(`Failed to export file: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }, [runtime]);

  const handleCreateDirectory = useCallback(async (parentPath: string) => {
    if (!onCreateDirectory) return;
    const name = prompt("Enter directory name:");
    if (name && name.trim()) {
      const newPath = `${parentPath}/${name.trim()}`;
      await onCreateDirectory(newPath);
    }
  }, [onCreateDirectory]);

  const handleDeleteDirectory = useCallback(async (path: string) => {
    if (!onDeleteDirectory) return;
    if (confirm("Are you sure you want to delete this directory?")) {
      await onDeleteDirectory(path);
    }
  }, [onDeleteDirectory]);

  // External file drop (from OS) — native event listeners to bypass dnd-kit interference
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isSidebarDragOver, setIsSidebarDragOver] = useState(false);
  const [externalDropTargetDir, setExternalDropTargetDir] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const lastExternalTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const resolveTargetDir = (target: EventTarget | null): string => {
      const dirEl = (target as HTMLElement | null)?.closest?.("[data-dir-path]");
      return (dirEl as HTMLElement | null)?.dataset?.dirPath ?? "/mnt/local";
    };

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dragCounterRef.current++;
        setIsSidebarDragOver(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        const dir = resolveTargetDir(e.target);
        if (dir !== lastExternalTargetRef.current) {
          lastExternalTargetRef.current = dir;
          setExternalDropTargetDir(dir);
        }
      }
    };

    const onDragLeave = (e: DragEvent) => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsSidebarDragOver(false);
        lastExternalTargetRef.current = null;
        setExternalDropTargetDir(null);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const targetDir = resolveTargetDir(e.target);
      dragCounterRef.current = 0;
      setIsSidebarDragOver(false);
      lastExternalTargetRef.current = null;
      setExternalDropTargetDir(null);

      if (!e.dataTransfer?.files.length) return;

      const files = Array.from(e.dataTransfer.files).filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const hasExtension = file.name.includes(".");
        return ext === "csv" || ext === "parquet" || ext === "json" || ext === "xlsx" || ext === "xls" || ext === "md" || ext === "txt" || ext === "sql" || ext === "ipynb" || !hasExtension;
      });

      for (const file of files) {
        await onWriteFile(file, targetDir);
      }
      if (files.some((f) => f.name.endsWith(".ipynb"))) {
        await reloadNotebooks();
      }
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [onWriteFile, reloadNotebooks]);

  const handleCreateTextFile = useCallback(async (extension: "md" | "txt" | "") => {
    const extLabel = extension === "md" ? "Markdown" : extension === "txt" ? "Text" : "Plain";
    const defaultName = extension ? `untitled.${extension}` : "untitled";
    const name = prompt(`Enter ${extLabel} file name:`, defaultName);
    if (name && name.trim()) {
      const fileName = name.trim();
      const blob = new Blob([""], { type: "text/plain" });
      const file = new File([blob], fileName, { type: "text/plain" });
      await onWriteFile(file, "/mnt/local");
      onOpenFile(`/mnt/local/${fileName}`);
    }
  }, [onWriteFile, onOpenFile]);

  const handleCreateSqlFile = useCallback(async () => {
    const name = prompt("Enter SQL file name:", "untitled.sql");
    if (name && name.trim()) {
      const fileName = name.trim().endsWith(".sql") ? name.trim() : `${name.trim()}.sql`;
      const blob = new Blob([""], { type: "text/plain" });
      const file = new File([blob], fileName, { type: "text/plain" });
      await onWriteFile(file, "/mnt/local");
      onOpenFile(`/mnt/local/${fileName}`);
    }
  }, [onWriteFile, onOpenFile]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  // Multi-selection callbacks
  const handleNodeSelect = useCallback((path: string, isDirectory: boolean, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (modifiers.shiftKey && lastSelectedPath) {
      const anchorIdx = flatVisibleNodes.indexOf(lastSelectedPath);
      const targetIdx = flatVisibleNodes.indexOf(path);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        setSelectedPaths(new Set(flatVisibleNodes.slice(start, end + 1)));
        return;
      }
      // anchor or target not visible — fall through to plain click
    }

    if (modifiers.metaKey || modifiers.ctrlKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setLastSelectedPath(path);
      return;
    }

    // Plain click — clear selection, set anchor
    clearSelection();
    setLastSelectedPath(path);
    if (isDirectory) {
      toggleExpanded(path);
    } else {
      onOpenFile(path);
    }
  }, [lastSelectedPath, flatVisibleNodes, clearSelection, onOpenFile, toggleExpanded]);

  const handleBulkDelete = useCallback(async (paths: Set<string>) => {
    const count = paths.size;
    if (!confirm(`Delete ${count} item${count > 1 ? "s" : ""}?`)) return;
    // Delete deepest paths first so child files are removed before their parent directories
    const sorted = [...paths].sort((a, b) => b.split("/").length - a.split("/").length);
    for (const p of sorted) {
      const node = nodeMap.get(p);
      if (node?.isDirectory) {
        await onDeleteDirectory(p);
      } else {
        await onDeleteFile(p);
      }
    }
    clearSelection();
  }, [onDeleteFile, onDeleteDirectory, nodeMap, clearSelection]);

  const handleBulkDownload = useCallback(async (paths: Set<string>) => {
    for (const p of paths) {
      const node = nodeMap.get(p);
      if (node?.isDirectory) continue; // skip directories
      await handleDownloadFile(p);
    }
  }, [handleDownloadFile, nodeMap]);

  // Delete key triggers bulk delete when items are selected
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedPaths.size === 0) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't trigger while renaming or typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        handleBulkDelete(selectedPaths);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPaths, handleBulkDelete]);

  // ---- Resize handle logic ----
  const [sidebarWidth, setSidebarWidth] = useState(224); // 224px = w-56

  if (collapsed) {
    return (
      <div className="w-10 border-r border-neutral-200 dark:border-sidebar-border bg-neutral-50/30 dark:bg-sidebar flex flex-col items-center py-2 select-none">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <div className="mt-4 flex flex-col gap-1">
          {onShowHome && (
            <button
              onClick={onShowHome}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                showHome
                  ? "bg-neutral-100 dark:bg-sidebar-accent text-neutral-950 dark:text-sidebar-foreground"
                  : "text-neutral-400 dark:text-muted-foreground hover:text-neutral-950 dark:hover:text-sidebar-foreground hover:bg-neutral-50 dark:hover:bg-sidebar-accent",
              )}
              title="Home"
            >
              <Home size={14} />
            </button>
          )}
          {notebooks.slice(0, 5).map((notebook) => (
            <button
              key={notebook.filePath}
              onClick={() => onSelectFile(notebook.filePath)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                !showHome && notebook.filePath === activeFilePath
                  ? "bg-neutral-100 dark:bg-sidebar-accent text-neutral-950 dark:text-sidebar-foreground"
                  : "text-neutral-400 dark:text-muted-foreground hover:text-neutral-950 dark:hover:text-sidebar-foreground hover:bg-neutral-50 dark:hover:bg-sidebar-accent",
              )}
              title={notebook.name}
            >
              <LogoJupyter size={14} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ResizablePanel
      direction="horizontal"
      size={sidebarWidth}
      onSizeChange={setSidebarWidth}
      minSize={140}
      maxSize={600}
      contentRef={sidebarRef}
      contentClassName={cn(
        "border-r border-neutral-200 dark:border-sidebar-border bg-neutral-50/30 dark:bg-sidebar flex flex-col select-none",
        isSidebarDragOver && "ring-2 ring-inset ring-blue-400/50"
      )}
    >
      {/* Home button */}
      {onShowHome && (
        <button
          onClick={onShowHome}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs transition-colors border-b border-neutral-200/50 dark:border-neutral-800/50",
            showHome
              ? "text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-sidebar-accent"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-sidebar-accent/50",
          )}
        >
          <Home size={14} />
          <span className="font-medium">Home</span>
        </button>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-200/50 dark:border-neutral-800/50">
        <span className="font-mono text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
                title="New file"
              >
                <Plus size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 min-w-0">
              <DropdownMenuItem onClick={() => onCreateNotebook()} className="text-xs py-1.5">
                <LogoJupyter size={12} />
                <span>Notebook</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCreateTextFile("md")} className="text-xs py-1.5">
                <Document size={12} />
                <span>Markdown (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTextFile("txt")} className="text-xs py-1.5">
                <Txt size={12} />
                <span>Text file (.txt)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateSqlFile} className="text-xs py-1.5">
                <DocumentBlank size={12} />
                <span>SQL file (.sql)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable content - Unified file tree */}
      <DndContext
        id="file-sidebar-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
      >
        <ScrollArea className="flex-1 min-h-0">
          <div className="py-1" onClick={clearSelection}>
            <FileTreeNodeComponent
              node={fileTree}
              depth={0}
              expandedPaths={expandedPaths}
              onDeleteFile={onDeleteFile}
              onCopyPath={handleCopyPath}
              activeNotebookPath={showHome ? null : activeFilePath}
              onDuplicateFile={handleDuplicateFile}
              onDownloadFile={handleDownloadFile}
              onExportFile={handleExportFile}
              editingPath={editingPath}
              editingName={editingName}
              setEditingName={setEditingName}
              editInputRef={editInputRef}
              onStartRename={handleStartRename}
              onFinishRename={handleFinishRename}
              onCancelRename={handleCancelRename}
              onCreateDirectory={handleCreateDirectory}
              onDeleteDirectory={handleDeleteDirectory}
              dropTargetDir={dropTargetDir}
              isDragging={!!draggedNode}
              externalDropTargetDir={externalDropTargetDir}
              transferring={transferring}
              onNodeContextMenu={handleNodeContextMenu}
              selectedPaths={selectedPaths}
              onNodeSelect={handleNodeSelect}
            />
          </div>
        </ScrollArea>
        {/* Right-click context menu — keyed DropdownMenu forces remount at new cursor position */}
        {contextMenu && (
          <DropdownMenu key={contextMenu.key} open modal={false} onOpenChange={(open) => !open && setContextMenu(null)}>
            <DropdownMenuTrigger asChild>
              <div className="fixed" style={{ left: contextMenu.x, top: contextMenu.y, width: 0, height: 0 }} />
            </DropdownMenuTrigger>
            <FileTreeContextMenuContent
              node={contextMenu.node}
              onCreateDirectory={handleCreateDirectory}
              onStartRename={handleStartRename}
              onDeleteDirectory={handleDeleteDirectory}
              onDuplicateFile={handleDuplicateFile}
              onDownloadFile={handleDownloadFile}
              onExportFile={handleExportFile}
              onCopyPath={handleCopyPath}
              onDeleteFile={onDeleteFile}
              selectedPaths={contextMenu.selectedPaths}
              onBulkDelete={handleBulkDelete}
              onBulkDownload={handleBulkDownload}
            />
          </DropdownMenu>
        )}
        <DragOverlay dropAnimation={null}>
          {draggedNode && (
            <DragOverlayItem node={draggedNode} />
          )}
        </DragOverlay>
      </DndContext>

      {/* Confirmation dialog for file overwrite */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && handleCancelMove()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing file?</AlertDialogTitle>
            <AlertDialogDescription>
              A file named <span className="font-medium text-neutral-700 dark:text-neutral-300">&quot;{pendingMove?.existingFileName}&quot;</span> already exists in this location. Do you want to replace it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMove}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResizablePanel>
  );
}

// ============================================================================
// File Tree Node Component
// ============================================================================

interface FileTreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onDeleteFile: (path: string) => Promise<boolean>;
  onCopyPath: (path: string) => void;
  activeNotebookPath: string | null;
  onDuplicateFile: (path: string) => Promise<void>;
  onDownloadFile: (name: string) => Promise<void>;
  onExportFile: (path: string, format: "csv" | "json" | "parquet" | "xlsx") => Promise<void>;
  // Rename props
  editingPath: string | null;
  editingName: string;
  setEditingName: (name: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onStartRename: (path: string, currentName: string) => void;
  onFinishRename: () => void;
  onCancelRename: () => void;
  // Directory-specific props
  onCreateDirectory: (parentPath: string) => void;
  onDeleteDirectory: (path: string) => void;
  // DnD props
  dropTargetDir: DropTargetDir;
  isDragging: boolean;
  externalDropTargetDir: string | null;
  // Transfer state
  transferring: { fileName: string; targetDir: string; sourcePath: string } | null;
  // Context menu
  onNodeContextMenu: (node: FileTreeNode, x: number, y: number) => void;
  // Multi-selection
  selectedPaths: Set<string>;
  onNodeSelect: (path: string, isDirectory: boolean, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
}

function FileTreeNodeComponent({
  node,
  depth,
  expandedPaths,
  onDeleteFile,
  onCopyPath,
  activeNotebookPath,
  onDuplicateFile,
  onDownloadFile,
  onExportFile,
  editingPath,
  editingName,
  setEditingName,
  editInputRef,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onCreateDirectory,
  onDeleteDirectory,
  dropTargetDir,
  isDragging,
  externalDropTargetDir,
  transferring,
  onNodeContextMenu,
  selectedPaths,
  onNodeSelect,
}: FileTreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isActiveFile = !node.isDirectory && node.path === activeNotebookPath;
  const isEditing = node.path === editingPath;
  const isBeingTransferred = transferring?.sourcePath === node.path;

  // Files (including notebooks) can be dragged, but not directories
  const canDrag = !node.isDirectory;

  // Use separate IDs for draggable vs droppable to avoid collision
  const draggableId = `drag:${node.path}`;
  const droppableId = `drop:${node.path}`;

  // Use draggable hook for files
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging: isThisDragging,
  } = useDraggable({
    id: draggableId,
    disabled: !canDrag,
    data: { node },
  });

  // Use droppable hook for all nodes (enables between-items drop detection)
  const {
    setNodeRef: setDropRef,
  } = useDroppable({
    id: droppableId,
    disabled: false,
    data: { node },
  });

  // Combine refs - both refs should always be set on the element
  const setNodeRef = useCallback((el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  }, [setDragRef, setDropRef]);

  const isDropOnTarget = node.isDirectory && dropTargetDir === node.path && isDragging;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeSelect(node.path, node.isDirectory, { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
  }, [node.isDirectory, node.path, onNodeSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu(node, e.clientX, e.clientY);
  }, [node, onNodeContextMenu]);

  const isExternalDropTarget = node.isDirectory && externalDropTargetDir === node.path;
  const showDragHighlight = isDropOnTarget || isExternalDropTarget;

  return (
    <div
      className={cn(
        "transition-colors",
        showDragHighlight && "bg-neutral-500/10 dark:bg-neutral-300/5",
      )}
      {...(node.isDirectory ? { "data-dir-path": node.path } : {})}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1 pr-1 py-0.5 text-xs transition-colors select-none min-w-0",
          "hover:bg-neutral-100 dark:hover:bg-accent",
          isActiveFile && "bg-neutral-100 dark:bg-sidebar-accent",
          selectedPaths.has(node.path) && !isActiveFile && "bg-blue-50 dark:bg-blue-900/20",
          isThisDragging && "opacity-30",
          isBeingTransferred && "opacity-0 h-0 py-0 overflow-hidden",
          canDrag && "touch-none"
        )}
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
        onContextMenu={handleContextMenu}
        {...dragListeners}
        {...dragAttributes}
        onClick={handleClick}
      >
        {node.isDirectory && (
          <ChevronRight
            size={12}
            className={cn(
              "text-neutral-400 shrink-0",
              isExpanded && "rotate-90"
            )}
          />
        )}

        {!node.isDirectory && <FileIconForName name={node.name} size={12} className={cn(
            "shrink-0",
            isActiveFile ? "text-brand" : "text-neutral-500"
          )} />}

        {isEditing ? (
          <Input
            ref={editInputRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={onFinishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 px-1 py-0 text-xs border-0 bg-white dark:bg-muted focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-ring flex-1"
          />
        ) : (
          <span className={cn(
            "font-medium truncate flex-1 text-xs",
            "text-neutral-700 dark:text-neutral-300",
            isActiveFile && "text-neutral-950 dark:text-neutral-100"
          )}>
            {node.name}
          </span>
        )}

        {!node.isDirectory && !node.isNotebook && node.size !== undefined && (
          <span className="text-neutral-400 dark:text-neutral-500 text-[9px] shrink-0 mr-0.5">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && (() => {
        const showGhost = transferring && transferring.targetDir === node.path;
        // Compute sorted insertion index for ghost file
        let ghostIndex = node.children.length;
        if (showGhost) {
          const isGhostNotebook = isNotebookFile(transferring.fileName);
          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            // Directories come first — ghost is always a file, so skip directories
            if (child.isDirectory) continue;
            // Notebooks come before regular files
            if (child.isNotebook && !isGhostNotebook) continue;
            if (!child.isNotebook && isGhostNotebook) { ghostIndex = i; break; }
            // Same category — compare alphabetically
            if (transferring.fileName.localeCompare(child.name) <= 0) { ghostIndex = i; break; }
          }
        }

        const ghostElement = showGhost ? (
          <div
            key="__ghost_transfer"
            className="flex items-center gap-1 px-1 py-1 text-xs rounded-sm animate-pulse"
            style={{ paddingLeft: `${(depth + 1) * 10 + 4}px` }}
          >
            <Loader2 size={12} className="animate-spin text-neutral-400 shrink-0" />
            <span className="font-medium text-xs text-neutral-400 dark:text-neutral-500 truncate">
              {transferring.fileName}
            </span>
          </div>
        ) : null;

        const renderChild = (child: FileTreeNode) => (
          <FileTreeNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            onDeleteFile={onDeleteFile}
            onCopyPath={onCopyPath}
            activeNotebookPath={activeNotebookPath}
            onDuplicateFile={onDuplicateFile}
            onDownloadFile={onDownloadFile}
            onExportFile={onExportFile}
            editingPath={editingPath}
            editingName={editingName}
            setEditingName={setEditingName}
            editInputRef={editInputRef}
            onStartRename={onStartRename}
            onFinishRename={onFinishRename}
            onCancelRename={onCancelRename}
            onCreateDirectory={onCreateDirectory}
            onDeleteDirectory={onDeleteDirectory}
            dropTargetDir={dropTargetDir}
            isDragging={isDragging}
            externalDropTargetDir={externalDropTargetDir}
            transferring={transferring}
            onNodeContextMenu={onNodeContextMenu}
            selectedPaths={selectedPaths}
            onNodeSelect={onNodeSelect}
          />
        );

        return (
          <div>
            {node.children.map((child, i) => (
              ghostElement && i === ghostIndex
                ? <Fragment key={child.path}>{ghostElement}{renderChild(child)}</Fragment>
                : renderChild(child)
            ))}
            {ghostElement && ghostIndex >= node.children.length && ghostElement}
            {node.children.length === 0 && !showGhost && (
              <div
                className="text-[9px] text-neutral-400 dark:text-neutral-500 italic py-1"
                style={{ paddingLeft: `${(depth + 1) * 10 + 16}px` }}
              >
                Empty
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================================
// Shared Context Menu Content
// ============================================================================

function getExportFormats(ext: string | undefined) {
  const formats: Array<{ format: "csv" | "json" | "parquet" | "xlsx"; label: string; icon: React.ComponentType<{ size?: number }> }> = [];
  if (ext === "csv") {
    formats.push(
      { format: "json", label: "JSON", icon: Json },
      { format: "parquet", label: "Parquet", icon: DataTable },
    );
  } else if (ext === "parquet") {
    formats.push(
      { format: "csv", label: "CSV", icon: Csv },
      { format: "json", label: "JSON", icon: Json },
    );
  }
  return formats;
}

interface FileTreeContextMenuContentProps {
  node: FileTreeNode | null;
  onCreateDirectory: (parentPath: string) => void;
  onStartRename: (path: string, currentName: string) => void;
  onDeleteDirectory: (path: string) => void;
  onDuplicateFile: (path: string) => Promise<void>;
  onDownloadFile: (path: string) => Promise<void>;
  onExportFile: (path: string, format: "csv" | "json" | "parquet" | "xlsx") => Promise<void>;
  onCopyPath: (path: string) => void;
  onDeleteFile: (path: string) => Promise<boolean>;
  selectedPaths: Set<string>;
  onBulkDelete: (paths: Set<string>) => Promise<void>;
  onBulkDownload: (paths: Set<string>) => Promise<void>;
}

function FileTreeContextMenuContent({
  node,
  onCreateDirectory,
  onStartRename,
  onDeleteDirectory,
  onDuplicateFile,
  onDownloadFile,
  onExportFile,
  onCopyPath,
  onDeleteFile,
  selectedPaths,
  onBulkDelete,
  onBulkDownload,
}: FileTreeContextMenuContentProps) {
  if (!node) return null;

  // Bulk menu when multiple items are selected
  if (selectedPaths.size > 1) {
    const label = `${selectedPaths.size} items`;
    return (
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem
          onClick={() => onBulkDownload(selectedPaths)}
          className="text-xs"
        >
          <Download size={12} className="mr-2" />
          Download {label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onBulkDelete(selectedPaths)}
          className="text-xs text-red-600 dark:text-red-400"
        >
          <Trash2 size={12} className="mr-2" />
          Delete {label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  }

  if (node.isDirectory) {
    const isRootLocalDir = node.path === "/mnt/local";
    const canDelete = !isRootLocalDir && node.path !== "/mnt";

    return (
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onClick={() => onCreateDirectory(node.path)}
          className="text-xs"
        >
          <span className="mr-2"><FolderAdd size={12} /></span>
          New folder
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuItem
              onClick={() => onStartRename(node.path, node.name)}
              className="text-xs"
            >
              <Pencil size={12} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteDirectory(node.path)}
              className="text-xs text-red-600 dark:text-red-400"
            >
              <Trash2 size={12} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    );
  }

  const ext = node.name.split(".").pop()?.toLowerCase();
  const isExportable = ext === "parquet" || ext === "xlsx" || ext === "xls";
  const exportFormats = getExportFormats(ext);

  return (
    <DropdownMenuContent align="start" className="w-40">
      <DropdownMenuItem
        onClick={() => onStartRename(node.path, node.name)}
        className="text-xs"
      >
        <Pencil size={12} className="mr-2" />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onDuplicateFile(node.path)}
        className="text-xs"
      >
        <Copy size={12} className="mr-2" />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onDownloadFile(node.path)}
        className="text-xs"
      >
        <Download size={12} className="mr-2" />
        Download
      </DropdownMenuItem>
      {isExportable && exportFormats.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <Share size={12} className="mr-2" />
            Export as
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
            {exportFormats.map(({ format, label, icon: Icon }) => (
              <DropdownMenuItem
                key={format}
                onClick={() => onExportFile(node.path, format)}
                className="text-xs"
              >
                <span className="mr-2"><Icon size={12} /></span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem
        onClick={() => onCopyPath(node.path)}
        className="text-xs"
      >
        <Copy size={12} className="mr-2" />
        Copy path
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => onDeleteFile(node.path)}
        className="text-xs text-red-600 dark:text-red-400"
      >
        <Trash2 size={12} className="mr-2" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

// ============================================================================
// Drag Overlay Item Component
// ============================================================================

function DragOverlayItem({ node }: { node: FileTreeNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-xs bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700">
      <FileIconForName name={node.name} size={12} className="text-neutral-500 shrink-0" />
      <span className="font-medium text-neutral-700 dark:text-neutral-300 text-xs">
        {node.name}
      </span>
    </div>
  );
}
