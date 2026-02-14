"use client";

import { useCallback, useEffect, useRef } from "react";
import { createDemoCells, SAMPLE_CSV_DATA } from "../lib/demo-data";
import { useNotebook, useRuntime } from "../provider";
import type { NotebookCell } from "../../runtime";
import { ContentArea } from "./content-area";
import { DataStudioHeader } from "./data-studio-header";
import { DataStudioLayout } from "./data-studio-layout";
import { FileSidebar } from "./file-sidebar";

const DEMO_CELLS_STORAGE_KEY = "dataspren-demo-cells";
const DEMO_FILE_STORAGE_KEY = "dataspren-demo-file";

export function DataStudioView() {
  const { isLoaded, notebooks, createNotebook, selectFile } = useNotebook();
  const runtime = useRuntime();
  const demoCellsLoadedRef = useRef(false);

  // Load demo cells from localStorage if present (from landing page)
  useEffect(() => {
    if (!isLoaded || demoCellsLoadedRef.current) return;

    const storedCells = localStorage.getItem(DEMO_CELLS_STORAGE_KEY);
    if (!storedCells) return;

    demoCellsLoadedRef.current = true;
    localStorage.removeItem(DEMO_CELLS_STORAGE_KEY);

    try {
      const parsedCells = JSON.parse(storedCells) as NotebookCell[];
      const existingDemoCount = notebooks.filter((n) => n.name.startsWith("Demo Notebook")).length;
      const notebookName = `Demo Notebook ${existingDemoCount + 1}`;
      createNotebook(notebookName, parsedCells).then((newNotebook) => {
        selectFile(newNotebook.filePath);
      });
    } catch {
      // Invalid JSON, just proceed normally
    }
  }, [isLoaded, notebooks, createNotebook, selectFile]);

  // Load demo file from localStorage if present (from landing page demo fullscreen)
  useEffect(() => {
    if (!runtime.isReady) return;

    const storedFileData = localStorage.getItem(DEMO_FILE_STORAGE_KEY);
    if (!storedFileData) return;

    localStorage.removeItem(DEMO_FILE_STORAGE_KEY);

    const fileExists = runtime.registeredFiles.some((f) => f.name === "sample_sales.csv");
    if (fileExists) return;

    const blob = new Blob([storedFileData], { type: "text/csv" });
    const file = new File([blob], "sample_sales.csv", { type: "text/csv" });
    runtime.writeFile(file);
  }, [runtime]);

  const handleCreateDemoNotebook = useCallback(async () => {
    const existingDemoCount = notebooks.filter((n) => n.name.startsWith("Demo Notebook")).length;
    const notebookName = existingDemoCount === 0 ? "Demo Notebook" : `Demo Notebook ${existingDemoCount + 1}`;
    const demoCells = createDemoCells();

    const blob = new Blob([SAMPLE_CSV_DATA], { type: "text/csv" });
    const sampleFile = new File([blob], "sample_sales.csv", { type: "text/csv" });

    await createNotebook(notebookName, demoCells, [sampleFile]);
  }, [notebooks, createNotebook]);

  return (
    <DataStudioLayout
      header={<DataStudioHeader onCreateDemoNotebook={handleCreateDemoNotebook} />}
      fileExplorer={<FileSidebar />}
      content={<ContentArea />}
    />
  );
}
