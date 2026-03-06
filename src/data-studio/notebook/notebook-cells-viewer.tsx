"use client";

import { Loader2, Play, Plus, Square } from "lucide-react";
import React from "react";
import { AddCellDivider } from "./cells/add-cell-divider";
import { CellWrapperConnected } from "./cells/cell-wrapper-connected";
import { useCellIds } from "./hooks/use-cell-ids";
import { useCellActions } from "./hooks/use-cell-actions";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { useRuntime } from "../provider/runtime-provider";
import {
  useStore,
  selectIsRunningAll,
  selectRunAllCells,
  selectStopAllCells,
} from "./store";

export function NotebookCellsViewer() {
  const cellIds = useCellIds();
  const { selectCell, addCell } = useCellActions();
  const runtime = useRuntime();
  const isRunningAll = useStore(selectIsRunningAll);
  const runAllCells = useStore(selectRunAllCells);
  const stopAllCells = useStore(selectStopAllCells);

  useKeyboardShortcuts();

  return (
    <div
      className="flex-1 min-w-0 overflow-y-auto bg-stone-50 dark:bg-background"
      onClick={() => selectCell(null)}
      onMouseDown={() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }}
    >
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-4 overflow-hidden">
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          {isRunningAll ? (
            <button
              onClick={stopAllCells}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-stone-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 hover:bg-stone-100 dark:hover:bg-neutral-700 border border-stone-200 dark:border-neutral-600 "
            >
              <Square size={12} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button
              onClick={runAllCells}
              disabled={!runtime.isReady}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-stone-600 dark:text-neutral-300 bg-white dark:bg-neutral-800 hover:bg-stone-100 dark:hover:bg-neutral-700 border border-stone-200 dark:border-neutral-600  disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!runtime.isReady ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
              Run all
            </button>
          )}
        </div>
        {cellIds.map((id, index) => {
          const isFirst = index === 0;
          const isLast = index === cellIds.length - 1;

          return (
            <React.Fragment key={id}>
              <CellWrapperConnected
                id={id}
                isFirst={isFirst}
                isLast={isLast}
              />
              {!isLast && (
                <AddCellDivider onAddCell={(type) => addCell(type, id)} />
              )}
            </React.Fragment>
          );
        })}

        <button
          onClick={(e) => {
            e.stopPropagation();
            addCell("python");
          }}
          className="w-full py-3 border border-dashed border-stone-300 dark:border-neutral-700 rounded-lg text-stone-500 dark:text-neutral-500 hover:text-stone-700 dark:hover:text-neutral-300 hover:border-stone-400 dark:hover:border-neutral-600 hover:bg-stone-100 dark:hover:bg-neutral-900 transition-all flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Add cell
        </button>
      </div>
    </div>
  );
}
