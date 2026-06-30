// 선택 옵션: Claude API로 추천을 받는다.
// - hybrid: 사진은 보내지 않고 측정 수치만 전송
// - direct: 사진(base64)을 전송해 직접 분석
// 브라우저에서 사용자 본인 API 키로 직접 호출하므로, 키는 이 기기에만 존재한다.
import type { FaceMetrics, BrowSettings, LipSettings } from "./types";
import type { Recommendation, BrowOption, LipOption } from "./recommend";
import {
  BROW_TEMPLATES,
  LIP_TEMPLATES,
  BROW_COLORS,
  LIP_COLOR_FAMILIES,
  DEFAULT_BROW,
  DEFAULT_LIP,
  browFromTemplate,
  lipFromTemplate,
} from "./designLibrary";

const MODEL = "claude-opus-4-8";

// ---------- 라이브러리 enum (Claude에게 허용 값으로 제시) ----------
const BROW_TECHNIQUES = ["natural", "combo", "powder", "pixel"] as const;
const BROW_SHAPES = [
  "straight",
  "soft-arch",
  "bold-arch",
  "rounded",
  "angular",
  "rising",
] as const;
const BROW_COLOR_IDS = BROW_COLORS.map((c) => c.id);
const LIP_TECHNIQUES = ["full", "gradient", "line-blur", "ombre"] as const;
const LIP_FAMILIES = LIP_COLOR_FAMILIES.map((f) => f.id);

// ---------- Claude 출력 → 우리 설정 매핑 ----------
function browFrom(technique: string, shape: string, colorId: string): BrowSettings {
  const tpl = BROW_TEMPLATES.find(
    (t) => t.technique === technique && t.shape === shape
  );
  const base = tpl
    ? browFromTemplate(tpl)
    : { ...DEFAULT_BROW, technique: technique as BrowSettings["technique"], shape: shape as BrowSettings["shape"] };
  const hex = BROW_COLORS.find((c) => c.id === colorId)?.hex ?? base.color;
  return { ...base, color: hex };
}
function lipFrom(technique: string, colorFamily: string): LipSettings {
  const tpl = LIP_TEMPLATES.find(
    (t) => t.technique === technique && t.colorFamily === colorFamily
  );
  if (tpl) return lipFromTemplate(tpl);
  const hex =
    LIP_COLOR_FAMILIES.find((f) => f.id === colorFamily)?.hex ?? DEFAULT_LIP.color;
  return {
    ...DEFAULT_LIP,
    technique: technique as LipSettings["technique"],
    colorFamily,
    color: hex,
  };
}

// ---------- 출력 스키마 ----------
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    faceShape: { type: "string", enum: ["round", "oval", "long", "square", "heart"] },
    undertone: { type: "string", enum: ["warm", "cool", "neutral"] },
    brows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          technique: { type: "string", enum: BROW_TECHNIQUES },
          shape: { type: "string", enum: BROW_SHAPES },
          colorId: { type: "string", enum: BROW_COLOR_IDS },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["technique", "shape", "colorId", "label", "reason"],
      },
    },
    lips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          technique: { type: "string", enum: LIP_TECHNIQUES },
          colorFamily: { type: "string", enum: LIP_FAMILIES },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["technique", "colorFamily", "label", "reason"],
      },
    },
  },
  required: ["faceShape", "undertone", "brows", "lips"],
};

const SYSTEM = `당신은 반영구 화장(눈썹·입술 문신) 전문 디자이너입니다.
사용자 얼굴 정보를 바탕으로, 시술 전에 어울리는 디자인을 제안합니다.
반드시 주어진 JSON 스키마의 허용 값(enum) 안에서만 선택하세요.
눈썹 3개, 입술 3개를 '추천도 높은 순'으로 제시합니다.
label과 reason은 한국어로, reason은 왜 어울리는지 한 문장으로 구체적으로 적습니다.
색은 얼굴 언더톤(웜/쿨/뉴트럴)에 맞게 고르세요.`;

