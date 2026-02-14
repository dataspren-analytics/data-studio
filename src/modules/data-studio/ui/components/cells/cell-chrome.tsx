"use client";

import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  CellWrapper – shared outer container with selection styling        */
/* ------------------------------------------------------------------ */

interface CellWrapperProps {
  isSelected: boolean;
  isRunning?: boolean;
  isQueued?: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}

export function CellWrapper({ isSelected, isRunning, isQueued, onSelect, className, children }: CellWrapperProps) {
  return (
    <div
      className={cn(
        "group rounded-lg border bg-white dark:bg-card outline-none",
        isRunning
          ? (isSelected ? "border-neutral-400 dark:border-white" : "border-neutral-200 dark:border-border")
          : isQueued
            ? "border-dashed border-neutral-300 dark:border-neutral-600"
            : isSelected
              ? "border-neutral-400 dark:border-white"
              : "border-neutral-200 hover:border-neutral-300 dark:border-border dark:hover:border-neutral-600",
        className,
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CellToolbarActions – move / delete buttons (hover-only)            */
/* ------------------------------------------------------------------ */

interface CellToolbarActionsProps {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function CellToolbarActions({
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: CellToolbarActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMoveUp();
        }}
        disabled={isFirst}
        className="p-1.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move cell up"
      >
        <ArrowUp size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMoveDown();
        }}
        disabled={isLast}
        className="p-1.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:text-neutral-100 dark:hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move cell down"
      >
        <ArrowDown size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-950 rounded transition-colors"
        title="Delete cell"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CellExecutionIndicator – queued / running spinner                  */
/* ------------------------------------------------------------------ */

interface CellExecutionIndicatorProps {
  isQueued: boolean;
  isRunning: boolean;
  runningLabel?: string;
}

export function CellExecutionIndicator({
  isQueued,
  isRunning,
  runningLabel = "Running...",
}: CellExecutionIndicatorProps) {
  if (isQueued) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400 dark:text-neutral-500 px-3 py-2">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-400/50 dark:border-neutral-600/50 border-dashed animate-spin" />
        <span>Queued</span>
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400 dark:text-neutral-500 px-3 py-2">
        <Loader2 size={14} className="animate-spin" />
        <span>{runningLabel}</span>
      </div>
    );
  }

  return null;
}
