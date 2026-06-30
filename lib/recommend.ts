// 규칙 기반 AI 추천 (정밀판) — 얼굴 랜드마크 + 피부 픽셀로 다양한 특징을 계산해
// 어울리는 디자인을 점수화해 상위 3개씩 제안한다. 모든 계산은 기기 내에서 수행되며
// 사진·수치 모두 외부로 전송되지 않는다.
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

// 추가 랜드마크 인덱스 (눈 상/하, 눈썹 아래 중앙)
const EYE_R_TOP = 159;
const EYE_R_BOTTOM = 145;
const EYE_L_TOP = 386;
const EYE_L_BOTTOM = 374;
const BROW_R_BOTTOM_MID = 105;
const BROW_L_BOTTOM_MID = 334;

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
const DEPTH_LABEL: Record<FaceMetrics["depth"], string> = {
  light: "밝은 편",
  medium: "중간",
  deep: "어두운 편",
};
const BROWPOS_LABEL: Record<FaceMetrics["browPosition"], string> = {
  low: "낮은 편",
  balanced: "균형",
  high: "높은 편",
};

export function faceShapeLabel(shape: FaceShape): string {
  return SHAPE_LABEL[shape];
}
export function undertoneLabel(u: FaceMetrics["undertone"]): string {
  return UNDERTONE_LABEL[u];
}
export function depthLabel(d: FaceMetrics["depth"]): string {
  return DEPTH_LABEL[d];
}
export function browPosLabel(b: FaceMetrics["browPosition"]): string {
  return BROWPOS_LABEL[b];
}

const browColorHex = (id: string) =>
  BROW_COLORS.find((c) => c.id === id)?.hex ?? BROW_COLORS[0].hex;

// ---------- 피부 언더톤 + 명도 샘플링 ----------
const SKIN_SAMPLE_INDICES = [50, 280, 101, 330, 9, 151, 116, 345, 117, 346];

