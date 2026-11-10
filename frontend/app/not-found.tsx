import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <Compass size={48} strokeWidth={1} />
      <p className="eyebrow">OFF THE MAP · 404</p>
      <h1>This stretch is uncharted.</h1>
      <p>
        The page you’re looking for may have moved. Let’s find our way back to
        the river.
      </p>
      <Button asChild>
        <Link href="/">Back to RiverMind</Link>
      </Button>
    </main>
  );
}
