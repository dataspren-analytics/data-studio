"use client";

import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileViewerProps } from "./types";

const textEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "#0a0a0a",
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontVariantLigatures: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#0a0a0a",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#fef6f0",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 0, 0, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid #e5e5e5",
    color: "#a3a3a3",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  ".cm-line": {
    paddingLeft: "4px",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
  },
});

const textEditorThemeDark = EditorView.theme({
  "&": {
    backgroundColor: "transparent !important",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontVariantLigatures: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid #404040",
    color: "#6b7280",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  ".cm-line": {
    paddingLeft: "4px",
    paddingRight: "0",
    paddingTop: "0",
    paddingBottom: "0",
  },
}, { dark: true });

type LoadingState =
  | { status: "loading" }
  | { status: "success"; content: string }
  | { status: "error"; message: string };

function getFileExtension(filePath: string): string | null {
  const fileName = filePath.split("/").pop() || "";
  if (!fileName.includes(".")) return null;
  return fileName.split(".").pop()?.toLowerCase() || null;
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
  runtimeActions 
}: TextFileViewerInnerProps) {
  const [state, setState] = useState<LoadingState>({ status: "loading" });
  const [content, setContent] = useState("");
  const [isDark, setIsDark] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains("dark"));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

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
      
      // Debounce the file save
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
    [filePath, runtimeActions]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const extension = getFileExtension(filePath);
  const isMarkdown = extension === "md";

  const extensions = useMemo(() => {
    const exts = [
      isDark ? textEditorThemeDark : textEditorTheme,
      isDark ? oneDark : [],
      EditorView.lineWrapping,
    ];
    if (isMarkdown) {
      exts.push(markdown());
    }
    return exts;
  }, [isDark, isMarkdown]);

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
    <div className="flex-1 bg-stone-50 dark:bg-background flex flex-col overflow-auto">
      <div className="p-4">
        <CodeMirror
          value={content}
          onChange={handleChange}
          extensions={extensions}
          theme="light"
          placeholder={isMarkdown ? "# Start writing markdown..." : "Start typing..."}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
          }}
          className="[&_.cm-editor]:outline-none [&_.cm-editor]:bg-transparent min-h-[200px]"
        />
      </div>
    </div>
  );
});

export function TextFileViewer({ filePath, runtime }: FileViewerProps) {
  const runtimeActions = useMemo<TextRuntimeActions>(
    () => ({
      readFile: runtime.readFile,
      writeFile: runtime.writeFile,
    }),
    [runtime.readFile, runtime.writeFile]
  );

  return (
    <TextFileViewerInner
      filePath={filePath}
      runtimeActions={runtimeActions}
    />
  );
}
