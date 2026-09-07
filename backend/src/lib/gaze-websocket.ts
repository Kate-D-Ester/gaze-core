export function startOptionalGyroSubscription(
  subscribe: () => Promise<() => void>,
  onReady: (release: () => void) => void,
  onUnavailable: (error: unknown) => void,
) {
  void subscribe().then(onReady).catch(onUnavailable)
}
