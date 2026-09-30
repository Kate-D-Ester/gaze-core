import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
const root=path.resolve(import.meta.dir,"..")
const destination=path.join(root,"public/vision-runtime")
const packageRoot=path.dirname(require.resolve("@mediapipe/tasks-vision/package.json"))
await mkdir(destination,{recursive:true})
await cp(path.join(packageRoot,"wasm"),path.join(destination,"wasm"),{recursive:true})
const result=await Bun.build({entrypoints:[path.join(root,"src/features/scene-eye-tracking/hand.worker.ts")],target:"browser",format:"iife",minify:true,outdir:destination,naming:"scene-hand.worker.js"})
if(!result.success)throw new Error(result.logs.map(String).join("\n"))
console.log("Prepared pinned MediaPipe worker and WASM assets.")
