import type {
  BrowTemplate,
  LipTemplate,
  BrowSettings,
  LipSettings,
} from "./types";

// 눈썹 색상 팔레트
export const BROW_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "brown", label: "브라운", hex: "#6b4a35" },
  { id: "gray-brown", label: "그레이브라운", hex: "#5b4d45" },
  { id: "black-brown", label: "블랙브라운", hex: "#3d2e26" },
  { id: "soft-brown", label: "소프트브라운", hex: "#8a6650" },
  { id: "ash", label: "애쉬", hex: "#544a44" },
];

// 입술 색 계열 (계열별 대표 색)
export const LIP_COLOR_FAMILIES: {
  id: string;
  label: string;
  hex: string;
}[] = [
  { id: "mlbb", label: "MLBB", hex: "#c47b73" },
  { id: "coral", label: "코랄", hex: "#e8765a" },
  { id: "pink", label: "핑크", hex: "#e58aa0" },
  { id: "rose", label: "로즈", hex: "#c75c6e" },
  { id: "red", label: "레드", hex: "#c0392b" },
  { id: "plum", label: "플럼", hex: "#9b4a63" },
];

// 눈썹 유형 라이브러리 (기법 × 모양 조합)
export const BROW_TEMPLATES: BrowTemplate[] = [
  {
    id: "natural-soft-arch",
    label: "자연 · 완만 아치",
    technique: "natural",
    shape: "soft-arch",
    defaults: { thickness: 0.95, archHeight: 0.45, headDensity: 0.5 },
  },
  {
    id: "natural-straight",
    label: "자연 · 일자형",
    technique: "natural",
    shape: "straight",
    defaults: { thickness: 1.0, archHeight: 0.15, headDensity: 0.55 },
  },
  {
    id: "combo-bold-arch",
    label: "콤보 · 뚜렷 아치",
    technique: "combo",
    shape: "bold-arch",
    defaults: { thickness: 1.05, archHeight: 0.7, headDensity: 0.4 },
  },
  {
    id: "combo-angular",
    label: "콤보 · 각진형",
    technique: "combo",
    shape: "angular",
    defaults: { thickness: 1.0, archHeight: 0.55, tailAngle: -6 },
  },
  {
    id: "powder-straight",
    label: "섀도우 · 일자형",
    technique: "powder",
    shape: "straight",
    defaults: { thickness: 1.1, archHeight: 0.1, headDensity: 0.35 },
  },
  {
    id: "powder-rounded",
    label: "섀도우 · 둥근형",
    technique: "powder",
    shape: "rounded",
    defaults: { thickness: 1.0, archHeight: 0.4, headDensity: 0.4 },
  },
  {
    id: "powder-rising",
    label: "섀도우 · 상승형",
    technique: "powder",
    shape: "rising",
    defaults: { thickness: 0.95, archHeight: 0.35, tailAngle: 10 },
  },
  {
    id: "pixel-soft-arch",
    label: "픽셀 · 완만 아치",
    technique: "pixel",
    shape: "soft-arch",
    defaults: { thickness: 0.9, archHeight: 0.45, headDensity: 0.45 },
  },
];

// 입술 유형 라이브러리 (기법 × 색 계열 조합)
export const LIP_TEMPLATES: LipTemplate[] = LIP_COLOR_FAMILIES.flatMap(
  (fam) => [
    {
      id: `gradient-${fam.id}`,
      label: `그라데이션 · ${fam.label}`,
      technique: "gradient" as const,
      colorFamily: fam.id,
      color: fam.hex,
      defaults: { innerDepth: 0.7, intensity: 0.6, crispness: 0.4 },
    },
    {
      id: `full-${fam.id}`,
      label: `풀립 · ${fam.label}`,
      technique: "full" as const,
      colorFamily: fam.id,
      color: fam.hex,
      defaults: { innerDepth: 0.2, intensity: 0.75, crispness: 0.7 },
    },
  ]
);

export const DEFAULT_BROW: BrowSettings = {
  technique: "natural",
  shape: "soft-arch",
  thickness: 1.0,
  length: 1.0,
  archHeight: 0.45,
  tailAngle: 0,
  headDensity: 0.5,
  color: BROW_COLORS[0].hex,
  opacity: 0.85,
};

export const DEFAULT_LIP: LipSettings = {
  technique: "gradient",
  colorFamily: "mlbb",
  color: LIP_COLOR_FAMILIES[0].hex,
  saturation: 1.0,
  lightness: 1.0,
  intensity: 0.6,
  innerDepth: 0.7,
  crispness: 0.4,
};

export function browFromTemplate(t: BrowTemplate): BrowSettings {
  return { ...DEFAULT_BROW, technique: t.technique, shape: t.shape, ...t.defaults };
}

export function lipFromTemplate(t: LipTemplate): LipSettings {
  return {
    ...DEFAULT_LIP,
    technique: t.technique,
    colorFamily: t.colorFamily,
    color: t.color,
    ...t.defaults,
  };
}
