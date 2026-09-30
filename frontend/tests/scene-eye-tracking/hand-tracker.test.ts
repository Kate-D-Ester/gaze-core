import { afterEach, expect, test } from "bun:test"
import { HandTracker } from "../../apps/web/src/features/scene-eye-tracking/hand-tracker"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
let trackers: HandTracker[]=[]
afterEach(()=>{trackers.forEach(t=>t.dispose());trackers=[]})
function harness() {
  let callback=()=>{}, closed=0, terminated=0, createCount=0
  const messages: any[]=[], workers: any[]=[]
  const camera={rawCanvas:{},latest:{id:1,timestamp:performance.now(),width:640,height:480,generation:1},subscribe(fn:()=>void){callback=fn;return ()=>{callback=()=>{}}}} as unknown as SceneCamera
  const factory=()=>{const w={onmessage:null,onerror:null,onmessageerror:null,postMessage:(m:any)=>messages.push(m),terminate:()=>terminated++};workers.push(w);return w as unknown as Worker}
  const bitmap=async()=>{createCount++;return {close:()=>closed++} as ImageBitmap}
  const t=new HandTracker(camera,factory,bitmap);trackers.push(t);t.start();const worker=workers[0]
  const reply=(data:any)=>worker.onmessage({data:{generation:messages[0].generation,...data}})
  return {t,camera,messages,workers,reply,tick:()=>callback(),closed:()=>closed,terminated:()=>terminated,created:()=>createCount}
}
test("one hand request in flight and each scene frame is processed once",async()=>{
  const h=harness();h.reply({type:"ready"});h.tick();h.tick();await Promise.resolve()
  expect(h.created()).toBe(1);expect(h.messages.filter(m=>m.type==="frame")).toHaveLength(1)
  const frame=h.messages.at(-1);h.reply({type:"result",scene:frame.scene,landmarks:[],worldLandmarks:[],handedness:[]});h.tick();await Promise.resolve()
  expect(h.created()).toBe(1)
  h.camera.latest={...h.camera.latest!,id:2};h.tick();await Promise.resolve();expect(h.created()).toBe(2)
})
test("source-generation changes discard pending bitmap creation and stale results",async()=>{
  const h=harness();h.reply({type:"ready"});h.tick();h.camera.latest={...h.camera.latest!,generation:2};await Promise.resolve()
  expect(h.closed()).toBe(1)
  h.reply({type:"result",scene:{...h.camera.latest!,generation:1},landmarks:[],worldLandmarks:[],handedness:[]})
  expect(h.t.getSnapshot().hand).toBeNull()
})
test("model load failure is readable and retry creates a fresh worker",()=>{
  const h=harness();h.reply({type:"error",error:"Model asset missing"})
  expect(h.t.getSnapshot().status).toBe("error");expect(h.t.getSnapshot().error).toContain("Model asset missing")
  h.t.start();expect(h.workers).toHaveLength(2);expect(h.terminated()).toBe(1)
  h.reply({type:"ready"});expect(h.t.getSnapshot().status).toBe("loading")
})
test("disposing releases worker and prevents pending images from being transferred",async()=>{
  const h=harness();h.reply({type:"ready"});h.tick();h.t.dispose();await Promise.resolve()
  expect(h.closed()).toBe(1);expect(h.terminated()).toBe(1);expect(h.messages.filter(m=>m.type==="frame")).toHaveLength(0)
})
