# Proctoring port notes: Proctoring-AI + SafeExamBrowser to browser

Reference clones live OUTSIDE the project at `HR/_proctoring_refs/` (never in the
docker build context). These notes record the exact algorithms mined from each
repo so the browser implementation ports proven logic instead of inventing
thresholds.

STATUS: the first implementation pass was rolled back out of the project (the
user wants the feature proven sideways before it lands in the codebase again).
Nothing below is implemented in `hr_screening_mvp` right now. This document is
the build plan: Phase 1 (event bus, lockdown rules, HR timeline), Phase 2
(browser verification of Phase 1), Phase 3 (the six detectors below), Phase 4
(audio signals). Implement, verify in a real browser, then integrate.

## Proctoring-AI (vardanagarwal/Proctoring-AI, MIT)

Six detectors, each a standalone script. The Python/OpenCV/YOLOv3 stack is
scrapped per spec; the MATH and THRESHOLDS port as-is.

### 1. Gaze tracking - `eye_tracker.py`
- Eye regions from 68-point landmarks: left eye `[36..41]`, right eye `[42..47]`.
- Eyeball centroid found by thresholding the eye ROI (default threshold 75),
  erode 2x / dilate 4x / medianBlur 3, then largest contour centroid.
- `find_eyeball_position(end_points, cx, cy)`:
  - `x_ratio = (left - cx) / (cx - right)`; `x_ratio > 3` = looking LEFT,
    `x_ratio < 0.33` = looking RIGHT
  - `y_ratio = (cy - top) / (bottom - cy)`; `y_ratio < 0.33` = looking UP
  - else normal. Both eyes must agree (`left == right and left != 0`).
- Browser port: MediaPipe FaceLandmarker iris landmarks (left iris 468-472,
  right iris 473-477) against eye corners (33/133 left, 362/263 right). Same
  ratio formulas, same thresholds; no thresholding step needed (iris center
  is given directly).

### 2. Mouth opening - `mouth_opening_detector.py`
- Lip pairs (68-point): outer `[[49,59],[50,58],[51,57],[52,56],[53,55]]`,
  inner `[[61,67],[62,66],[63,65]]`. Distances measured in pixels (y delta).
- PER-CANDIDATE CALIBRATION: record 100 frames at interview start (their
  'press r' step) and average -> baseline `d_outer`, `d_inner`.
- Open when `d_outer[i] + 3 < current` for > 3 of 5 pairs AND
  `d_inner[i] + 2 < current` for > 2 of 3 pairs.
- Browser port: FaceLandmarker lip landmarks (outer lip 49/59 equivalents:
  use 0/17 top-bottom pairs; inner: 13/14 vs 78/308). Keep the calibration
  step (first ~5s of interview) and the +3px/+2px deltas scaled by face size.

### 3. Head pose - `head_pose_estimation.py`
- 6-point solvePnP. 3D model points (mm): nose tip (0,0,0), chin (0,-330,-65),
  left eye corner (-225,170,-135), right eye corner (225,170,-135), left mouth
  corner (-150,-150,-125), right mouth corner (150,-150,-125).
- 2D image points from 68-point landmarks: `[30, 8, 36, 45, 48, 54]`.
- Camera matrix: `focal_length = image width`, center = image center,
  zero distortion. Flag `SOLVEPNP_UPNP`.
- Angles: project nose direction point (0,0,1000); vertical angle from nose
  line slope, horizontal from annotation-box line slope.
- Thresholds: vertical >= 48 deg = head DOWN, <= -48 = head UP;
  horizontal >= 48 = head RIGHT, <= -48 = head LEFT.
- Browser port: same 6 3D points mapped to FaceLandmarker indices
  (nose 1, chin 152, eye corners 33/263, mouth corners 61/291), solvePnP in
  JS (or `@techstark/opencv-js`), same +-48 deg thresholds.

### 4. Person + phone - `person_and_phone.py`
- YOLOv3 (416px, /255, COCO classes). Class 0 = person, class 67 = cell phone.
- NMS: `iou_threshold=0.5`, `score_threshold=0.6`.
- `count == 0` = no person; `count > 1` = multiple people; any class-67 box =
  phone detected.
- Browser port: MediaPipe ObjectDetector (EfficientDet-Lite2, COCO) - same
  class IDs, same confidence floor. Wasm/GPU tiers per config.js.

### 5. Face spoofing - `face_spoofing.py`
- Feature vector: per-channel 256-bin histograms of the face ROI converted to
  YCrCb and LUV -> 3 x 256 x 2 = 1536 features.
- Model: sklearn ExtraTreesClassifier, `models/face_spoofing.pkl` (183KB, real
  binary in the repo, NOT an LFS pointer).
- Decision: mean prediction probability >= 0.7 over sampled frames = spoof
  (photo/screen attack).
- Browser port: convert the pkl to ONNX (`skl2onnx`), run with
  `onnxruntime-web`. Histogram features computed in JS from the face ROI.
  This is a proven trained model - do NOT replace with a hand-rolled heuristic
  unless the ONNX path fails.

### 6. Audio monitoring - `audio_part.py`
- Records 10s chunks, Google STT, NLTK stopword filter, then keyword overlap
  between the transcript and the question paper: any common content word =
  alert (someone being fed the question/answers).
- Browser port: the interview already runs Web Speech recognition (en-IN).
  Two signals, both log-only:
  a. Sustained voice (VAD, RMS > threshold for > 2.5s) during NON-answer
     windows (before the question finishes playing / during thinking time) =
     someone coaching.
  b. Transcript vs current-question keyword overlap (stopwords removed)
     during thinking time = question being read to the candidate.
  The interview's own speech recognition must not be disturbed: run the VAD
  on a separate AnalyserNode tap, never restart recognition.

## SafeExamBrowser (seb-win-refactoring, MPL-2.0)

Native C# desktop shell: the CODE is not portable (spec says drop it). Two
things were mined:

### Keyboard block list - `SafeExamBrowser.Monitoring/Keyboard/KeyboardInterceptor.cs`
To be implemented in `frontend/src/proctoring/lockdown.js` (Phase 1):
- Apps key; Escape; F1-F12; LWin/RWin; PrintScreen
- Alt+Escape, Alt+F4, Alt+Space, Alt+Tab
- Ctrl+C, Ctrl+Escape, Ctrl+V, Ctrl+X
- Injected (synthetic) input
- Every blocked key is logged (their `Log()` call) - our emit per block.
- Honest adaptations: OS-level combos and screenshot captures cannot be
  stopped from a browser tab; those are log-only (`logOnly`).

### Behavioral catalog worth porting later
- `SafeExamBrowser.Proctoring/` - their proctoring module (screen share
  recording, window focus monitoring) if HR ever wants recording replay.
- `SafeExamBrowser.Browser/Filters/Rules/` - URL filter rule engine
  (regex/simplified) if we ever add an allowed-URL whitelist. Not needed for
  a single-page exam.

## What was NOT reused (and why)
- Proctoring-AI's Python runtime, YOLOv3 weights loader, dlib landmarks,
  sklearn 0.19.1 environment: replaced by MediaPipe + ONNX per spec Step 1.
- SEB's browser shell (CefSharp), kiosk mode, process killer: impossible and
  undesirable in a browser sandbox; the Web API equivalents are in
  lockdown.js + the vendored react-proctoring library.
- The event bus, batch endpoint, DB table, HR timeline: no equivalent exists
  in either repo; written from scratch (app-specific plumbing).
