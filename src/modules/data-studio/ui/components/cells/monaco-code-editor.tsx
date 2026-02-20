"use client";

import { Editor, type OnMount } from "@monaco-editor/react";
import { useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import type { editor } from "monaco-editor";
import { useIsDark } from "../../hooks/use-is-dark";

export type EditorLanguage = "sql" | "python" | "json" | "markdown" | "plaintext";

export interface MonacoCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  placeholder?: string;
  className?: string;
  enableScrolling?: boolean;
  showLineNumbers?: boolean;
  /** Optional key that changes when content should be externally reset (e.g., file path change) */
  resetKey?: string;
  /** Focus the editor when it mounts */
  autoFocus?: boolean;
}

export interface MonacoEditorHandle {
  getContent: () => string;
  getSelection: () => string | null;
  focus: () => void;
}

export const MonacoCodeEditor = forwardRef<MonacoEditorHandle, MonacoCodeEditorProps>(
  function MonacoCodeEditor(
    {
      value,
      onChange,
      language,
      enableScrolling = false,
      showLineNumbers = false,
      resetKey,
      autoFocus = false,
    },
    ref
  ) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const isDark = useIsDark();
    const autoFocusRef = useRef(autoFocus);
    autoFocusRef.current = autoFocus;

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      getContent: () => {
        const model = editorRef.current?.getModel();
        return model?.getValue() || "";
      },
      getSelection: () => {
        const editor = editorRef.current;
        if (!editor) return null;
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (selection && model && !selection.isEmpty()) {
          return model.getValueInRange(selection);
        }
        return null;
      },
      focus: () => {
        editorRef.current?.focus();
      },
    }));

  // Calculate height based on number of lines for notebook cells
  // For scrollable editors (like SQL viewer), use 100% to fill container
  const height = useMemo(() => {
    if (enableScrolling) {
      return "100%";
    }
    const lines = Math.max((value || "").split("\n").length, 1);
    const lineHeight = 21; // 14px font * 1.5 line-height
    const padding = 16; // top + bottom padding
    const minHeight = language === "sql" ? 42 : 80;
    return `${Math.max(minHeight, lines * lineHeight + padding)}px`;
  }, [value, language, enableScrolling]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      // Define custom theme matching the screenshot
      // Brand color: oklch(0.58 0.21 35) = #ea6045
      monaco.editor.defineTheme("custom-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "comment", foreground: "6a737d" },
          { token: "keyword", foreground: "ea6045", fontStyle: "bold" },
          { token: "string", foreground: "e5c07b" },
          { token: "string.sql", foreground: "e5c07b" },
          { token: "string.quoted", foreground: "e5c07b" },
          { token: "string.single", foreground: "e5c07b" },
          { token: "string.double", foreground: "e5c07b" },
          { token: "number", foreground: "79c0ff" },
          { token: "function", foreground: "b3d97e" },
          { token: "function.python", foreground: "b3d97e" },
          { token: "predefined", foreground: "b3d97e" },
          { token: "predefined.sql", foreground: "b3d97e" },
          { token: "predefined.python", foreground: "b3d97e" },
          { token: "type.sql", foreground: "b3d97e" },
          { token: "identifier.function", foreground: "b3d97e" },
          { token: "support.function", foreground: "b3d97e" },
          { token: "builtin", foreground: "b3d97e" },
          { token: "builtin.python", foreground: "b3d97e" },
          { token: "identifier.builtin", foreground: "b3d97e" },
          { token: "identifier.callable", foreground: "b3d97e" },
          { token: "meta.function-call", foreground: "b3d97e" },
          { token: "entity.name.function", foreground: "b3d97e" },
          { token: "operator", foreground: "e0e0e0" },
          { token: "delimiter", foreground: "e0e0e0" },
          { token: "variable", foreground: "e0e0e0" },
          { token: "type", foreground: "d2a8ff" },
          { token: "identifier", foreground: "e0e0e0" },
          { token: "", foreground: "e0e0e0" },
        ],
        colors: {
          "editor.background": "#00000000",
          "editor.lineHighlightBackground": "#00000000",
        },
      });

      monaco.editor.defineTheme("custom-light", {
        base: "vs",
        inherit: true,
        rules: [
          { token: "comment", foreground: "6a737d" },
          { token: "keyword", foreground: "ea6045", fontStyle: "bold" },
          { token: "string", foreground: "b5760a" },
          { token: "string.sql", foreground: "b5760a" },
          { token: "string.quoted", foreground: "b5760a" },
          { token: "string.single", foreground: "b5760a" },
          { token: "string.double", foreground: "b5760a" },
          { token: "number", foreground: "005cc5" },
          { token: "function", foreground: "b3d97e" },
          { token: "function.python", foreground: "b3d97e" },
          { token: "predefined", foreground: "b3d97e" },
          { token: "predefined.sql", foreground: "b3d97e" },
          { token: "predefined.python", foreground: "b3d97e" },
          { token: "type.sql", foreground: "b3d97e" },
          { token: "identifier.function", foreground: "b3d97e" },
          { token: "support.function", foreground: "b3d97e" },
          { token: "builtin", foreground: "b3d97e" },
          { token: "builtin.python", foreground: "b3d97e" },
          { token: "identifier.builtin", foreground: "b3d97e" },
          { token: "identifier.callable", foreground: "b3d97e" },
          { token: "meta.function-call", foreground: "b3d97e" },
          { token: "entity.name.function", foreground: "b3d97e" },
          { token: "operator", foreground: "24292e" },
          { token: "delimiter", foreground: "24292e" },
          { token: "variable", foreground: "24292e" },
          { token: "type", foreground: "6f42c1" },
          { token: "identifier", foreground: "24292e" },
          { token: "", foreground: "24292e" },
        ],
        colors: {
          "editor.background": "#00000000",
          "editor.lineHighlightBackground": "#00000000",
        },
      });

      monaco.editor.setTheme(isDark ? "custom-dark" : "custom-light");

      // Style %sql / %%sql magic commands like comments
      const sqlMagicStyleId = "monaco-sql-magic-style";
      if (!document.getElementById(sqlMagicStyleId)) {
        const style = document.createElement("style");
        style.id = sqlMagicStyleId;
        style.textContent = `.sql-magic-decoration { color: #6a737d !important; }`;
        document.head.appendChild(style);
      }

      const decorationCollection = editor.createDecorationsCollection([]);
      const updateSqlMagicDecorations = () => {
        const model = editor.getModel();
        if (!model) return;
        const matches = model.findMatches("%%?sql\\b", false, true, false, null, false);
        decorationCollection.set(
          matches.map((match) => ({
            range: match.range,
            options: { inlineClassName: "sql-magic-decoration" },
          }))
        );
      };
      updateSqlMagicDecorations();
      editor.onDidChangeModelContent(() => updateSqlMagicDecorations());

      if (autoFocusRef.current) {
        editor.focus();
      }
    },
    [isDark],
  );

  const handleChange = useCallback((value: string | undefined) => {
    onChange?.(value || "");
  }, [onChange]);

  return (
    <Editor
      key={resetKey}
      height={height}
      defaultLanguage={language}
      language={language}
      defaultValue={value}
      onChange={handleChange}
      onMount={handleEditorDidMount}
      theme={isDark ? "custom-dark" : "custom-light"}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineHeight: 21, // 14px * 1.5
        fontFamily: "Menlo, ui-monospace, SFMono-Regular, Monaco, Consolas, monospace",
        lineNumbers: showLineNumbers ? "on" : "off",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        wrappingIndent: "indent",
        padding: { top: 0, bottom: 0 },
        suggest: {
          showWords: false,
        },
        quickSuggestions: false,
        contextmenu: true,
        scrollbar: enableScrolling
          ? {
              vertical: "auto",
              horizontal: "auto",
              useShadows: false,
              handleMouseWheel: true,
            }
          : {
              vertical: "hidden",
              horizontal: "hidden",
              useShadows: false,
              handleMouseWheel: false,
            },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        renderLineHighlight: "none",
        glyphMargin: false,
        folding: false,
      }}
    />
  );
});
