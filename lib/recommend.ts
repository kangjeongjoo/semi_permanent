// 규칙 기반 AI 추천 (고도화판) — 얼굴 랜드마크 + 피부 픽셀로 특징을 계산해
// 어울리는 디자인을 점수화해 상위 3개씩 제안한다. 모든 계산은 기기 내에서 수행되며
// 사진·수치 모두 외부로 전송되지 않는다.
import type { Landmark } from "./faceLandmarker";
import {
  dist,
  toPx,
  type Pt,
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
  BROW_RIGHT_TOP,
  LIPS_OUTER,
} from "./landmarks";
import {
  BROW_TEMPLATES,
  LIP_TEMPLATES,
  BROW_COLORS,
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

export interface BrowOption {
  id: string;
  label: string;
  reason: string;
  settings: BrowSettings;
}
export interface LipOption {
  id: string;
  label: string;
  reason: string;
  settings: LipSettings;
}
export interface Recommendation {
  metrics: FaceMetrics;
  brows: BrowOption[];
  lips: LipOption[];
  quality: { frontal: boolean; message: string };
}

const SHAPE_LABEL: Record<FaceShape, string> = {
  round: "둥근형",
  oval: "계란형",
  long: "긴 얼굴형",
  square: "각진형",
  heart: "하트형",
};
const UNDERTONE_LABEL: Record<FaceMetrics["undertone"], string> = {
  warm: "웜톤",
  cool: "쿨톤",
  neutral: "뉴트럴",
};

export function faceShapeLabel(shape: FaceShape): string {
  return SHAPE_LABEL[shape];
}
export function undertoneLabel(u: FaceMetrics["undertone"]): string {
  return UNDERTONE_LABEL[u];
}

const browColorHex = (id: string) =>
  BROW_COLORS.find((c) => c.id === id)?.hex ?? BROW_COLORS[0].hex;

// ---------- 피부 언더톤(퍼스널 컬러) 샘플링 ----------

// 피부가 잘 드러나는 지점들(양 볼·미간). 입술/눈썹/눈을 피한다.
const SKIN_SAMPLE_INDICES = [50, 280, 101, 330, 9, 151, 116, 345];

function sampleUndertone(
  img: ImageData | null,
  landmarks: Landmark[],
  w: number,
  h: number
): FaceMetrics["undertone"] {
  if (!img) return "neutral";
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const idx of SKIN_SAMPLE_INDICES) {
    const p = toPx(landmarks, idx, w, h);
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    // 3x3 평균
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = (y * w + x) * 4;
        r += img.data[o];
        g += img.data[o + 1];
        b += img.data[o + 2];
        n++;
      }
    }
  }
  if (n === 0) return "neutral";
  r /= n;
  g /= n;
  b /= n;
  // 웜(노랑·골드) vs 쿨(핑크·블루) — 적-청 차와 녹색 비중으로 판정
  const warmth = r - b; // 클수록 웜
  const yellowBias = g - b; // 노란기
  const score = warmth + yellowBias * 0.5;
  if (score >= 60) return "warm";
  if (score <= 38) return "cool";
  return "neutral";
}

// ---------- 얼굴 특징 ----------

export function analyzeFace(
  landmarks: Landmark[],
  w: number,
  h: number,
  img: ImageData | null
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
  const ratio = faceH / faceW;
  const jawRatio = jawW / faceW;

  let shape: FaceShape;
  if (ratio >= 1.5) {
    shape = "long";
  } else if (ratio <= 1.25) {
    shape = jawRatio >= 0.82 ? "square" : "round";
  } else {
    shape = jawRatio >= 0.78 ? "square" : "oval";
  }
  if (shape === "oval" && jawRatio < 0.68) shape = "heart";

  const eyeGap = dist(
    toPx(landmarks, EYE_RIGHT_INNER, w, h),
    toPx(landmarks, EYE_LEFT_INNER, w, h)
  );
  const rInner = toPx(landmarks, EYE_RIGHT_INNER, w, h);
  const rOuter = toPx(landmarks, EYE_RIGHT_OUTER, w, h);
  const lInner = toPx(landmarks, EYE_LEFT_INNER, w, h);
  const lOuter = toPx(landmarks, EYE_LEFT_OUTER, w, h);
  const eyeWidth = (dist(rInner, rOuter) + dist(lInner, lOuter)) / 2;
  const gapRatio = eyeGap / eyeWidth;
  const eyeSpacing =
    gapRatio > 1.15 ? "wide" : gapRatio < 0.9 ? "narrow" : "normal";

  // 눈꼬리 기울기: 바깥 코너가 안쪽보다 위면 올라간 눈
  const tiltR = rOuter.y - rInner.y;
  const tiltL = lOuter.y - lInner.y;
  const tilt = (tiltR + tiltL) / 2 / eyeWidth;
  const eyeTilt = tilt < -0.06 ? "upturned" : tilt > 0.06 ? "downturned" : "neutral";

  const lipPts = LIPS_OUTER.map((i) => toPx(landmarks, i, w, h));
  const lipXs = lipPts.map((p) => p.x);
  const lipYs = lipPts.map((p) => p.y);
  const lipW = Math.max(...lipXs) - Math.min(...lipXs);
  const lipH = Math.max(...lipYs) - Math.min(...lipYs);
  const lipRatio = lipH / lipW;
  const lipFullness =
    lipRatio > 0.5 ? "full" : lipRatio < 0.38 ? "thin" : "normal";

  const undertone = sampleUndertone(img, landmarks, w, h);

  return { shape, eyeSpacing, lipFullness, faceRatio: ratio, undertone, eyeTilt };
}

