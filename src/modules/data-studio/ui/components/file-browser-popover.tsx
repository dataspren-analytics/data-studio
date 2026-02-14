"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  DocumentBlank as CarbonDocumentBlank,
  Folder as CarbonFolder,
  FolderOpen as CarbonFolderOpen,
  DataTable as CarbonDataTable,
} from "@carbon/icons-react";
import {
  ChevronRight,
  Copy,
  HardDrive,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { FileInfo } from "../../runtime";
import { formatFileSize, getFileIcon } from "../lib/utils";

// ============================================================================
// Types
// ============================================================================

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileTreeNode[];
}

interface FileBrowserPopoverProps {
  /** Files from the execution backend */
  files: FileInfo[];
  /** Callback when a file is deleted */
  onDeleteFile?: (fileName: string) => Promise<boolean>;
  /** Callback when a path is copied */
  onCopyPath?: (path: string) => void;
  /** The trigger element */
  children: React.ReactNode;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a tree structure from flat file list
 */
function buildFileTree(files: FileInfo[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "mnt",
    path: "/mnt",
    isDirectory: true,
    children: [],
  };

  for (const file of files) {
    // Path is like "/mnt/local/filename.csv"
    const parts = file.path.split("/").filter(Boolean); // ["mnt", "local", "filename.csv"]

    let current = root;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = "/" + parts.slice(0, i + 1).join("/");

      if (!current.children) {
        current.children = [];
      }

      let child = current.children.find((c) => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          isDirectory: !isLast,
          size: isLast ? file.size : undefined,
          children: isLast ? undefined : [],
        };
        current.children.push(child);
      }

      current = child;
    }
  }

  // Sort children: directories first, then alphabetically
  function sortChildren(node: FileTreeNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  }

  sortChildren(root);

  return root;
}

/**
 * Get file type from filename
 */
function getFileType(name: string): "csv" | "parquet" | "json" | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "parquet") return "parquet";
  if (ext === "json") return "json";
  return undefined;
}

// ============================================================================
// TreeNode Component
// ============================================================================

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onDeleteFile?: (fileName: string) => Promise<boolean>;
  onCopyPath?: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  expandedPaths,
  onToggle,
  onDeleteFile,
  onCopyPath,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const fileType = !node.isDirectory ? getFileType(node.name) : undefined;
  const FileIcon = fileType ? getFileIcon(fileType) : CarbonDocumentBlank;

  const handleCopyPath = useCallback(() => {
    if (onCopyPath) {
      onCopyPath(node.path);
    } else {
      navigator.clipboard.writeText(node.path);
    }
  }, [node.path, onCopyPath]);

  const handleDelete = useCallback(async () => {
    if (onDeleteFile && !node.isDirectory) {
      await onDeleteFile(node.name);
    }
  }, [node.name, node.isDirectory, onDeleteFile]);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1 text-xs rounded-sm transition-colors cursor-pointer",
          "hover:bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => node.isDirectory && onToggle(node.path)}
      >
        {/* Expand/collapse chevron */}
        {node.isDirectory ? (
          <ChevronRight
            size={12}
            className={cn(
              "text-muted-foreground transition-transform shrink-0",
              isExpanded && "rotate-90"
            )}
          />
        ) : (
          <div className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {node.isDirectory ? (
          isExpanded ? (
            <span className="text-amber-500 shrink-0"><CarbonFolderOpen size={14} /></span>
          ) : (
            <span className="text-amber-500 shrink-0"><CarbonFolder size={14} /></span>
          )
        ) : (
          <FileIcon size={14} className="text-muted-foreground shrink-0" />
        )}

        {/* Name */}
        <span className="font-medium text-popover-foreground truncate flex-1">
          {node.name}
        </span>

        {/* Size (for files) */}
        {!node.isDirectory && node.size !== undefined && (
          <span className="text-muted-foreground text-[10px] shrink-0 mr-1">
            {formatFileSize(node.size)}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopyPath();
            }}
            className="p-0.5 text-muted-foreground hover:text-popover-foreground transition-colors"
            title="Copy path"
          >
            <Copy size={12} />
          </button>
          {!node.isDirectory && onDeleteFile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
              title="Delete file"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onDeleteFile={onDeleteFile}
              onCopyPath={onCopyPath}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className="text-[10px] text-muted-foreground italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FileBrowserPopover Component
// ============================================================================

export function FileBrowserPopover({
  files,
  onDeleteFile,
  onCopyPath,
  children,
}: FileBrowserPopoverProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["/mnt", "/mnt/local"])
  );

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const totalFiles = files.length;
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <HardDrive size={14} className="text-muted-foreground" />
          <span className="font-medium text-sm text-popover-foreground">
            File Browser
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {totalFiles} {totalFiles === 1 ? "file" : "files"}
            {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
          </span>
        </div>

        {/* Tree */}
        <ScrollArea className="max-h-80">
          <div className="py-1">
            {files.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <span className="mx-auto text-muted-foreground/50 mb-2 block w-fit">
                  <CarbonDataTable size={24} />
                </span>
                <p className="text-xs text-muted-foreground">No files yet</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Upload CSV, Parquet, or JSON files
                </p>
              </div>
            ) : (
              <TreeNode
                node={fileTree}
                depth={0}
                expandedPaths={expandedPaths}
                onToggle={toggleExpanded}
                onDeleteFile={onDeleteFile}
                onCopyPath={onCopyPath}
              />
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border bg-muted/50">
          <p className="text-[10px] text-muted-foreground">
            Files are accessible in Python at their path, e.g.{" "}
            <code className="bg-muted px-1 rounded">
              /mnt/local/file.csv
            </code>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
