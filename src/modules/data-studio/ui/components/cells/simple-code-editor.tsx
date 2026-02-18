"use client";

import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-python";
import { useCallback } from "react";

// Prism token colors — adapts to light/dark via CSS variables & dark: prefix
const prismStyles = `
  .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a737d; }
  .token.punctuation { color: #6e7681; }
  .token.keyword { color: var(--brand, #d73a49); font-weight: 500; }
  .token.string, .token.char, .token.builtin { color: #b5760a; }
  .token.number, .token.boolean { color: #005cc5; }
  .token.function { color: #22863a; }
  .token.operator { color: #d73a49; }
  .token.variable { color: #24292e; }
  .token.class-name { color: #6f42c1; }

  .dark .token.comment, .dark .token.prolog, .dark .token.doctype, .dark .token.cdata { color: #6a737d; }
  .dark .token.punctuation { color: #8b949e; }
  .dark .token.keyword { color: var(--brand, #ff7b72); font-weight: 500; }
  .dark .token.string, .dark .token.char, .dark .token.builtin { color: #e5c07b; }
  .dark .token.number, .dark .token.boolean { color: #79c0ff; }
  .dark .token.function { color: #98c379; }
  .dark .token.operator { color: #ff7b72; }
  .dark .token.variable { color: #e0e0e0; }
  .dark .token.class-name { color: #d2a8ff; }
`;

export interface SimpleCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: "sql" | "python";
  placeholder?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement | HTMLTextAreaElement>;
  className?: string;
}

export function SimpleCodeEditor({
  value,
  onChange,
  language,
  placeholder,
  onKeyDown,
  className,
}: SimpleCodeEditorProps) {
  const highlight = useCallback(
    (code: string) => {
      // Don't syntax-highlight the %sql magic prefix
      if (language === "sql" && code.startsWith("%sql\n")) {
        const rest = code.slice(5);
        return '%sql\n' + Prism.highlight(rest, Prism.languages.sql, "sql");
      }
      return Prism.highlight(code, Prism.languages[language], language);
    },
    [language],
  );

  return (
    <div className={className}>
      <style dangerouslySetInnerHTML={{ __html: prismStyles }} />
      <Editor
        value={value}
        onValueChange={onChange ?? (() => {})}
        highlight={highlight}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        padding={0}
        tabSize={2}
        insertSpaces
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "14px",
          lineHeight: "1.5",
          minHeight: language === "sql" ? "42px" : "80px",
        }}
        textareaClassName="outline-none"
        preClassName="!whitespace-pre-wrap"
      />
    </div>
  );
}