// ---------- 정면 품질 검증 ----------

function checkFrontal(
  landmarks: Landmark[],
  w: number,
  h: number
): { frontal: boolean; message: string } {
  const noseTip = toPx(landmarks, 1, w, h);
  const left = toPx(landmarks, FACE_LEFT, w, h);
  const right = toPx(landmarks, FACE_RIGHT, w, h);
  const dl = Math.abs(noseTip.x - left.x);
  const dr = Math.abs(right.x - noseTip.x);
  const yaw = Math.abs(dl - dr) / (dl + dr); // 좌우 회전(0=정면)

  // 좌우 눈 높이차 = 기울기
  const eyeR = toPx(landmarks, EYE_RIGHT_OUTER, w, h);
  const eyeL = toPx(landmarks, EYE_LEFT_OUTER, w, h);
  const roll = Math.abs(eyeR.y - eyeL.y) / dist(eyeR, eyeL);

  if (yaw > 0.18)
    return {
      frontal: false,
      message: "고개가 옆으로 돌아간 것 같아요. 정면 사진일수록 추천·합성이 정확해집니다.",
    };
  if (roll > 0.12)
    return {
      frontal: false,
      message: "얼굴이 기울어진 것 같아요. 카메라와 수평을 맞추면 더 정확해집니다.",
    };
  return { frontal: true, message: "" };
}

// ---------- 눈썹 황금비 보정 ----------

// 눈썹 꼬리가 처졌는지/올라갔는지 → 추천 꼬리 각도 보정값(deg)과 코멘트
function goldenBrowAdjust(
  landmarks: Landmark[],
  w: number,
  h: number
): { tailAngle: number; note: string } {
  const head = toPx(landmarks, BROW_RIGHT_TOP[0], w, h); // 앞머리(안쪽)
  const tail = toPx(landmarks, BROW_RIGHT_TOP[BROW_RIGHT_TOP.length - 1], w, h);
  const span = Math.abs(tail.x - head.x) || 1;
  const drop = (tail.y - head.y) / span; // 양수=꼬리가 처짐

  if (drop > 0.12)
    return {
      tailAngle: 9,
      note: "눈썹 꼬리가 살짝 처져 있어, 황금비 기준으로 꼬리를 올려 또렷하게 맞췄어요.",
    };
  if (drop < -0.12)
    return {
      tailAngle: -5,
      note: "눈썹 꼬리가 다소 올라가 있어, 각도를 조금 낮춰 부드럽게 맞췄어요.",
    };
  return { tailAngle: 0, note: "눈썹 앞머리–꼬리 균형이 좋아 자연스러운 라인을 유지했어요." };
}

// ---------- 추천 생성 ----------

// 얼굴형별 선호 눈썹 모양 (앞쪽이 가장 잘 맞음)
const SHAPE_AFFINITY: Record<FaceShape, BrowShape[]> = {
  round: ["angular", "bold-arch", "straight"],
  long: ["straight", "soft-arch", "rounded"],
  square: ["rounded", "soft-arch", "straight"],
  heart: ["soft-arch", "rounded", "straight"],
  oval: ["soft-arch", "bold-arch", "straight"],
};

