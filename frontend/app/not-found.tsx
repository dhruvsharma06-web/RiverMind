import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <Compass size={48} strokeWidth={1} />
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>
        The page doesn’t exist or has moved.
      </p>
      <Button asChild>
        <Link href="/">Back to RiverMind</Link>
      </Button>
    </main>
  );
}