interface AIResult {
  faceShape: FaceMetrics["shape"];
  undertone: FaceMetrics["undertone"];
  brows: { technique: string; shape: string; colorId: string; label: string; reason: string }[];
  lips: { technique: string; colorFamily: string; label: string; reason: string }[];
}

// 정적(서버리스) 사이트라 브라우저에서 REST API를 직접 호출한다.
// anthropic-dangerous-direct-browser-access 헤더로 브라우저 CORS 호출이 허용된다.
async function callClaude(
  apiKey: string,
  content: unknown[]
): Promise<AIResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message ?? detail;
    } catch {
      /* 무시 */
    }
    if (res.status === 401) detail = "API 키가 올바르지 않습니다.";
    throw new Error(detail);
  }

  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
  };
  const block = data.content.find((b) => b.type === "text");
  if (!block?.text) throw new Error("AI 응답을 해석하지 못했습니다.");
  return JSON.parse(block.text) as AIResult;
}

function toRecommendation(
  ai: AIResult,
  baseMetrics: FaceMetrics,
  quality: { frontal: boolean; message: string }
): Recommendation {
  const ranks = ["추천", "대안", "변화"];
  const brows: BrowOption[] = ai.brows.slice(0, 3).map((b, i) => ({
    id: `ai-brow-${i}`,
    label: `${ranks[i] ?? ""} · ${b.label}`.trim(),
    reason: b.reason,
    settings: browFrom(b.technique, b.shape, b.colorId),
  }));
  const lips: LipOption[] = ai.lips.slice(0, 3).map((l, i) => ({
    id: `ai-lip-${i}`,
    label: `${ranks[i] ?? ""} · ${l.label}`.trim(),
    reason: l.reason,
    settings: lipFrom(l.technique, l.colorFamily),
  }));
  return {
    metrics: { ...baseMetrics, shape: ai.faceShape, undertone: ai.undertone },
    brows: brows.length ? brows : [],
    lips: lips.length ? lips : [],
    quality,
  };
}

// B안: 측정 수치만 전송
export async function aiRecommendHybrid(
  apiKey: string,
  metrics: FaceMetrics,
  quality: { frontal: boolean; message: string }
): Promise<Recommendation> {
  const text =
    `다음은 한 사람의 얼굴 측정 결과입니다(사진은 제공하지 않습니다).\n` +
    `- 얼굴형: ${metrics.shape}\n` +
    `- 세로/가로 비율: ${metrics.faceRatio.toFixed(2)}\n` +
    `- 눈 간격: ${metrics.eyeSpacing}\n` +
    `- 눈꼬리: ${metrics.eyeTilt}\n` +
    `- 입술 두께: ${metrics.lipFullness}\n` +
    `- 추정 언더톤: ${metrics.undertone}\n\n` +
    `이 사람에게 어울리는 반영구 눈썹 3개와 입술 3개를 추천해 주세요.`;
  const ai = await callClaude(apiKey, [{ type: "text", text }]);
  return toRecommendation(ai, metrics, quality);
}

// C안: 사진(dataURL)을 직접 전송
export async function aiRecommendDirect(
  apiKey: string,
  imageDataUrl: string,
  metrics: FaceMetrics,
  quality: { frontal: boolean; message: string }
): Promise<Recommendation> {
  const m = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) throw new Error("이미지를 인코딩하지 못했습니다.");
  const mediaType = m[1];
  const data = m[2];
  const content = [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    },
    {
      type: "text",
      text:
        "이 정면 사진의 얼굴을 분석해, 어울리는 반영구 눈썹 3개와 입술 3개를 추천해 주세요. " +
        "얼굴형과 피부 언더톤을 직접 판단해 반영하세요.",
    },
  ];
  const ai = await callClaude(apiKey, content);
  return toRecommendation(ai, metrics, quality);
}
