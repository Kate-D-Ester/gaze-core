export type FixtureWorkerRequest = {
  type: string
  generation: number
  bitmap?: ImageBitmap
  scene?: object
}

export type FixtureSceneClock = { timestamp: number }

export type FixtureSceneIdentity = { id: number }
