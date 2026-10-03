export function ViewerSetup() {
  return (
    <section
      aria-labelledby="viewer-setup-title"
      className="rounded-lg border bg-card p-4"
    >
      <h2 id="viewer-setup-title" className="text-sm font-semibold">
        Set up your cameras
      </h2>
      <ol className="mt-3 grid list-none gap-4 p-0 text-sm md:grid-cols-3">
        <li>
          <h3 className="font-medium">1. Connect the feeds you need</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Choose a different USB device for each camera, or choose Network and
            enter its stream URL. Press Connect in each panel and wait for Live.
            You can use commands with just one connected feed.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-primary">
            <a
              href="#eye-camera-panel"
              className="underline underline-offset-4"
            >
              Eye setup
            </a>
            <a
              href="#scene-camera-panel"
              className="underline underline-offset-4"
            >
              Scene setup
            </a>
            <a
              href="#auxiliary-camera-panel"
              className="underline underline-offset-4"
            >
              Auxiliary setup
            </a>
          </div>
        </li>
        <li>
          <h3 className="font-medium">2. Check the image orientation</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Use the rotate, mirror and flip controls on each feed until its
            preview is upright. These controls change only that feed.
          </p>
        </li>
        <li>
          <h3 className="font-medium">3. Choose a feed and try a command</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Click the camera name to make it active. Click its image to mark a
            fixed point. Select point uses the center if none is marked. Take
            photo saves the active camera image. Buttons and typed commands work
            without voice.
          </p>
          <a
            href="#viewer-command-title"
            className="mt-2 inline-block text-xs text-primary underline underline-offset-4"
          >
            Go to commands
          </a>
        </li>
      </ol>
      <div className="mt-4 border-t pt-3 text-xs leading-relaxed">
        <h3 className="font-medium">
          Looking for eye / scene gaze calibration?
        </h3>
        <p className="mt-1 text-muted-foreground">
          The Eye camera here is a video preview. It does not estimate gaze or
          select points from where you look. The existing Scene &amp; eye
          tracking trial has the eye setup and gaze calibration workflow. Its
          calibration applies to that trial, not this viewer.
        </p>
        <a
          href="/trial/scene-camera-eye-tracking"
          className="mt-2 inline-block text-primary underline underline-offset-4"
        >
          Open scene / eye calibration
        </a>
      </div>
    </section>
  )
}
