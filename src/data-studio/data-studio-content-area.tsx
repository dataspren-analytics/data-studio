"use client";

import { FileX, Loader2 } from "lucide-react";
import { CsvFileViewer } from "./viewers/csv-file-viewer";
import { ExcelFileViewer } from "./viewers/excel-file-viewer";
import { IpynbFileViewer } from "./viewers/ipynb-file-viewer";
import { JsonFileViewer } from "./viewers/json-file-viewer";
import { ParquetFileViewer } from "./viewers/parquet-file-viewer";
import { SqlFileViewer } from "./viewers/sql-file-viewer";
import { TextFileViewer } from "./viewers/text-file-viewer";
import { useRuntime } from "./provider/runtime-provider";
import { useAppStore, selectActiveFilePath } from "./store";
import { FileExtension } from "./viewers/types";

export function ContentArea() {
  const runtime = useRuntime();
  const activeFilePath = useAppStore(selectActiveFilePath);

  if (!activeFilePath) {
    return <IpynbFileViewer filePath="" runtime={runtime} />;
  }

  function getFileExtension(filePath: string): FileExtension | null {
    if (filePath.endsWith(".csv")) return ".csv";
    if (filePath.endsWith(".ipynb")) return ".ipynb";
    if (filePath.endsWith(".json")) return ".json";
    if (filePath.endsWith(".parquet")) return ".parquet";
    if (filePath.endsWith(".xlsx")) return ".xlsx";
    if (filePath.endsWith(".xls")) return ".xls";
    if (filePath.endsWith(".md")) return ".md";
    if (filePath.endsWith(".txt")) return ".txt";
    if (filePath.endsWith(".sql")) return ".sql";
  
    const fileName = filePath.split("/").pop() || "";
    if (!fileName.includes(".")) return "none";
  
    return null;
  }



  const extension = getFileExtension(activeFilePath);

  // Check if file still exists (only after runtime has loaded files)
  if (runtime.isReady && runtime.dataFiles.length > 0) {
    const fileExists = runtime.dataFiles.some((f) => f.path === activeFilePath);
    if (!fileExists) {
      const fileName = activeFilePath.split("/").pop() ?? activeFilePath;
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

  // Show a loading state for data files when the runtime isn't ready yet
  // CSV files read directly from OPFS and don't need the runtime
  if (!runtime.isReady && extension !== ".ipynb" && extension !== ".csv") {
    return (
      <div className="flex-1 flex items-center justify-center bg-stone-50 dark:bg-background">
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading runtime...</span>
        </div>
      </div>
    );
  }

  switch (extension) {
    case ".csv":
      return <CsvFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".json":
      return <JsonFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".parquet":
      return <ParquetFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".xlsx":
    case ".xls":
      return <ExcelFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".sql":
      return <SqlFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".md":
    case ".txt":
    case "none":
      return <TextFileViewer filePath={activeFilePath} runtime={runtime} />;
    case ".ipynb":
    case null:
    default:
      return <IpynbFileViewer filePath={activeFilePath} runtime={runtime} />;
  }
}
