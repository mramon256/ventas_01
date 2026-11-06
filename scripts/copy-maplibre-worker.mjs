import { copyFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const mapLibre = resolve(root, "node_modules/maplibre-gl")
const licenses = resolve(root, "public/third-party-licenses")

await mkdir(licenses, { recursive: true })
await copyFile(
  resolve(mapLibre, "dist/maplibre-gl-worker.mjs"),
  resolve(root, "public/maplibre-gl-worker.mjs"),
)
await copyFile(resolve(mapLibre, "LICENSE.txt"), resolve(licenses, "maplibre-gl.txt"))
