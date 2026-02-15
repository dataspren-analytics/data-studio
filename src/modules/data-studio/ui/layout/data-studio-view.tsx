"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotebook, useRuntime } from "../provider";
import type { NotebookCell } from "../../runtime";
import { ContentArea } from "./content-area";
import { DataStudioHeader } from "./data-studio-header";
import { DataStudioLayout } from "./data-studio-layout";
import { FileSidebar } from "./file-sidebar";
import { HomePage } from "./home-page";

const DEMO_CELLS_STORAGE_KEY = "dataspren-demo-cells";

interface DemoConfig {
  notebookUrl: string;
  baseName: string;
  dataFiles: { url: string; fileName: string }[];
}

const DEMOS: Record<string, DemoConfig> = {
  spotify: {
    notebookUrl: "https://r2.local.dataspren.com/demo-data/spotify-analysis/Spotify_Tracks_Analysis.ipynb",
    baseName: "Spotify Tracks Analysis",
    dataFiles: [
      { url: "https://r2.local.dataspren.com/demo-data/spotify-analysis/spotify_data.parquet", fileName: "spotify_data.parquet" },
    ],
  },
};

export function DataStudioView() {
  const { isLoaded, notebooks, createNotebook, selectFile } = useNotebook();
  const runtime = useRuntime();
  const demoCellsLoadedRef = useRef(false);
  const [showHome, setShowHome] = useState(true);

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

  const handleCloneDemo = useCallback(
    async (demoId: string) => {
      const demo = DEMOS[demoId];
      if (!demo) return;

      // Download notebook and data files in parallel
      const [notebookResponse] = await Promise.all([
        fetch(demo.notebookUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ...demo.dataFiles.map(async ({ url, fileName }) => {
          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const blob = await response.blob();
            await runtime.writeFile(new File([blob], fileName));
          } catch {
            // Data download failed, continue
          }
        }),
      ]);

      await runtime.refreshFiles();

      // Extract cells from the downloaded notebook, or fall back to empty
      const cells: NotebookCell[] = notebookResponse?.cells ?? [];

      const existingCount = notebooks.filter((n) => n.name.startsWith(demo.baseName)).length;
      const name = existingCount === 0 ? demo.baseName : `${demo.baseName} ${existingCount + 1}`;

      await createNotebook(name, cells);
      setShowHome(false);
    },
    [notebooks, createNotebook, runtime],
  );

  const handleCreateNotebook = useCallback(async () => {
    await createNotebook();
    setShowHome(false);
  }, [createNotebook]);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await runtime.writeFile(file);
      }
      await runtime.refreshFiles();
      setShowHome(false);
    },
    [runtime],
  );

  const handleSelectFile = useCallback(
    (path: string | null) => {
      selectFile(path);
      setShowHome(false);
    },
    [selectFile],
  );

  return (
    <DataStudioLayout
      header={<DataStudioHeader />}
      fileExplorer={
        <FileSidebar
          showHome={showHome}
          onShowHome={() => setShowHome(true)}
          onSelectFile={handleSelectFile}
        />
      }
      content={
        showHome ? (
          <HomePage
            onCloneDemo={handleCloneDemo}
            onCreateNotebook={handleCreateNotebook}
            onUploadFiles={handleUploadFiles}
          />
        ) : (
          <ContentArea />
        )
      }
    />
  );
}
