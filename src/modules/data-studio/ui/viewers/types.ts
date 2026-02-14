import type { RuntimeState } from "../lib/types";

export interface FileViewerProps {
  filePath: string;
  runtime: RuntimeState;
}

export type FileViewerComponent = React.ComponentType<FileViewerProps>;

export type FileExtension = ".csv" | ".ipynb" | ".json" | ".parquet" | ".xlsx" | ".xls" | ".md" | ".txt" | "none";

export function getFileExtension(filePath: string): FileExtension | null {
  if (filePath.endsWith(".csv")) return ".csv";
  if (filePath.endsWith(".ipynb")) return ".ipynb";
  if (filePath.endsWith(".json")) return ".json";
  if (filePath.endsWith(".parquet")) return ".parquet";
  if (filePath.endsWith(".xlsx")) return ".xlsx";
  if (filePath.endsWith(".xls")) return ".xls";
  if (filePath.endsWith(".md")) return ".md";
  if (filePath.endsWith(".txt")) return ".txt";
  
  const fileName = filePath.split("/").pop() || "";
  if (!fileName.includes(".")) return "none";
  
  return null;
}
