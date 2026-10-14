export type CameraStreamDependencies = {
  resolve?: (hostname: string) => Promise<string[]>
  fetch?: typeof fetch
}
