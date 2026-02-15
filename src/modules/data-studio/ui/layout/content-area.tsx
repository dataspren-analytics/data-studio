"use client";

import { FileX } from "lucide-react";
import { Sidebar } from "../components/sidebar";
import { getFileExtension } from "../viewers/types";
import { CsvFileViewer } from "../viewers/csv-file-viewer";
import { ExcelFileViewer } from "../viewers/excel-file-viewer";
import { JsonFileViewer } from "../viewers/json-file-viewer";
import { NotebookCellsViewer } from "../viewers/notebook-cells-viewer";
import { ParquetFileViewer } from "../viewers/parquet-file-viewer";
import { TextFileViewer } from "../viewers/text-file-viewer";
import { useNotebook, useRuntime } from "../provider";
export function ContentArea() {
  const { activeFilePath } = useNotebook();
  const runtime = useRuntime();

  const extension = activeFilePath ? getFileExtension(activeFilePath) : null;
  const isNotebook = !activeFilePath || extension === ".ipynb";

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Content viewer - based on file type */}
      <ContentViewer filePath={activeFilePath} />

      {/* Content sidebar - only shown for notebooks */}
      {isNotebook && (
        <div className="w-60 border-l border-stone-200 dark:border-border bg-white dark:bg-sidebar flex flex-col">
          <div className="flex-1 overflow-auto">
            <Sidebar
              functions={runtime.functions}
              variables={runtime.variables}
              tables={runtime.tables}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ContentViewerProps {
  filePath: string | null;
}

function ContentViewer({ filePath }: ContentViewerProps) {
  const runtime = useRuntime();
  const { activeNotebook } = useNotebook();
  const extension = filePath ? getFileExtension(filePath) : null;

  if (!filePath) {
    return <NotebookCellsViewer />;
  }

  // Check if file still exists (only after runtime has loaded files)
  if (runtime.isReady && runtime.dataFiles.length > 0) {
    const fileExists = runtime.dataFiles.some((f) => f.path === filePath);
    if (!fileExists) {
      const fileName = filePath.split("/").pop() ?? filePath;
      return (
        <div className="flex-1 flex items-center justify-center bg-stone-50 dark:bg-background">
          <div className="flex flex-col items-center gap-3 max-w-sm text-center px-4">
            <FileX size={32} className="text-neutral-400 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">File not available</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              <span className="font-mono">{fileName}</span> may have been deleted or moved.
            </p>
          </div>
        </div>
      );
    }
  }

  switch (extension) {
    case ".csv":
      return <CsvFileViewer filePath={filePath} runtime={runtime} />;
    case ".json":
      return <JsonFileViewer filePath={filePath} runtime={runtime} />;
    case ".parquet":
      return <ParquetFileViewer filePath={filePath} runtime={runtime} />;
    case ".xlsx":
    case ".xls":
      return <ExcelFileViewer filePath={filePath} runtime={runtime} />;
    case ".md":
    case ".txt":
    case "none":
      return <TextFileViewer filePath={filePath} runtime={runtime} />;
    case ".ipynb":
    case null:
    default:
      return <NotebookCellsViewer />;
  }
}
