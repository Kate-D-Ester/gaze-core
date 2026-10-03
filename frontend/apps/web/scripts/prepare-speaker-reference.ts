import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
const source = process.argv[2]
if (!source) {
  throw new Error(
    "Usage: bun run prepare:speaker-reference /absolute/path/to/cnn-debate-low-quality-320x180-15fps.mp4"
  )
}
const file = Bun.file(source)
if (!(await file.exists()) || file.size !== 656735) {
  throw new Error("Use the approved degraded mixed debate fixture")
}
const actual = new Bun.CryptoHasher("sha256")
  .update(await file.arrayBuffer())
  .digest("hex")
if (
  actual !== "53859a95bade8484604726ca442499bdd6b6c4a64c51efe64180e051af3d9062"
) {
  throw new Error("Reference SHA-256 does not match the approved mixed input")
}
const directory = resolve(import.meta.dir, "../public/speaker-reference")
await mkdir(directory, { recursive: true })
await Bun.write(resolve(directory, "debate.mp4"), file)
console.log(
  "Prepared the approved degraded debate with its single original mixed audio stream"
)
