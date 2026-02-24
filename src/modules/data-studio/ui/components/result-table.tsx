"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ROW_HEIGHT, VISIBLE_ROWS } from "../lib/constants";
import { getTableColumns, type TableData } from "../../runtime";
import { downloadString, downloadTableData } from "../lib/utils";
import { CellContentPopover } from "./cell-content-popover";
import { useRuntime } from "../provider/runtime-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const VISIBLE_ROW_OPTIONS = [3, 6, 9] as const;

interface ResultTableProps {
  tableData: TableData;
  totalRows?: number;
  viewName?: string;
  cellId: string;
  visibleRows?: number;
  onChangeVisibleRows?: (rows: number) => void;
  fillHeight?: boolean;
}

function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function buildOrderByClause(sorting: SortingState): string {
  if (sorting.length === 0) return "";
  return " ORDER BY " + sorting.map((s) => `${escapeIdentifier(s.id)} ${s.desc ? "DESC" : "ASC"}`).join(", ");
}

export function ResultTable({ tableData, totalRows, viewName, cellId, visibleRows, onChangeVisibleRows, fillHeight }: ResultTableProps) {
  const runtime = useRuntime();
  const viewExists = !!viewName && runtime.tables.some((t) => t.name === viewName);
  const isServerSorted = viewExists;

  const [sorting, setSorting] = useState<SortingState>([]);
  const [sortedData, setSortedData] = useState<TableData | null>(null);
  const [isSorting, setIsSorting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "json" | null>(null);
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Reset sorted data when tableData changes (cell re-run)
  const tableDataRef = useRef(tableData);
  useEffect(() => {
    if (tableDataRef.current !== tableData) {
      tableDataRef.current = tableData;
      setSortedData(null);
      setSorting([]);
    }
  }, [tableData]);

  // Server-side sorting: query DuckDB when sorting changes and viewName is present
  const sortingRequestRef = useRef(0);
  useEffect(() => {
    if (!isServerSorted || sorting.length === 0) {
      setSortedData(null);
      return;
    }

    const requestId = ++sortingRequestRef.current;
    setIsSorting(true);

    const orderBy = buildOrderByClause(sorting);
    const query = `SELECT * FROM ${escapeIdentifier(viewName!)}${orderBy} LIMIT 500`;

    runtime.runSQL(query).then((result) => {
      if (requestId !== sortingRequestRef.current) return;
      if (result.tableData) {
        setSortedData(result.tableData);
      }
      setIsSorting(false);
    }).catch(() => {
      if (requestId !== sortingRequestRef.current) return;
      setIsSorting(false);
    });
  }, [isServerSorted, sorting, viewName, runtime]);

  // The data to display: sorted result or original tableData
  const displayData = (isServerSorted && sortedData) ? sortedData : tableData;

  const columnNames = useMemo(() => getTableColumns(tableData), [tableData]);

  const measureColumns = useCallback(() => {
    if (!headerRef.current) return;
    const cells = headerRef.current.children;
    const widths: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      widths.push(cells[i].getBoundingClientRect().width);
    }
    setColWidths(widths);
  }, []);

  useLayoutEffect(() => {
    measureColumns();
  }, [columnNames, measureColumns]);

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      columnNames.map((col) => ({
        id: col,
        accessorKey: col,
        header: ({ column }) => (
          <div className="flex items-center gap-1 group/header">
            <span className="select-text cursor-text" onClick={(e) => e.stopPropagation()}>{col}</span>
            <button
              onClick={() => column.toggleSorting()}
              className="shrink-0 hover:text-neutral-950 dark:hover:text-neutral-100 transition-colors"
            >
              {column.getIsSorted() === "asc" ? (
                <ArrowUp size={10} className="text-neutral-950 dark:text-neutral-100" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown size={10} className="text-neutral-950 dark:text-neutral-100" />
              ) : (
                <ArrowUpDown
                  size={10}
                  className="opacity-0 group-hover/header:opacity-100 transition-opacity text-neutral-400 dark:text-neutral-500"
                />
              )}
            </button>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          const displayContent =
            value === null ? (
              <span className="text-neutral-400 dark:text-neutral-500 italic">null</span>
            ) : (
              String(value)
            );
          return (
            <CellContentPopover value={value}>
              <div className="max-w-[300px] truncate">{displayContent}</div>
            </CellContentPopover>
          );
        },
      })),
    [columnNames],
  );

  const table = useReactTable({
    data: displayData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    // Only use client-side sorting when there's no viewName
    ...(isServerSorted
      ? { manualSorting: true }
      : { getSortedRowModel: getSortedRowModel() }),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const headerGridCols = `repeat(${columnNames.length}, minmax(120px, auto))`;
  const rowGridCols = colWidths ? colWidths.map(w => `${w}px`).join(" ") : headerGridCols;
  const effectiveVisibleRows = visibleRows ?? VISIBLE_ROWS;
  const needsScroll = displayData.length > effectiveVisibleRows;
  const HEADER_HEIGHT = 56;
  const maxHeight = needsScroll ? ROW_HEIGHT * effectiveVisibleRows + HEADER_HEIGHT : undefined;

  const isLimited = totalRows !== undefined && totalRows > tableData.length;

  const canExportFull = isLimited && viewExists;

  const handleExportExtract = useCallback((format: "csv" | "json") => {
    downloadTableData(displayData, format, viewName || `query_${cellId}`);
  }, [displayData, viewName, cellId]);

  const handleExportFull = useCallback(async (format: "csv" | "json") => {
    if (!viewName) return;

    setExportingFormat(format);
    const orderBy = buildOrderByClause(sorting);
    const filename = `${viewName}.${format}`;

    try {
      const selectSql = `SELECT * FROM ${escapeIdentifier(viewName)}${orderBy}`;
      if (format === "csv") {
        const code = [
          `_export_sql = '${selectSql.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
          `_duckdb_conn.execute(f"COPY ({_export_sql}) TO '/tmp/_export.csv' (HEADER)")`,
          `with open('/tmp/_export.csv', 'r') as _f:`,
          `    print(_f.read(), end='')`,
        ].join("\n");
        const result = await runtime.runPython(code);
        if (result.error) throw new Error(result.error);
        downloadString(result.output, "text/csv", filename);
      } else {
        const code = [
          `_export_rows = _duckdb_conn.execute('${selectSql.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}').fetchdf()`,
          `print(_export_rows.to_json(orient='records', date_format='iso'), end='')`,
        ].join("\n");
        const result = await runtime.runPython(code);
        if (result.error) throw new Error(result.error);
        downloadString(result.output, "application/json", filename);
      }
    } catch {
      downloadTableData(displayData, format, viewName || `query_${cellId}`);
    } finally {
      setExportingFormat(null);
    }
  }, [viewName, sorting, displayData, cellId, runtime]);

  return (
    <>
      <div ref={tableContainerRef} className="overflow-auto text-[13px]" style={fillHeight ? { height: "100%" } : { maxHeight }}>
        {/* Header row - sticky */}
        <div
          ref={headerRef}
          className="grid sticky top-0 z-10 bg-neutral-50 dark:bg-muted border-b border-neutral-200 dark:border-border"
          style={{
            gridTemplateColumns: headerGridCols,
            width: "max-content",
            minWidth: "100%",
          }}
        >
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => (
              <div
                key={header.id}
                className="px-3 py-2.5 text-left font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))
          )}
        </div>

        {/* Virtualized body */}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                className="grid border-b border-neutral-100 dark:border-border/30 hover:bg-neutral-50/80 dark:hover:bg-accent/30 transition-colors bg-white dark:bg-card"
                style={{
                  gridTemplateColumns: rowGridCols,
                  height: ROW_HEIGHT,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className="px-3 py-1.5 text-neutral-700 dark:text-neutral-200 truncate"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500 border-t border-neutral-200/50 dark:border-border/50">
        <div className="flex items-center gap-2">
          <span>
            {isLimited ? (
              <>Showing {tableData.length.toLocaleString()} of {totalRows!.toLocaleString()} rows</>
            ) : (
              <>{tableData.length.toLocaleString()} row{tableData.length !== 1 ? "s" : ""}</>
            )}
          </span>
          {isSorting && (
            <Loader2 size={10} className="animate-spin text-neutral-400" />
          )}
          {onChangeVisibleRows && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors"
                >
                  <span>{effectiveVisibleRows} rows</span>
                  <ChevronDown size={10} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                {VISIBLE_ROW_OPTIONS.map((n) => (
                  <DropdownMenuItem key={n} onClick={() => onChangeVisibleRows(n)} className="text-xs">
                    <span>{n} rows</span>
                    {effectiveVisibleRows === n && <Check size={12} className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              disabled={!!exportingFormat}
              className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-600 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors disabled:opacity-50"
            >
              {exportingFormat ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              <span>Export</span>
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
            {canExportFull ? (
              <>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Current view ({tableData.length.toLocaleString()} rows)
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExportExtract("csv")} className="text-xs">CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportExtract("json")} className="text-xs">JSON</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Full dataset ({totalRows!.toLocaleString()} rows)
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleExportFull("csv")} className="text-xs">CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportFull("json")} className="text-xs">JSON</DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => handleExportExtract("csv")} className="text-xs">CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportExtract("json")} className="text-xs">JSON</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
