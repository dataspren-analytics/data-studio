import { Csv as CarbonCsv, DataTable as CarbonDataTable, DocumentBlank as CarbonDocumentBlank } from "@carbon/icons-react";
import { downloadNotebook, type AssertTest, type RegisteredFile, type TableData } from "../../runtime";

// Re-export notebook serialization
export { downloadNotebook as exportNotebook };

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function downloadString(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadTableData(
  tableData: TableData,
  format: "csv" | "json",
  filename: string,
): void {
  let content: string;
  let mimeType: string;

  if (format === "csv") {
    const escapeCsvValue = (value: unknown): string => {
      const str = value === null ? "" : String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];
    const header = columns.map(escapeCsvValue).join(",");
    const rows = tableData.map((row) => columns.map((col) => escapeCsvValue(row[col])).join(","));
    content = [header, ...rows].join("\n");
    mimeType = "text/csv";
  } else {
    content = JSON.stringify(tableData, null, 2);
    mimeType = "application/json";
  }

  downloadString(content, mimeType, `${filename}.${format}`);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generateTestSQL(test: AssertTest): string {
  const escapeCol = (col: string) => `"${col.replace(/"/g, '""')}"`;

  switch (test.type) {
    case "unique":
      return `SELECT ${escapeCol(test.columnName)}, COUNT(*) as _count FROM ${test.tableName} GROUP BY ${escapeCol(test.columnName)} HAVING COUNT(*) > 1 LIMIT 10`;
    case "not_null":
      return `SELECT * FROM ${test.tableName} WHERE ${escapeCol(test.columnName)} IS NULL LIMIT 10`;
    case "accepted_values": {
      const values = (test.acceptedValues || [])
        .map((v) => `'${v.replace(/'/g, "''")}'`)
        .join(", ");
      return `SELECT * FROM ${test.tableName} WHERE ${escapeCol(test.columnName)} NOT IN (${values}) AND ${escapeCol(test.columnName)} IS NOT NULL LIMIT 10`;
    }
    case "custom_sql":
      return test.customSQL || "SELECT 1 WHERE FALSE";
    default:
      return "SELECT 1 WHERE FALSE";
  }
}

export function getFileIcon(type: RegisteredFile["type"]) {
  switch (type) {
    case "csv":
      return CarbonCsv;
    case "parquet":
      return CarbonDataTable;
    default:
      return CarbonDocumentBlank;
  }
}
