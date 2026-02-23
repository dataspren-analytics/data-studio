"use client";

import { Loader2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonacoCodeEditor, type EditorLanguage } from "../components/cells/monaco-code-editor";
import type { FileViewerProps } from "./types";

type LoadingState =
  | { status: "loading" }
  | { status: "success"; content: string }
  | { status: "error"; message: string };

function getEditorLanguage(filePath: string): EditorLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "md") return "markdown";
  return "plaintext";
}

interface TextRuntimeActions {
  readFile: (name: string) => Promise<Uint8Array>;
  writeFile: (file: File, targetDir?: string) => Promise<void>;
}

interface TextFileViewerInnerProps {
  filePath: string;
  runtimeActions: TextRuntimeActions;
}

const TextFileViewerInner = memo(function TextFileViewerInner({
  filePath,
  runtimeActions,
}: TextFileViewerInnerProps) {
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
        setContent(text);
        setState({ status: "success", content: text });
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Failed to load text file:", e);
        setState({ status: "error", message: e.message || "Failed to load file" });
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
        const fileName = filePath.split("/").pop() || "file.txt";
        const blob = new Blob([value], { type: "text/plain" });
        const file = new File([blob], fileName, { type: "text/plain" });
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

  const language = getEditorLanguage(filePath);

  if (state.status === "loading") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 bg-stone-50 dark:bg-background p-4 flex items-center justify-center h-full">
        <div className="text-red-500 text-sm">{state.message}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-hidden">
      <MonacoCodeEditor
        defaultValue={content}
        onChange={handleChange}
        language={language}
        enableScrolling
        showLineNumbers
        resetKey={filePath}
      />
    </div>
  );
});

export function TextFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<TextRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
    }),
    [runtime.readFile, runtime.writeFile],
  );

  return (
    <TextFileViewerInner
      filePath={filePath}
      runtimeActions={runtimeActions}
    />
  );
}
