"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

interface InlineSelectOption {
  value: string;
  label: string;
}

interface InlineSelectProps {
  value: string;
  options: InlineSelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

export function InlineSelect({
  value,
  options,
  onValueChange,
  placeholder = "Select...",
  className,
  align = "start",
}: InlineSelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border border-neutral-200 dark:border-border bg-transparent px-2 text-xs transition-colors outline-none focus-visible:ring-0",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown size={10} className="opacity-50 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onValueChange(option.value)}
            className="text-xs"
          >
            {option.label}
            {value === option.value && <Check size={12} className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