function sampleSkin(
  img: ImageData | null,
  landmarks: Landmark[],
  w: number,
  h: number
): { undertone: FaceMetrics["undertone"]; depth: FaceMetrics["depth"] } {
  if (!img) return { undertone: "neutral", depth: "medium" };
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const idx of SKIN_SAMPLE_INDICES) {
    const p = toPx(landmarks, idx, w, h);
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
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
  if (n === 0) return { undertone: "neutral", depth: "medium" };
  r /= n;
  g /= n;
  b /= n;
  const score = r - b + (g - b) * 0.5;
  const undertone: FaceMetrics["undertone"] =
    score >= 60 ? "warm" : score <= 38 ? "cool" : "neutral";
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const depth: FaceMetrics["depth"] =
    lum > 178 ? "light" : lum < 120 ? "deep" : "medium";
  return { undertone, depth };
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
  if (ratio >= 1.5) shape = "long";
  else if (ratio <= 1.25) shape = jawRatio >= 0.82 ? "square" : "round";
  else shape = jawRatio >= 0.78 ? "square" : "oval";
  if (shape === "oval" && jawRatio < 0.68) shape = "heart";

  const rInner = toPx(landmarks, EYE_RIGHT_INNER, w, h);
  const rOuter = toPx(landmarks, EYE_RIGHT_OUTER, w, h);
  const lInner = toPx(landmarks, EYE_LEFT_INNER, w, h);
  const lOuter = toPx(landmarks, EYE_LEFT_OUTER, w, h);
  const eyeWidth = (dist(rInner, rOuter) + dist(lInner, lOuter)) / 2 || 1;

  const eyeGap = dist(rInner, lInner);
  const gapRatio = eyeGap / eyeWidth;
  const eyeSpacing =
    gapRatio > 1.15 ? "wide" : gapRatio < 0.9 ? "narrow" : "normal";

  const tilt =
    (rOuter.y - rInner.y + (lOuter.y - lInner.y)) / 2 / eyeWidth;
  const eyeTilt = tilt < -0.06 ? "upturned" : tilt > 0.06 ? "downturned" : "neutral";

  // 눈 크기 (수직 개안 / 눈 가로폭)
  const openR = Math.abs(
    toPx(landmarks, EYE_R_BOTTOM, w, h).y - toPx(landmarks, EYE_R_TOP, w, h).y
  );
  const openL = Math.abs(
    toPx(landmarks, EYE_L_BOTTOM, w, h).y - toPx(landmarks, EYE_L_TOP, w, h).y
  );
  const openRatio = (openR + openL) / 2 / eyeWidth;
  const eyeSize =
    openRatio > 0.4 ? "large" : openRatio < 0.28 ? "small" : "average";

  // 눈썹–눈 거리 (눈썹 아래 중앙 ~ 눈 위) → 눈썹 위치
  const gapBrowR = Math.abs(
    toPx(landmarks, BROW_R_BOTTOM_MID, w, h).y - toPx(landmarks, EYE_R_TOP, w, h).y
  );
  const gapBrowL = Math.abs(
    toPx(landmarks, BROW_L_BOTTOM_MID, w, h).y - toPx(landmarks, EYE_L_TOP, w, h).y
  );
  const browGapRatio = (gapBrowR + gapBrowL) / 2 / eyeWidth;
  const browPosition =
    browGapRatio < 0.6 ? "low" : browGapRatio > 0.95 ? "high" : "balanced";

  // 좌우 비대칭 (눈썹–눈 거리 좌우 차) — 기울기와 무관
  const asym = Math.abs(gapBrowR - gapBrowL) / ((gapBrowR + gapBrowL) / 2 || 1);
  const asymmetry = asym > 0.25 ? "noticeable" : asym > 0.12 ? "slight" : "even";

  const lipPts = LIPS_OUTER.map((i) => toPx(landmarks, i, w, h));
  const lipXs = lipPts.map((p) => p.x);
  const lipYs = lipPts.map((p) => p.y);
  const lipRatio =
    (Math.max(...lipYs) - Math.min(...lipYs)) /
    (Math.max(...lipXs) - Math.min(...lipXs));
  const lipFullness =
    lipRatio > 0.5 ? "full" : lipRatio < 0.38 ? "thin" : "normal";

  const { undertone, depth } = sampleSkin(img, landmarks, w, h);

  return {
    shape,
    eyeSpacing,
    lipFullness,
    faceRatio: ratio,
    undertone,
    eyeTilt,
    browPosition,
    eyeSize,
    asymmetry,
    depth,
  };
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
  const yaw = Math.abs(dl - dr) / (dl + dr);

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
function goldenBrowAdjust(
  landmarks: Landmark[],
  w: number,
  h: number
): { tailAngle: number; note: string } {
  const head = toPx(landmarks, BROW_RIGHT_TOP[0], w, h);
  const tail = toPx(landmarks, BROW_RIGHT_TOP[BROW_RIGHT_TOP.length - 1], w, h);
  const span = Math.abs(tail.x - head.x) || 1;
  const drop = (tail.y - head.y) / span;

  if (drop > 0.12)
    return {
      tailAngle: 9,
      note: "꼬리가 살짝 처져 있어 황금비 기준으로 꼬리를 올렸어요.",
    };
  if (drop < -0.12)
    return { tailAngle: -5, note: "꼬리가 다소 올라가 있어 각도를 낮춰 부드럽게 맞췄어요." };
  return { tailAngle: 0, note: "앞머리–꼬리 균형이 좋아 자연스러운 라인을 유지했어요." };
}

// ---------- 추천 생성 ----------
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

// 언더톤 × 명도 → 눈썹 색 우선순위(id 3개)
function pickBrowColors(
  tone: FaceMetrics["undertone"],
  depth: FaceMetrics["depth"]
): string[] {
  const warm = ["soft-brown", "brown", "black-brown"];
  const cool = ["ash", "gray-brown", "black-brown"];
  const neutral = ["brown", "gray-brown", "soft-brown"];
  let base = tone === "warm" ? warm : tone === "cool" ? cool : neutral;
  if (depth === "deep") base = ["black-brown", ...base.filter((c) => c !== "black-brown")];
  else if (depth === "light")
    base = [...base.filter((c) => c !== "black-brown"), "black-brown"];
  return base;
}

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
  const m = analyzeFace(landmarks, w, h, img);
  const quality = checkFrontal(landmarks, w, h);
  const golden = goldenBrowAdjust(landmarks, w, h);
  const toneL = undertoneLabel(m.undertone);

  // 눈꼬리 기울기에 따른 꼬리 각도 보정
  const tiltAdj = m.eyeTilt === "downturned" ? 6 : m.eyeTilt === "upturned" ? -3 : 0;

  // ----- 눈썹 추천 3개 -----
  const prefShapes = SHAPE_AFFINITY[m.shape];
  const colorIds = pickBrowColors(m.undertone, m.depth);
  const brows: BrowOption[] = prefShapes.map((shape, i) => {
    const tpl = BROW_TEMPLATES.find((t) => t.shape === shape) ?? BROW_TEMPLATES[0];
    const s = browFromTemplate(tpl);
    s.color = browColorHex(colorIds[Math.min(i, colorIds.length - 1)]);

    // 눈 크기 → 굵기
    if (m.eyeSize === "large") s.thickness = Math.min(1.5, s.thickness * 1.08);
    else if (m.eyeSize === "small") s.thickness = Math.max(0.5, s.thickness * 0.94);
    // 눈썹이 낮은 편이면 살짝 얇게
    if (m.browPosition === "low") s.thickness = Math.max(0.5, s.thickness - 0.05);

    // 꼬리 각도 = 황금비 + 눈꼬리 보정
    s.tailAngle = Math.max(-15, Math.min(15, s.tailAngle + golden.tailAngle + tiltAdj));

    // 눈 간격 → 앞머리/길이
    if (m.eyeSpacing === "wide") s.headDensity = Math.min(1, s.headDensity + 0.15);
    else if (m.eyeSpacing === "narrow") {
      s.headDensity = Math.max(0, s.headDensity - 0.12);
      s.length = 1.1;
    }

    const rank = i === 0 ? "추천" : i === 1 ? "대안" : "변화";
    let reason = `${SHAPE_LABEL[m.shape]} · ${SHAPE_REASON[shape]}. 색은 ${toneL}·피부 ${DEPTH_LABEL[m.depth]}에 맞췄어요.`;
    if (i === 0) {
      reason += ` ${golden.note}`;
      if (m.eyeSize !== "average")
        reason += m.eyeSize === "large" ? " 눈이 큰 편이라 굵기를 살짝 더했어요." : " 눈이 작은 편이라 굵기를 조금 줄였어요.";
      if (m.asymmetry === "noticeable")
        reason += " 좌우 눈썹 높이가 다소 달라요 — ‘점 수정’으로 균형을 맞추면 더 좋아요.";
    }
    return { id: `${tpl.id}-${i}`, label: `${rank} · ${tpl.label}`, reason, settings: s };
  });

  // ----- 입술 추천 3개 -----
  const fams = LIP_FAMILY_BY_TONE[m.undertone];
  const lips: LipOption[] = fams.map((fam, i) => {
    const tplId = `gradient-${fam}`;
    const tpl = LIP_TEMPLATES.find((t) => t.id === tplId) ?? LIP_TEMPLATES[0];
    const s = lipFromTemplate(tpl);
    if (m.lipFullness === "thin") {
      s.innerDepth = 0.8;
      s.intensity = 0.62;
    } else if (m.lipFullness === "full") {
      s.innerDepth = 0.55;
      s.intensity = 0.7;
    }
    // 피부 명도 → 발색 명도
    if (m.depth === "deep") {
      s.lightness = Math.max(0.7, s.lightness * 0.92);
      s.saturation = Math.min(1.5, s.saturation * 1.05);
    } else if (m.depth === "light") {
      s.lightness = Math.min(1.3, s.lightness * 1.06);
    }

    const famLabel = tpl.label.split("·")[1]?.trim() ?? tpl.label;
    const fullnessNote =
      m.lipFullness === "thin"
        ? "안쪽을 채우는 그라데이션으로 볼륨감을 살렸어요"
        : m.lipFullness === "full"
          ? "도톰한 입술을 차분하게 정리했어요"
          : "균형 잡힌 입술에 자연스럽게 어울려요";
    const rank = i === 0 ? "추천" : i === 1 ? "대안" : "변화";
    return {
      id: `${tplId}-${i}`,
      label: `${rank} · ${famLabel}`,
      reason: `${toneL}·피부 ${DEPTH_LABEL[m.depth]}에 어울리는 ${famLabel} 계열. ${fullnessNote}.`,
      settings: s,
    };
  });

  return { metrics: m, brows, lips, quality };
}
