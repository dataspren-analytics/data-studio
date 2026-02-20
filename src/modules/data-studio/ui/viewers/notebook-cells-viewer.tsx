"use client";

import { Plus } from "lucide-react";
import React from "react";
import { isCodeCell, isMarkdownCell } from "../../runtime/core/nbformat";
import { AddCellDivider, CodeCell, MarkdownCellComponent } from "../components/cells";
import { useCells, useRuntime } from "../provider";

export function NotebookCellsViewer() {
  const {
    cells,
    selectedCellId,
    runningCellIds,
    queuedCellIds,
    selectCell,
    addCell,
    updateCell,
    deleteCell,
    runCellAndAdvance,
    changeCellType,
    moveCellUp,
    moveCellDown,
    updateAssertConfig,
    runCellTests,
    updateViewName,
    updateCellMetadata,
    refreshVizData,
  } = useCells();
  const runtime = useRuntime();
  return (
    <div
      className="flex-1 min-w-0 overflow-y-auto bg-stone-50 dark:bg-background"
      onClick={() => selectCell(null)}
      onMouseDown={() => {
        // Blur editor on mousedown in the background area
        // Cells stop propagation so this only fires for background clicks
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }}
    >
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-4 overflow-hidden">
        {cells.map((cell, index) => {
          const isFirst = index === 0;
          const isLast = index === cells.length - 1;

          let cellElement: React.ReactNode;

          if (isMarkdownCell(cell)) {
            cellElement = (
              <MarkdownCellComponent
                key={cell.id}
                cell={cell}
                isSelected={selectedCellId === cell.id}
                onSelect={() => selectCell(cell.id)}
                onUpdate={(source) => updateCell(cell.id, source)}
                onDelete={() => deleteCell(cell.id)}
                onMoveUp={() => moveCellUp(cell.id)}
                onMoveDown={() => moveCellDown(cell.id)}
                isFirst={isFirst}
                isLast={isLast}
              />
            );
          } else if (isCodeCell(cell)) {
            const isRunning = runningCellIds.has(cell.id);
            const isQueued = queuedCellIds.has(cell.id);
            cellElement = (
              <CodeCell
                key={cell.id}
                cell={cell}
                isSelected={selectedCellId === cell.id}
                isRunning={isRunning}
                isQueued={isQueued}
                isRuntimeReady={runtime.isReady}
                tables={runtime.tables}
                onSelect={() => selectCell(cell.id)}
                onUpdate={(source) => updateCell(cell.id, source)}
                onDelete={() => deleteCell(cell.id)}
                onRun={(queryOverride) => runCellAndAdvance(cell.id, queryOverride)}
                onChangeType={(type) => changeCellType(cell.id, type)}
                onMoveUp={() => moveCellUp(cell.id)}
                onMoveDown={() => moveCellDown(cell.id)}
                isFirst={isFirst}
                isLast={isLast}
                onUpdateAssertConfig={(config) => updateAssertConfig(cell.id, config)}
                onRunTests={() => runCellTests(cell.id)}
                onUpdateViewName={(newName) => updateViewName(cell.id, newName)}
                onUpdateMetadata={(metadata) => updateCellMetadata(cell.id, metadata)}
                onRefreshVizData={(config) => refreshVizData(cell.id, config)}
              />
            );
          } else {
            return null;
          }

          return (
            <React.Fragment key={cell.id}>
              {cellElement}
              {index < cells.length - 1 && (
                <AddCellDivider onAddCell={(type) => addCell(type, cell.id)} />
              )}
            </React.Fragment>
          );
        })}

        {/* Add cell button */}
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
