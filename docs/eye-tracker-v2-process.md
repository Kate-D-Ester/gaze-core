# Eye tracking process

The `/trial/screen-eye-tracking` experience runs all camera processing in the browser. USB camera capture uses `getUserMedia`; network video and MJPEG streams connect directly from the browser. Frames go from the source video to a local Web Worker for detection and are not sent to the backend.

## User workflow

1. **Camera:** choose a USB camera or network stream and start its preview.
2. **Eye region:** move or resize the region of interest around one eye.
3. **Eye model:** adjust automatic or manual thresholding. Manual tracker uses selected eye corners; Auto tracker builds and locks a 3D sphere model from pupil observations.
4. **Head tracker (optional):** connect a separate front camera for a head-mounted eye camera, or skip to eye-only calibration.
5. **Calibrate:** collect nine screen fixations. A stable center establishes the baseline. Corner and edge fixations require matching center-relative directions; edges also check mapped proximity. Head mode adds twelve center-target holds across translation, depth and rotation to identify a joint eye-ray/eye-origin/screen-plane model. The initial grid stays near the starting head pose; compensation is learned from paired readings throughout the movement pass. A stationary grid cannot certify a head-compensated model.
6. **Live gaze:** view the estimated point and validate against additional targets. Head mode pauses when the face is lost or outside the measured calibration envelope or when camera timestamps cannot be paired.

## Processing boundary

- USB and network source handling, thresholding, pupil detection, model fitting, calibration, and gaze estimation stay on the client.
- The browser/OS resolves the camera URL and follows redirects. No relay or app camera route is used. The camera must allow CORS for pixel access; browser local-network and mixed-content policies still apply.
- The backend remains for authentication, email verification, health, and API-key management.

For camera placement, detector behavior, mathematical conventions, limitations, and checks, see [Eye tracking V2](eye-tracking-v2.md).
