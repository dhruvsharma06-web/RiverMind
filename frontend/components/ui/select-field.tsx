import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SelectField({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <span className="select-control">
      <select {...props} className={cn("filter-select", className)}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  );
}