const SHAPE_REASON: Record<BrowShape, string> = {
  angular: "약간 각진 라인이 윤곽을 또렷하게 잡아줘요",
  "bold-arch": "뚜렷한 아치가 입체감을 살려줘요",
  "soft-arch": "완만한 아치가 균형을 잡아줘요",
  straight: "일자 라인이 인상을 부드럽고 안정적으로 만들어요",
  rounded: "둥근 라인이 각진 인상을 부드럽게 해줘요",
  rising: "상승 라인이 시원한 인상을 줘요",
};

// 언더톤별 눈썹 색 우선순위(id)
const BROW_COLOR_BY_TONE: Record<FaceMetrics["undertone"], string[]> = {
  warm: ["soft-brown", "brown", "black-brown"],
  cool: ["ash", "gray-brown", "black-brown"],
  neutral: ["brown", "gray-brown", "soft-brown"],
};

// 언더톤별 입술 색 계열 우선순위(id)
const LIP_FAMILY_BY_TONE: Record<FaceMetrics["undertone"], string[]> = {
  warm: ["coral", "mlbb", "red"],
  cool: ["rose", "pink", "plum"],
  neutral: ["mlbb", "rose", "coral"],
};

export function recommend(
  landmarks: Landmark[],
  w: number,
  h: number,
  img: ImageData | null
): Recommendation {
  const metrics = analyzeFace(landmarks, w, h, img);
  const quality = checkFrontal(landmarks, w, h);
  const golden = goldenBrowAdjust(landmarks, w, h);
  const toneL = undertoneLabel(metrics.undertone);

  // ----- 눈썹 추천 3개 -----
  const prefShapes = SHAPE_AFFINITY[metrics.shape];
  const colorIds = BROW_COLOR_BY_TONE[metrics.undertone];
  const brows: BrowOption[] = [];
  prefShapes.forEach((shape, i) => {
    const tpl = BROW_TEMPLATES.find((t) => t.shape === shape) ?? BROW_TEMPLATES[0];
    const s = browFromTemplate(tpl);
    s.color = browColorHex(colorIds[Math.min(i, colorIds.length - 1)]);
    s.tailAngle = Math.max(-15, Math.min(15, s.tailAngle + golden.tailAngle));
    // 눈 간격 보정
    if (metrics.eyeSpacing === "wide") s.headDensity = Math.min(1, s.headDensity + 0.15);
    else if (metrics.eyeSpacing === "narrow") {
      s.headDensity = Math.max(0, s.headDensity - 0.12);
      s.length = 1.1;
    }
    const rank = i === 0 ? "추천" : i === 1 ? "대안" : "변화";
    let reason = `${SHAPE_LABEL[metrics.shape]} · ${SHAPE_REASON[shape]}. 색은 ${toneL}에 맞춰 골랐어요.`;
    if (i === 0) reason += ` ${golden.note}`;
    brows.push({ id: tpl.id + "-" + i, label: `${rank} · ${tpl.label}`, reason, settings: s });
  });

  // ----- 입술 추천 3개 -----
  const fams = LIP_FAMILY_BY_TONE[metrics.undertone];
  const lips: LipOption[] = [];
  fams.forEach((fam, i) => {
    // thin은 그라데이션으로 볼륨감, 그 외도 기본 그라데이션
    const tplId = `gradient-${fam}`;
    const tpl = LIP_TEMPLATES.find((t) => t.id === tplId) ?? LIP_TEMPLATES[0];
    const s = lipFromTemplate(tpl);
    if (metrics.lipFullness === "thin") {
      s.innerDepth = 0.8;
      s.intensity = 0.62;
    } else if (metrics.lipFullness === "full") {
      s.innerDepth = 0.55;
      s.intensity = 0.7;
    }
    const famLabel = tpl.label.split("·")[1]?.trim() ?? tpl.label;
    const fullnessNote =
      metrics.lipFullness === "thin"
        ? "안쪽을 채우는 그라데이션으로 볼륨감을 살렸어요"
        : metrics.lipFullness === "full"
          ? "도톰한 입술을 차분하게 정리했어요"
          : "균형 잡힌 입술에 자연스럽게 어울려요";
    const rank = i === 0 ? "추천" : i === 1 ? "대안" : "변화";
    lips.push({
      id: tplId + "-" + i,
      label: `${rank} · ${famLabel}`,
      reason: `${toneL}에 어울리는 ${famLabel} 계열. ${fullnessNote}.`,
      settings: s,
    });
  });

  return { metrics, brows, lips, quality };
}
