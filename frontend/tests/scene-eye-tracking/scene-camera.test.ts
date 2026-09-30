import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if(typeof document === "undefined") GlobalRegistrator.register()
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"

let stopped: string[], cameras: SceneCamera[], pending: ((stream: MediaStream)=>void)[], callbacks: Map<number, FrameRequestCallback>, videoTime: number
const originalCreate = document.createElement.bind(document)
const originalFetch = globalThis.fetch
function stream(id: string): MediaStream {
  const track = new EventTarget() as MediaStreamTrack
  Object.assign(track, {label:id, stop:()=>stopped.push(id), getSettings:()=>({deviceId:id})})
  return {getTracks:()=>[track],getVideoTracks:()=>[track]} as MediaStream
}
beforeEach(()=>{
  stopped=[]; cameras=[]; pending=[]; callbacks=new Map(); videoTime=0
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{
    getUserMedia:()=>new Promise<MediaStream>(resolve=>pending.push(resolve)), enumerateDevices:async()=>[],
    addEventListener(){}, removeEventListener(){},
  }})
  document.createElement = ((tag: string)=>{
    const element = originalCreate(tag)
    if(tag==="video") Object.defineProperties(element,{
      srcObject:{value:null,writable:true},videoWidth:{get:()=>640},videoHeight:{get:()=>480},readyState:{get:()=>2},currentTime:{get:()=>videoTime},
      play:{value:async()=>{}},pause:{value:()=>{}},load:{value:()=>{}},
    })
    if(tag==="canvas") Object.defineProperty(element,"getContext",{value:()=>({drawImage(){}})})
    return element
  }) as typeof document.createElement
  globalThis.requestAnimationFrame=(cb)=>{const id=callbacks.size+1;callbacks.set(id,cb);return id}
  globalThis.cancelAnimationFrame=(id)=>{callbacks.delete(id)}
})
afterEach(()=>{cameras.forEach(c=>c.dispose());document.createElement=originalCreate;globalThis.fetch=originalFetch})
function camera(){const c=new SceneCamera();cameras.push(c);return c}
function tick(time: number){videoTime+=.05;const next=[...callbacks.values()];callbacks.clear();next.forEach(cb=>cb(time))}

test("two independent cameras keep their own sources and release only owned tracks",async()=>{
  const eye=camera(), scene=camera()
  const a=eye.startCamera("eye"), b=scene.startCamera("scene")
  pending[0](stream("eye"));pending[1](stream("scene"));await Promise.all([a,b])
  expect(eye.getSnapshot().source?.deviceId).toBe("eye")
  expect(scene.getSnapshot().source?.deviceId).toBe("scene")
  scene.stop();expect(stopped).toEqual(["scene"])
  expect(eye.getSnapshot().source).not.toBeNull()
  eye.dispose();expect(stopped).toEqual(["scene","eye"])
})
test("obsolete camera permission results cannot reactivate or stop the replacement",async()=>{
  const c=camera(), first=c.startCamera("one"), second=c.startCamera("two")
  pending[1](stream("two"));await second;pending[0](stream("one"));await first
  expect(c.getSnapshot().source?.deviceId).toBe("two");expect(stopped).toEqual(["one"])
})
test("cancel pending startup disposes the late permission stream",async()=>{
  const c=camera(), start=c.startCamera("one");c.stop();pending[0](stream("one"));await start
  expect(c.getSnapshot().source).toBeNull();expect(c.getSnapshot().busy).toBe(false);expect(stopped).toEqual(["one"])
})
test("same USB device cannot become both the eye and scene camera",async()=>{
  const c=camera(), start=c.startCamera("", "eye");pending[0](stream("eye"));await start
  expect(c.getSnapshot().source).toBeNull();expect(c.getSnapshot().error).toContain("different");expect(stopped).toEqual(["eye"])
})
test("fresh decoded frames keep native dimensions and stalled video becomes an error",async()=>{
  const c=camera(), start=c.startCamera("scene");pending[0](stream("scene"));await start
  tick(performance.now());expect(c.latest?.width).toBe(640);expect(c.latest?.height).toBe(480)
  expect(c.rawCanvas.width).toBe(640)
  const last=c.latest!.timestamp;const next=[...callbacks.values()];callbacks.clear();next.forEach(cb=>cb(last+3000))
  expect(c.getSnapshot().error).toContain("stopped");expect(c.getSnapshot().source).toBeNull()
})
test("network mDNS video uses the existing browser-readable source pipeline",async()=>{
  globalThis.fetch=(async()=>new Response("",{headers:{"content-type":"video/mp4"}})) as typeof fetch
  const c=camera();await c.startNetworkStream("http://scene.local/stream.mp4");tick(performance.now())
  expect(c.getSnapshot().source?.kind).toBe("network");expect(c.latest?.height).toBe(480)
})
test("abort releases a pending MJPEG response reader",async()=>{
  let cancelled=false
  globalThis.fetch=(async()=>new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{"content-type":"multipart/x-mixed-replace; boundary=frame"}})) as typeof fetch
  const c=camera(), start=c.startNetworkStream("http://esp32.local:81/stream")
  await new Promise(resolve=>setTimeout(resolve,0));c.stop();await start
  expect(cancelled).toBe(true);expect(c.getSnapshot().error).toBe("")
})
