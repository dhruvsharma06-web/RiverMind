import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const destination = fileURLToPath(
  new URL("../public/fixtures/", import.meta.url),
);

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.info(
  "Copied repository fixtures to the ignored frontend/public/fixtures directory.",
);
