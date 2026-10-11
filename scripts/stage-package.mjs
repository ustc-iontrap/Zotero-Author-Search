import { URL } from "node:url";
import { copyFile, mkdir, readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const { version } = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
await mkdir(new URL("dist/", root), { recursive: true });
await copyFile(
  new URL(".scaffold/build/author-search.xpi", root),
  new URL(`dist/author-search-${version}.xpi`, root),
);
await copyFile(
  new URL(".scaffold/build/update.json", root),
  new URL("dist/update.json", root),
);
