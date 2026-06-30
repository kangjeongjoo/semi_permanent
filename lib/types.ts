// 공통 타입 정의

export type FaceShape = "round" | "oval" | "long" | "square" | "heart";

// 눈썹 기법
export type BrowTechnique = "natural" | "combo" | "powder" | "pixel";
// 눈썹 모양
export type BrowShape = "straight" | "soft-arch" | "bold-arch" | "rounded" | "angular" | "rising";

// 입술 기법
export type LipTechnique = "full" | "gradient" | "line-blur" | "ombre";

export interface BrowSettings {
  technique: BrowTechnique;
  shape: BrowShape;
  thickness: number; // 0.5 ~ 1.5 (배율)
  length: number; // 0.8 ~ 1.2 (꼬리 길이 배율)
  archHeight: number; // 0 ~ 1 (아치 높이)
  tailAngle: number; // -15 ~ 15 (꼬리 각도, deg)
  headDensity: number; // 0 ~ 1 (앞머리 농도)
  color: string; // hex
  opacity: number; // 0 ~ 1
}

export interface LipSettings {
  technique: LipTechnique;
  colorFamily: string; // 색 계열 id
  color: string; // hex
  saturation: number; // 0.5 ~ 1.5
  lightness: number; // 0.7 ~ 1.3
  intensity: number; // 0 ~ 1 (발색 강도 = 불투명도)
  innerDepth: number; // 0 ~ 1 (그라데이션 안쪽 진하기)
  crispness: number; // 0 ~ 1 (윤곽 또렷함, 낮으면 블러)
}

export interface DesignSettings {
  brow: BrowSettings;
  lip: LipSettings;
}

// 라이브러리 항목 (목록 노출용)
export interface BrowTemplate {
  id: string;
  label: string;
  technique: BrowTechnique;
  shape: BrowShape;
  defaults: Partial<BrowSettings>;
}

export interface LipTemplate {
  id: string;
  label: string;
  technique: LipTechnique;
  colorFamily: string;
  color: string;
  defaults: Partial<LipSettings>;
}

// 자유 브러시 획 (좌표는 정규화 0~1, size는 캔버스 너비 대비 비율)
export interface Stroke {
  tool: "draw" | "erase";
  color: string;
  size: number; // 0~1 (캔버스 너비 비율)
  opacity: number; // 0~1
  points: { x: number; y: number }[];
}

// 랜드마크 점 수정값 (인덱스 → 정규화 좌표)
export type LandmarkOverrides = Record<number, { x: number; y: number }>;

// 저장된 시안
export interface SavedDesign {
  id: string;
  name: string;
  createdAt: number;
  thumbnail: string; // dataURL
  settings: DesignSettings;
  freehand?: Stroke[];
  overrides?: LandmarkOverrides;
  show?: { brow: boolean; lip: boolean };
}

// 얼굴 분석 결과
export interface FaceMetrics {
  shape: FaceShape;
  eyeSpacing: "narrow" | "normal" | "wide";
  lipFullness: "thin" | "normal" | "full";
  faceRatio: number; // 세로/가로
}
