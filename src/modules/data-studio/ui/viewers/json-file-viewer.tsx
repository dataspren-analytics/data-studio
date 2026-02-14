"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, FileJson } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileViewerProps } from "./types";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonNodeProps {
  keyName?: string;
  value: JsonValue;
  depth: number;
  isLast: boolean;
}

function JsonNode({ keyName, value, depth, isLast }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  const entries = useMemo(() => {
    if (isObject) return Object.entries(value);
    if (isArray) return value.map((v, i) => [i.toString(), v] as [string, JsonValue]);
    return [];
  }, [value, isObject, isArray]);

  const renderValue = () => {
    if (value === null) return <span className="text-neutral-400 italic">null</span>;
    if (typeof value === "boolean")
      return <span className="text-amber-600 dark:text-amber-400">{value.toString()}</span>;
    if (typeof value === "number")
      return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
    if (typeof value === "string")
      return <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>;
    return null;
  };

  const bracket = isArray ? ["[", "]"] : ["{", "}"];

  return (
    <div className="font-mono text-xs leading-relaxed">
      <div
        className={cn("flex items-start gap-1", isExpandable && "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 -mx-1 px-1 rounded")}
        onClick={isExpandable ? toggle : undefined}
      >
        {isExpandable && (
          <ChevronRight
            size={12}
            className={cn(
              "mt-0.5 text-neutral-400 transition-transform shrink-0",
              isExpanded && "rotate-90"
            )}
          />
        )}
        {!isExpandable && <span className="w-3 shrink-0" />}

        {keyName !== undefined && (
          <>
            <span className="text-violet-600 dark:text-violet-400">&quot;{keyName}&quot;</span>
            <span className="text-neutral-500">:</span>
          </>
        )}

        {isExpandable ? (
          <>
            <span className="text-neutral-500">{bracket[0]}</span>
            {!isExpanded && (
              <>
                <span className="text-neutral-400 text-[10px]">
                  {entries.length} {isArray ? "items" : "keys"}
                </span>
                <span className="text-neutral-500">{bracket[1]}</span>
              </>
            )}
          </>
        ) : (
          <>
            {renderValue()}
            {!isLast && <span className="text-neutral-400">,</span>}
          </>
        )}
      </div>

      {isExpandable && isExpanded && (
        <div className="ml-4 border-l border-neutral-200 dark:border-neutral-700 pl-2">
          {entries.map(([k, v], i) => (
            <JsonNode
              key={k}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              isLast={i === entries.length - 1}
            />
          ))}
          <div className="flex items-center">
            <span className="w-3 shrink-0" />
            <span className="text-neutral-500">{bracket[1]}</span>
            {!isLast && <span className="text-neutral-400">,</span>}
          </div>
        </div>
      )}
    </div>
  );
}

type LoadingState =
  | { status: "loading" }
  | { status: "success"; data: JsonValue }
  | { status: "error"; message: string };

export function JsonFileViewer({ filePath, runtime }: FileViewerProps) {
  const [state, setState] = useState<LoadingState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    runtime
      .readFile(filePath)
      .then((data) => {
        if (cancelled) return;
        const text = new TextDecoder().decode(data);
        try {
          const parsed = JSON.parse(text);
          setState({ status: "success", data: parsed });
        } catch (e) {
          setState({ status: "error", message: e instanceof Error ? e.message : "Invalid JSON" });
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
  }, [filePath, runtime]);

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
        <span>Failed to parse JSON</span>
        <span className="text-xs text-red-500 font-mono">{state.message}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-stone-50 dark:bg-background p-4 overflow-auto">
      <div className="bg-white dark:bg-card rounded-lg border border-neutral-200 dark:border-border p-4 overflow-auto max-h-full">
        <JsonNode value={state.data} depth={0} isLast />
      </div>
    </div>
  );
}
