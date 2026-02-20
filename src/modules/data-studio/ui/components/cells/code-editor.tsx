"use client";

import { forwardRef } from "react";
import { MonacoCodeEditor, type MonacoEditorHandle, type EditorLanguage } from "./monaco-code-editor";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  placeholder?: string;
  className?: string;
  enableScrolling?: boolean;
  showLineNumbers?: boolean;
  resetKey?: string;
  autoFocus?: boolean;
}

export type { MonacoEditorHandle, EditorLanguage };

/**
 * Code editor powered by Monaco Editor with built-in features:
 * - Line duplication: Shift+Alt+Down (or Shift+Option+Down on Mac)
 * - Multi-cursor support
 * - Syntax highlighting
 *
 * Use ref to access:
 * - getContent(): Get current editor content
 * - getSelection(): Get selected text or null
 * - focus(): Focus the editor
 */
export const CodeEditor = forwardRef<MonacoEditorHandle, CodeEditorProps>(
  function CodeEditor(props, ref) {
    return <MonacoCodeEditor {...props} ref={ref} />;
  }
);
