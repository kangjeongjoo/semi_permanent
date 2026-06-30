// 규칙 기반 AI 추천 — 얼굴 랜드마크에서 특징을 계산해 어울리는 디자인을 제안.
// 모든 계산은 기기 내에서 수행되며 외부 전송이 없다.
import type { Landmark } from "./faceLandmarker";
import {
  dist,
  toPx,
  FACE_TOP,
  FACE_BOTTOM,
  FACE_LEFT,
  FACE_RIGHT,
  JAW_LEFT,
  JAW_RIGHT,
  EYE_RIGHT_INNER,
  EYE_LEFT_INNER,
  EYE_RIGHT_OUTER,
  EYE_LEFT_OUTER,
} from "./landmarks";
import {
  BROW_TEMPLATES,
  LIP_TEMPLATES,
  browFromTemplate,
  lipFromTemplate,
} from "./designLibrary";
import type {
  FaceMetrics,
  FaceShape,
  BrowSettings,
  LipSettings,
  BrowShape,
} from "./types";
import { LIPS_OUTER } from "./landmarks";

export interface Recommendation {
  metrics: FaceMetrics;
  brow: BrowSettings;
  lip: LipSettings;
  browReason: string;
  lipReason: string;
}

export function analyzeFace(
  landmarks: Landmark[],
  w: number,
  h: number
): FaceMetrics {
  const top = toPx(landmarks, FACE_TOP, w, h);
  const bottom = toPx(landmarks, FACE_BOTTOM, w, h);
  const left = toPx(landmarks, FACE_LEFT, w, h);
  const right = toPx(landmarks, FACE_RIGHT, w, h);
  const jawL = toPx(landmarks, JAW_LEFT, w, h);
  const jawR = toPx(landmarks, JAW_RIGHT, w, h);

  const faceH = dist(top, bottom);
  const faceW = dist(left, right);
  const jawW = dist(jawL, jawR);
  const ratio = faceH / faceW; // 세로/가로
  const jawRatio = jawW / faceW; // 턱 너비 비율 (각진 정도)

  let shape: FaceShape;
  if (ratio >= 1.5) {
    shape = "long";
  } else if (ratio <= 1.25) {
    shape = jawRatio >= 0.82 ? "square" : "round";
  } else {
    shape = jawRatio >= 0.78 ? "square" : "oval";
  }
  // 광대가 넓고 턱이 좁으면 하트형으로 보정
  if (shape === "oval" && jawRatio < 0.68) shape = "heart";

  // 눈 간격: 양쪽 눈 안쪽 거리 / 한쪽 눈 가로폭
  const eyeGap = dist(
    toPx(landmarks, EYE_RIGHT_INNER, w, h),
    toPx(landmarks, EYE_LEFT_INNER, w, h)
  );
  const eyeWidth =
    (dist(
      toPx(landmarks, EYE_RIGHT_INNER, w, h),
      toPx(landmarks, EYE_RIGHT_OUTER, w, h)
    ) +
      dist(
        toPx(landmarks, EYE_LEFT_INNER, w, h),
        toPx(landmarks, EYE_LEFT_OUTER, w, h)
      )) /
    2;
  const gapRatio = eyeGap / eyeWidth;
  const eyeSpacing =
    gapRatio > 1.15 ? "wide" : gapRatio < 0.9 ? "narrow" : "normal";

  // 입술 두께: 입 높이 / 입 너비
  const lipPts = LIPS_OUTER.map((i) => toPx(landmarks, i, w, h));
  const lipXs = lipPts.map((p) => p.x);
  const lipYs = lipPts.map((p) => p.y);
  const lipW = Math.max(...lipXs) - Math.min(...lipXs);
  const lipH = Math.max(...lipYs) - Math.min(...lipYs);
  const lipRatio = lipH / lipW;
  const lipFullness =
    lipRatio > 0.5 ? "full" : lipRatio < 0.38 ? "thin" : "normal";

  return { shape, eyeSpacing, lipFullness, faceRatio: ratio };
}

const SHAPE_LABEL: Record<FaceShape, string> = {
  round: "둥근형",
  oval: "계란형",
  long: "긴 얼굴형",
  square: "각진형",
  heart: "하트형",
};

// 얼굴형 → 추천 눈썹 모양
function recommendBrowShape(shape: FaceShape): { shape: BrowShape; reason: string } {
  switch (shape) {
    case "round":
      return {
        shape: "angular",
        reason: `${SHAPE_LABEL[shape]}에는 약간 각진 눈썹이 윤곽을 또렷하게 잡아줘요.`,
      };
    case "long":
      return {
        shape: "straight",
        reason: `${SHAPE_LABEL[shape]}에는 일자형이 얼굴 길이를 완화해줘요.`,
      };
    case "square":
      return {
        shape: "rounded",
        reason: `${SHAPE_LABEL[shape]}에는 둥근 눈썹이 각진 인상을 부드럽게 해줘요.`,
      };
    case "heart":
      return {
        shape: "soft-arch",
        reason: `${SHAPE_LABEL[shape]}에는 완만한 아치가 균형을 잡아줘요.`,
      };
    case "oval":
    default:
      return {
        shape: "soft-arch",
        reason: `${SHAPE_LABEL[shape]}은 대부분 잘 어울려, 완만한 아치를 기본 추천해요.`,
      };
  }
}

export function recommend(
  landmarks: Landmark[],
  w: number,
  h: number
): Recommendation {
  const metrics = analyzeFace(landmarks, w, h);
  const { shape: browShape, reason: shapeReason } = recommendBrowShape(
    metrics.shape
  );

  // 라이브러리에서 추천 모양에 맞는 눈썹 템플릿 선택 (없으면 첫 번째)
  const browTpl =
    BROW_TEMPLATES.find((t) => t.shape === browShape) ?? BROW_TEMPLATES[0];
  const brow = browFromTemplate(browTpl);

  // 눈 간격에 따라 앞머리 위치 보정 코멘트
  let browReason = shapeReason;
  if (metrics.eyeSpacing === "wide") {
    brow.headDensity = Math.min(1, brow.headDensity + 0.15);
    browReason += " 눈 간격이 넓은 편이라 앞머리를 살짝 진하게 맞췄어요.";
  } else if (metrics.eyeSpacing === "narrow") {
    brow.headDensity = Math.max(0, brow.headDensity - 0.15);
    brow.length = 1.1;
    browReason += " 눈 간격이 좁은 편이라 꼬리를 살짝 길게 맞췄어요.";
  }

  // 입술: 두께에 따라 기법/색 추천
  let lipTplId: string;
  let lipReason: string;
  if (metrics.lipFullness === "thin") {
    lipTplId = "gradient-coral";
    lipReason =
      "입술이 얇은 편이라 안쪽을 채우는 그라데이션 + 화사한 코랄로 볼륨감을 살렸어요.";
  } else if (metrics.lipFullness === "full") {
    lipTplId = "gradient-mlbb";
    lipReason =
      "입술이 도톰한 편이라 차분한 MLBB 그라데이션으로 자연스럽게 정리했어요.";
  } else {
    lipTplId = "gradient-rose";
    lipReason = "전체적으로 균형 잡힌 입술이라 로즈 그라데이션을 기본 추천해요.";
  }
  const lipTpl = LIP_TEMPLATES.find((t) => t.id === lipTplId) ?? LIP_TEMPLATES[0];
  const lip = lipFromTemplate(lipTpl);

  return { metrics, brow, lip, browReason, lipReason };
}

export function faceShapeLabel(shape: FaceShape): string {
  return SHAPE_LABEL[shape];
}
