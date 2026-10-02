import type { WorkerResponse } from "../../apps/web/src/features/eye-tracking/tracker.worker.types"
import type { HeadWorkerResponse } from "../../apps/web/src/features/eye-tracking/head-tracking/head.worker.types"
import type { RemoteResponse } from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"

export type WorkerName = "tracker" | "head" | "remote"
export type WorkerEntries = Record<WorkerName, string>
export type SmokeResponse = WorkerResponse | HeadWorkerResponse | RemoteResponse
