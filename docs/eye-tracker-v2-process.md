# Eye tracking process

The `/trial` experience runs all camera processing in the browser. USB camera capture uses `getUserMedia`; network video and MJPEG streams are read directly by browser APIs. Frames go from the source video to a local Web Worker for detection and are not sent to the backend.

## User workflow

1. **Camera:** choose a USB camera or network stream and start its preview.
2. **Eye region:** move or resize the region of interest around one eye.
3. **Eye model:** adjust automatic or manual thresholding. Manual tracker uses selected eye corners; Auto tracker builds and locks a 3D sphere model from pupil observations.
4. **Calibrate:** collect stable gaze samples at nine screen targets.
5. **Live gaze:** view the estimated point and validate against additional targets.

## Processing boundary

- USB and network source handling, thresholding, pupil detection, model fitting, calibration, and gaze estimation stay on the client.
- Network streams must be reachable from the browser and permit cross-origin reads (CORS). There is no camera relay or eye-tracking API on the backend.
- The backend remains for authentication, email verification, health, and API-key management.

For camera placement, detector behavior, mathematical conventions, limitations, and checks, see [Eye tracking V2](eye-tracking-v2.md).
