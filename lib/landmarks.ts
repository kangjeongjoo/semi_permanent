// MediaPipe Face Mesh (478 points) 주요 인덱스 모음

// 입술 바깥 윤곽 (시계방향 루프)
export const LIPS_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, // 위쪽 바깥 (좌→우)
  375, 321, 405, 314, 17, 84, 181, 91, 146, // 아래쪽 바깥 (우→좌)
];

// 입술 안쪽 윤곽 (입 벌림 구멍)
export const LIPS_INNER = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, // 위쪽 안쪽
  324, 318, 402, 317, 14, 87, 178, 88, 95, // 아래쪽 안쪽
];

// 오른쪽 눈썹(이미지 왼쪽) 윗라인 안→밖
export const BROW_RIGHT_TOP = [55, 65, 52, 53, 46];
// 오른쪽 눈썹 아랫라인
export const BROW_RIGHT_BOTTOM = [107, 66, 105, 63, 70];

// 왼쪽 눈썹(이미지 오른쪽) 윗라인 안→밖
export const BROW_LEFT_TOP = [285, 295, 282, 283, 276];
// 왼쪽 눈썹 아랫라인
export const BROW_LEFT_BOTTOM = [336, 296, 334, 293, 300];

// 눈 (간격 계산용)
export const EYE_RIGHT_INNER = 133;
export const EYE_RIGHT_OUTER = 33;
export const EYE_LEFT_INNER = 362;
export const EYE_LEFT_OUTER = 263;

// 얼굴 윤곽 (얼굴형 계산용)
export const FACE_TOP = 10; // 이마 위
export const FACE_BOTTOM = 152; // 턱 끝
export const FACE_LEFT = 234; // 왼쪽 광대 옆
export const FACE_RIGHT = 454; // 오른쪽 광대 옆
export const JAW_LEFT = 172;
export const JAW_RIGHT = 397;
export const CHEEK_LEFT = 234;
export const CHEEK_RIGHT = 454;

export interface Pt {
  x: number;
  y: number;
}

// 정규화 좌표(0~1) → 픽셀 좌표
export function toPx(
  landmarks: { x: number; y: number }[],
  index: number,
  w: number,
  h: number
): Pt {
  const l = landmarks[index];
  return { x: l.x * w, y: l.y * h };
}

export function toPxList(
  landmarks: { x: number; y: number }[],
  indices: number[],
  w: number,
  h: number
): Pt[] {
  return indices.map((i) => toPx(landmarks, i, w, h));
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
