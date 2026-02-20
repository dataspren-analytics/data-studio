"use client";

import { FileJson, Loader2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "../components/cells/code-editor";
import type { FileViewerProps } from "./types";

type LoadingState =
  | { status: "loading" }
  | { status: "success"; content: string }
  | { status: "error"; message: string };

interface JsonRuntimeActions {
  readFile: (name: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
}

interface JsonFileViewerInnerProps {
  filePath: string;
  runtimeActions: JsonRuntimeActions;
}

const JsonFileViewerInner = memo(function JsonFileViewerInner({
  filePath,
  runtimeActions,
}: JsonFileViewerInnerProps) {
  const [state, setState] = useState<LoadingState>({ status: "loading" });
  const [content, setContent] = useState("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;

    runtimeActions
      .readFile(filePath)
      .then((data) => {
        if (cancelled) return;
        const text = new TextDecoder().decode(data);
        // Validate that it's parseable JSON, then pretty-print it
        try {
          const parsed = JSON.parse(text);
          const formatted = JSON.stringify(parsed, null, 2);
          setContent(formatted);
          setState({ status: "success", content: formatted });
        } catch {
          // Still show the raw content if it's not valid JSON
          setContent(text);
          setState({ status: "success", content: text });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Failed to load JSON:", e);
        setState({ status: "error", message: e instanceof Error ? e.message : "Failed to load file" });
      });

    return () => {
      cancelled = true;
      setState({ status: "loading" });
    };
  }, [filePath, runtimeActions]);

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const fileName = filePath.split("/").pop() || "file.json";
        const blob = new Blob([value], { type: "application/json" });
        const file = new File([blob], fileName, { type: "application/json" });
        const targetDir = filePath.substring(0, filePath.lastIndexOf("/")) || undefined;
        runtimeActions.writeFile(file, targetDir);
      }, 500);
    },
    [filePath, runtimeActions],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex flex-col items-center justify-center h-full text-neutral-500 gap-2">
        <FileJson size={32} className="text-neutral-300 dark:text-neutral-600" />
        <span>Failed to load JSON</span>
        <span className="text-xs text-red-500 font-mono">{state.message}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-hidden">
      <CodeEditor
        value={content}
        onChange={handleChange}
        language="json"
        placeholder="{}"
        enableScrolling={true}
        showLineNumbers={true}
        resetKey={filePath}
      />
    </div>
  );
});

export function JsonFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<JsonRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
    }),
    [runtime.readFile, runtime.writeFile],
  );

  return (
    <JsonFileViewerInner
      filePath={filePath}
      runtimeActions={runtimeActions}
    />
  );
}
