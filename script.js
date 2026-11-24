const visionVersion = "1.2.3";
const visionCdn = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${visionVersion}`;
const faceModel =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const handModel =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const video = document.querySelector("#camera-video");
const cameraButton = document.querySelector("#camera-toggle");
const cameraStatus = document.querySelector("#camera-status");
const faceOverlay = document.querySelector("#face-overlay");
const mouthOverlay = document.querySelector("#mouth-overlay");
const handOverlays = [...document.querySelectorAll(".hand-overlay")];

let stream = null;
let faceLandmarker = null;
let handLandmarker = null;
let animationFrame = null;
let lastVideoTime = -1;

function hideOverlays() {
  faceOverlay.hidden = true;
  mouthOverlay.hidden = true;
  handOverlays.forEach((overlay) => {
    overlay.hidden = true;
  });
  mouthOverlay.dataset.state = "closed";
  mouthOverlay.src = "images/MOUTH CLOSED.png";
}

function stopCamera(status = "Camera is off.") {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  faceLandmarker?.close();
  handLandmarker?.close();
  faceLandmarker = null;
  handLandmarker = null;
  cameraButton.textContent = "START CAMERA";
  cameraStatus.textContent = status;
  hideOverlays();
}

function getVideoLayout() {
  const scale = Math.max(
    window.innerWidth / video.videoWidth,
    window.innerHeight / video.videoHeight,
  );
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;

  return {
    width,
    height,
    left: (window.innerWidth - width) / 2,
    top: (window.innerHeight - height) / 2,
  };
}

function toCanvasPoint(landmark, layout) {
  return {
    x: layout.left + (1 - landmark.x) * layout.width,
    y: layout.top + landmark.y * layout.height,
  };
}

function showOverlay(element, point, width, angle = 0, flip = 1) {
  element.hidden = false;
  element.style.left = `${point.x}px`;
  element.style.top = `${point.y}px`;
  element.style.width = `${width}px`;
  element.style.transform =
    `translate(-50%, -50%) rotate(${angle}rad) scaleX(${flip})`;
}

function getFaceAngle(landmarks, layout) {
  const eyes = [toCanvasPoint(landmarks[33], layout), toCanvasPoint(landmarks[263], layout)]
    .sort((first, second) => first.x - second.x);

  return Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x);
}

function updateFace(landmarks, layout) {
  if (!landmarks) {
    faceOverlay.hidden = true;
    mouthOverlay.hidden = true;
    mouthOverlay.dataset.state = "closed";
    mouthOverlay.src = "images/MOUTH CLOSED.png";
    return;
  }

  const points = landmarks.map((landmark) => toCanvasPoint(landmark, layout));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const faceWidth = right - left;
  const faceHeight = bottom - top;
  const faceImageWidth = Math.max(faceWidth * 1.12, faceHeight * 0.878);
  const faceCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const angle = getFaceAngle(landmarks, layout);

  showOverlay(faceOverlay, faceCenter, faceImageWidth, angle);

  const mouthCorners = [
    toCanvasPoint(landmarks[61], layout),
    toCanvasPoint(landmarks[291], layout),
  ];
  const mouthTop = toCanvasPoint(landmarks[13], layout);
  const mouthBottom = toCanvasPoint(landmarks[14], layout);
  const mouthWidth = Math.hypot(
    mouthCorners[1].x - mouthCorners[0].x,
    mouthCorners[1].y - mouthCorners[0].y,
  );
  const mouthGap = Math.hypot(
    mouthBottom.x - mouthTop.x,
    mouthBottom.y - mouthTop.y,
  );
  const wasOpen = mouthOverlay.dataset.state === "open";
  const isOpen = wasOpen ? mouthGap / mouthWidth > 0.08 : mouthGap / mouthWidth > 0.12;

  if (isOpen !== wasOpen) {
    mouthOverlay.dataset.state = isOpen ? "open" : "closed";
    mouthOverlay.src = isOpen ? "images/MOUTH OPEN.png" : "images/MOUTH CLOSED.png";
  }

  showOverlay(
    mouthOverlay,
    {
      x: (mouthCorners[0].x + mouthCorners[1].x) / 2,
      y: (mouthTop.y + mouthBottom.y) / 2,
    },
    mouthWidth * 1.2,
    angle,
  );
}

function updateHands(hands, handedness, layout) {
  handOverlays.forEach((overlay) => {
    overlay.hidden = true;
  });

  hands.forEach((landmarks, index) => {
    const points = landmarks.map((landmark) => toCanvasPoint(landmark, layout));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const centerIndices = [0, 5, 9, 13, 17];
    const center = centerIndices.reduce(
      (sum, pointIndex) => ({
        x: sum.x + points[pointIndex].x / centerIndices.length,
        y: sum.y + points[pointIndex].y / centerIndices.length,
      }),
      { x: 0, y: 0 },
    );
    const wrist = points[0];
    const middleFinger = points[12];
    const angle =
      Math.atan2(middleFinger.y - wrist.y, middleFinger.x - wrist.x) + Math.PI / 2;
    const category = handedness[index]?.[0]?.categoryName;
    const flip = category === "Left" ? -1 : 1;
    const imageWidth = Math.max(width, height * (1055 / 1196)) * 1.1;

    showOverlay(handOverlays[index], center, imageWidth, angle, flip);
  });
}

async function startCamera() {
  cameraButton.disabled = true;
  cameraStatus.textContent = "Waiting for camera permission…";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS and a supported browser.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    video.srcObject = stream;
    await video.play();

    cameraStatus.textContent = "Loading face and hand tracking…";
    const { FaceLandmarker, FilesetResolver, HandLandmarker } =
      await import(`${visionCdn}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${visionCdn}/wasm`);

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: faceModel },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: handModel },
      runningMode: "VIDEO",
      numHands: 2,
    });

    cameraButton.textContent = "STOP CAMERA";
    cameraStatus.textContent = "Camera is on. Tracking runs on this device.";
    lastVideoTime = -1;
    trackFrame();
  } catch (error) {
    console.error("Unable to start camera tracking:", error);
    stopCamera(
      `Could not start camera tracking: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    cameraButton.disabled = false;
  }
}

function trackFrame() {
  if (!stream) {
    return;
  }

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    try {
      const timestamp = performance.now();
      const faceResults = faceLandmarker.detectForVideo(video, timestamp);
      const handResults = handLandmarker.detectForVideo(video, timestamp);
      const layout = getVideoLayout();

      updateFace(faceResults.faceLandmarks[0], layout);
      updateHands(handResults.landmarks, handResults.handedness, layout);
    } catch (error) {
      console.error("Face and hand tracking stopped:", error);
      stopCamera(
        `Tracking stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  }

  animationFrame = requestAnimationFrame(trackFrame);
}

cameraButton.addEventListener("click", () => {
  if (stream) {
    stopCamera();
  } else {
    void startCamera();
  }
});

window.addEventListener("pagehide", () => {
  stopCamera();
});
