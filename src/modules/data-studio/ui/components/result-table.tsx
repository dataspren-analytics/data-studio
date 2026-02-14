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
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ROW_HEIGHT, VISIBLE_ROWS } from "../lib/constants";
import { getTableColumns, type TableData } from "../../runtime";
import { downloadTableData } from "../lib/utils";
import { CellContentPopover } from "./cell-content-popover";

const VISIBLE_ROW_OPTIONS = [3, 6, 9] as const;

interface ResultTableProps {
  tableData: TableData;
  totalRows?: number;
  viewName?: string;
  cellId: string;
  visibleRows?: number;
  onChangeVisibleRows?: (rows: number) => void;
}

export function ResultTable({ tableData, totalRows, viewName, cellId, visibleRows, onChangeVisibleRows }: ResultTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [colWidths, setColWidths] = useState<number[] | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

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
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
  const needsScroll = tableData.length > effectiveVisibleRows;
  const maxHeight = needsScroll ? ROW_HEIGHT * effectiveVisibleRows + 36 : undefined;

  const isLimited = totalRows !== undefined && totalRows > tableData.length;

  return (
    <>
      <div ref={tableContainerRef} className="overflow-auto text-[13px]" style={{ maxHeight }}>
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
          {onChangeVisibleRows && (
            <select
              value={effectiveVisibleRows}
              onChange={(e) => {
                e.stopPropagation();
                onChangeVisibleRows(Number(e.target.value));
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border border-neutral-200 dark:border-border rounded px-1 py-0.5 text-xs text-neutral-500 dark:text-neutral-400 outline-none cursor-pointer"
            >
              {VISIBLE_ROW_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} rows</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadTableData(tableData, "csv", viewName || `query_${cellId}`);
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors"
            title="Download as CSV"
          >
            <Download size={10} />
            <span>CSV</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadTableData(tableData, "json", viewName || `query_${cellId}`);
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-accent rounded transition-colors"
            title="Download as JSON"
          >
            <Download size={10} />
            <span>JSON</span>
          </button>
        </div>
      </div>
    </>
  );
}
