import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
export function Pagination({
  page,
  pages,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="list-pagination" aria-label={label}>
      <Button
        size="sm"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={15} />
        Previous
      </Button>
      <span aria-live="polite">
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={15} />
      </Button>
    </nav>
  );
}
