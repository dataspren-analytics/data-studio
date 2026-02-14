"use client";

import {
  createBrowserConfig,
  generateId,
  NotebookProvider,
  DataStudioView,
  type CodeCell as CodeCellType,
} from "@/modules/data-studio";
import { useMemo } from "react";

function createEmptyCell(): CodeCellType {
  return {
    id: generateId(),
    cell_type: "code",
    source: "",
    outputs: [],
    execution_count: null,
    metadata: { dataspren_type: "python" },
  };
}

export default function Page() {
  const config = useMemo(() => createBrowserConfig({ initialCells: [createEmptyCell()] }), []);

  return (
    <NotebookProvider config={config}>
      <div className="[&_button]:cursor-pointer min-h-svh">
        <DataStudioView />
      </div>
    </NotebookProvider>
  );
}
