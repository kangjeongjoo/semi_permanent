// MediaPipe FaceLandmarker 래퍼 — 브라우저 내에서만 동작 (사진이 외부로 나가지 않음)
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

export type Landmark = { x: number; y: number; z: number };

// 이미지에서 얼굴 랜드마크 검출. 얼굴이 없으면 null 반환.
export async function detectFace(
  image: HTMLImageElement | HTMLCanvasElement
): Promise<Landmark[] | null> {
  const landmarker = await getFaceLandmarker();
  const result: FaceLandmarkerResult = landmarker.detect(image);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }
  return result.faceLandmarks[0] as Landmark[];
}
