// Canvas 합성 — 원본 이미지 위에 눈썹(파라메트릭)과 입술(색 블렌딩)을 그린다.
import type { Landmark } from "./faceLandmarker";
import type { BrowSettings, LipSettings, DesignSettings, Stroke } from "./types";
import {
  toPx,
  toPxList,
  dist,
  type Pt,
  LIPS_OUTER,
  LIPS_INNER,
  BROW_RIGHT_TOP,
  BROW_RIGHT_BOTTOM,
  BROW_LEFT_TOP,
  BROW_LEFT_BOTTOM,
  EYE_RIGHT_INNER,
  EYE_RIGHT_OUTER,
  EYE_LEFT_INNER,
  EYE_LEFT_OUTER,
} from "./landmarks";
import { hexToRgb, adjustColor, rgba, type RGB } from "./color";
import type { BrowShape } from "./types";

// ---------- 기하 헬퍼 ----------

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// 폴리라인을 호 길이 기준으로 N개 점으로 리샘플
function resample(line: Pt[], n: number): Pt[] {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const d = dist(line[i], line[i + 1]);
    segLen.push(d);
    total += d;
  }
  if (total === 0) return new Array(n).fill(line[0]);
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    let acc = 0;
    let idx = 0;
    while (idx < segLen.length && acc + segLen[idx] < target) {
      acc += segLen[idx];
      idx++;
    }
    if (idx >= segLen.length) {
      out.push(line[line.length - 1]);
    } else {
      const t = segLen[idx] === 0 ? 0 : (target - acc) / segLen[idx];
      out.push(lerp(line[idx], line[idx + 1], t));
    }
  }
  return out;
}

// 모양별 아치 프로파일 (t: 0=앞머리, 1=꼬리)
function archProfile(t: number, shape: BrowShape): number {
  // 피크 위치는 보통 꼬리쪽 0.65
  const peak = 0.65;
  switch (shape) {
    case "straight":
      return 0; // 평평
    case "angular": {
      // 피크에서 꺾이는 삼각형
      return t < peak ? t / peak : Math.max(0, 1 - (t - peak) / (1 - peak));
    }
    case "rising":
      return t; // 꼬리로 갈수록 상승
    case "rounded":
    case "soft-arch":
    case "bold-arch":
    default: {
      // 부드러운 종 모양
      const x = (t - peak) / 0.5;
      return Math.max(0, 1 - x * x);
    }
  }
}

// 눈썹 한쪽의 변형된 상/하 라인 생성
function buildBrowShape(
  topNat: Pt[],
  botNat: Pt[],
  s: BrowSettings,
  browLen: number
): { top: Pt[]; bot: Pt[] } {
  const N = 24;
  const top0 = resample(topNat, N);
  const bot0 = resample(botNat, N);

  // 브로우 방향(앞머리→꼬리)과 위쪽 법선
  const dir = {
    x: top0[N - 1].x - top0[0].x,
    y: top0[N - 1].y - top0[0].y,
  };
  const dlen = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dlen;
  const uy = dir.y / dlen;
  // 위쪽 법선 (화면 위 = y 감소 방향이 되도록)
  let nx = -uy;
  let ny = ux;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }

  const archAmt = s.archHeight * browLen * 0.32;
  const tailExtra = Math.tan((s.tailAngle * Math.PI) / 180) * browLen * 0.5;

  const top: Pt[] = [];
  const bot: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const mid = lerp(top0[i], bot0[i], 0.5);
    // 절반 두께 벡터
    const hx = (bot0[i].x - top0[i].x) / 2;
    const hy = (bot0[i].y - top0[i].y) / 2;

    // 아치 오프셋 (법선 방향)
    const arch = archAmt * archProfile(t, s.shape);
    // 꼬리 각도 (t>0.5 구간에서 점증)
    const tail = t > 0.45 ? tailExtra * ((t - 0.45) / 0.55) : 0;
    const offX = nx * (arch + tail);
    const offY = ny * (arch + tail);

    top.push({
      x: mid.x - hx * s.thickness + offX,
      y: mid.y - hy * s.thickness + offY,
    });
    bot.push({
      x: mid.x + hx * s.thickness + offX,
      y: mid.y + hy * s.thickness + offY,
    });
  }

  // 꼬리 길이 연장: 마지막 점을 방향으로 더 밀기
  if (s.length !== 1) {
    const ext = (s.length - 1) * browLen * 0.5;
    for (let i = N - 4; i < N; i++) {
      const w = (i - (N - 4)) / 3;
      top[i] = { x: top[i].x + ux * ext * w, y: top[i].y + uy * ext * w };
      bot[i] = { x: bot[i].x + ux * ext * w, y: bot[i].y + uy * ext * w };
    }
  }
  return { top, bot };
}

function pathFromShape(ctx: CanvasRenderingContext2D, top: Pt[], bot: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i].x, top[i].y);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i].x, bot[i].y);
  ctx.closePath();
}

// 눈썹 한쪽 렌더
function renderBrow(
  ctx: CanvasRenderingContext2D,
  top: Pt[],
  bot: Pt[],
  s: BrowSettings
) {
  const N = top.length;
  const col = hexToRgb(s.color);

  ctx.save();
  pathFromShape(ctx, top, bot);
  ctx.clip();

  // 베이스 채움 (앞머리 → 꼬리 그라데이션)
  const g = ctx.createLinearGradient(top[0].x, top[0].y, top[N - 1].x, top[N - 1].y);
  const headA = s.opacity * (0.35 + s.headDensity * 0.5);
  const bodyA = s.opacity * (s.technique === "natural" ? 0.45 : 0.85);
  const tailA = s.opacity * 0.55;
  g.addColorStop(0, rgba(col, headA));
  g.addColorStop(0.4, rgba(col, bodyA));
  g.addColorStop(1, rgba(col, tailA));
  ctx.fillStyle = g;
  ctx.fillRect(
    Math.min(...top.map((p) => p.x)) - 5,
    Math.min(...top.map((p) => p.y)) - 20,
    Math.max(...bot.map((p) => p.x)) + 10,
    Math.max(...bot.map((p) => p.y)) + 40
  );
  ctx.restore();

  // 결(hair) 스트로크 — natural / combo / pixel
  if (s.technique !== "powder") {
    ctx.save();
    pathFromShape(ctx, top, bot);
    ctx.clip();
    const strokeStart = s.technique === "combo" ? 0 : 0;
    const strokeEnd = s.technique === "combo" ? 0.55 : 1; // 콤보는 앞쪽만 결
    const hairs = s.technique === "pixel" ? 0 : 70;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (let k = 0; k < hairs; k++) {
      const t = strokeStart + Math.random() * (strokeEnd - strokeStart);
      const i = Math.min(N - 2, Math.floor(t * (N - 1)));
      const v = Math.random();
      const base = lerp(top[i], bot[i], v);
      // 방향: 위로 약간 비스듬히 (꼬리쪽으로)
      const dx = top[i + 1].x - top[i].x;
      const dy = top[i + 1].y - top[i].y;
      const dl = Math.hypot(dx, dy) || 1;
      const len = 4 + Math.random() * 5;
      const ex = base.x + (dx / dl) * len;
      const ey = base.y + (dy / dl) * len - 3;
      ctx.strokeStyle = rgba(col, s.opacity * (0.5 + Math.random() * 0.4));
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    // 픽셀(도트) 기법
    if (s.technique === "pixel") {
      for (let k = 0; k < 220; k++) {
        const t = Math.random();
        const i = Math.min(N - 1, Math.floor(t * (N - 1)));
        const v = Math.random();
        const p = lerp(top[i], bot[i], v);
        ctx.fillStyle = rgba(col, s.opacity * (0.4 + Math.random() * 0.5));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawBrows(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  s: BrowSettings
) {
  const sides: [number[], number[]][] = [
    [BROW_RIGHT_TOP, BROW_RIGHT_BOTTOM],
    [BROW_LEFT_TOP, BROW_LEFT_BOTTOM],
  ];
  // 부드러운 가장자리를 위해 살짝 블러
  ctx.save();
  ctx.filter = "blur(0.6px)";
  for (const [topIdx, botIdx] of sides) {
    const topNat = toPxList(landmarks, topIdx, w, h);
    const botNat = toPxList(landmarks, botIdx, w, h);
    const browLen = dist(topNat[0], topNat[topNat.length - 1]);
    const { top, bot } = buildBrowShape(topNat, botNat, s, browLen);
    renderBrow(ctx, top, bot, s);
  }
  ctx.restore();
}

// ---------- 입술 ----------

function drawLips(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  s: LipSettings
) {
  const outer = toPxList(landmarks, LIPS_OUTER, w, h);
  const inner = toPxList(landmarks, LIPS_INNER, w, h);

  const cx = outer.reduce((a, p) => a + p.x, 0) / outer.length;
  const cy = outer.reduce((a, p) => a + p.y, 0) / outer.length;
  const rx = (Math.max(...outer.map((p) => p.x)) - Math.min(...outer.map((p) => p.x))) / 2;
  const ry = (Math.max(...outer.map((p) => p.y)) - Math.min(...outer.map((p) => p.y))) / 2;

  // 입 벌림 여부 (안쪽 영역이 충분히 크면 치아/입안은 칠하지 않음)
  const innerH =
    Math.max(...inner.map((p) => p.y)) - Math.min(...inner.map((p) => p.y));
  const mouthOpen = innerH > ry * 0.55;

  const base = adjustColor(s.color, s.saturation, s.lightness);

  // 오프스크린에 입술 레이어 생성
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d")!;

  // 클립 패스 (바깥 윤곽 - 입 벌림 시 안쪽 제외)
  octx.beginPath();
  octx.moveTo(outer[0].x, outer[0].y);
  outer.slice(1).forEach((p) => octx.lineTo(p.x, p.y));
  octx.closePath();
  if (mouthOpen) {
    octx.moveTo(inner[0].x, inner[0].y);
    inner.slice(1).forEach((p) => octx.lineTo(p.x, p.y));
    octx.closePath();
  }
  octx.clip("evenodd");

  // 색 채움 (기법별)
  const maxR = Math.max(rx, ry) * 1.25;
  if (s.technique === "gradient" || s.technique === "ombre") {
    const grad = octx.createRadialGradient(cx, cy, 1, cx, cy, maxR);
    const innerCol = adjustColor(s.color, s.saturation * 1.1, s.lightness * 0.82);
    grad.addColorStop(0, rgba(innerCol, s.intensity * (0.7 + s.innerDepth * 0.3)));
    grad.addColorStop(0.6, rgba(base, s.intensity * 0.85));
    grad.addColorStop(1, rgba(base, s.intensity * (1 - s.innerDepth) * 0.6));
    octx.fillStyle = grad;
  } else if (s.technique === "line-blur") {
    octx.fillStyle = rgba(base, s.intensity * 0.55);
  } else {
    // full
    octx.fillStyle = rgba(base, s.intensity);
  }
  octx.fillRect(0, 0, w, h);

  // 윤곽 또렷함이 낮으면 블러 → 메인에 합성
  ctx.save();
  const blur = (1 - s.crispness) * 4;
  ctx.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
  // 'multiply'로 입술 본래 음영을 살리며 색을 입힘
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(off, 0, 0);
  ctx.restore();

  // 살짝 발색을 더해 생기 부여
  ctx.save();
  ctx.globalAlpha = s.intensity * 0.35;
  ctx.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

// ---------- 자유 브러시 ----------

function drawFreehand(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number
) {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const o = off.getContext("2d")!;
  o.lineJoin = "round";
  o.lineCap = "round";
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    const lw = Math.max(1, s.size * w);
    if (s.tool === "erase") {
      o.globalCompositeOperation = "destination-out";
      o.strokeStyle = "rgba(0,0,0,1)";
      o.fillStyle = "rgba(0,0,0,1)";
    } else {
      o.globalCompositeOperation = "source-over";
      o.strokeStyle = rgba(hexToRgb(s.color), s.opacity);
      o.fillStyle = rgba(hexToRgb(s.color), s.opacity);
    }
    o.lineWidth = lw;
    if (s.points.length === 1) {
      const p = s.points[0];
      o.beginPath();
      o.arc(p.x * w, p.y * h, lw / 2, 0, Math.PI * 2);
      o.fill();
      continue;
    }
    o.beginPath();
    o.moveTo(s.points[0].x * w, s.points[0].y * h);
    for (let i = 1; i < s.points.length; i++) {
      o.lineTo(s.points[i].x * w, s.points[i].y * h);
    }
    o.stroke();
  }
  ctx.drawImage(off, 0, 0);
}

// ---------- 눈썹 황금비 가이드 ----------

function drawGuides(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number
) {
  const nose = toPx(landmarks, 2, w, h); // 코 밑 중앙
  const sides = [
    { inner: EYE_RIGHT_INNER, outer: EYE_RIGHT_OUTER, brow: BROW_RIGHT_TOP },
    { inner: EYE_LEFT_INNER, outer: EYE_LEFT_OUTER, brow: BROW_LEFT_TOP },
  ];
  const lw = Math.max(1, w / 700);
  const dotR = Math.max(2.5, w / 200);

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
  };

  ctx.save();
  ctx.lineWidth = lw;
  for (const s of sides) {
    const inner = toPx(landmarks, s.inner, w, h);
    const outer = toPx(landmarks, s.outer, w, h);
    const browPts = s.brow.map((i) => toPx(landmarks, i, w, h));
    const browTopY = Math.min(...browPts.map((p) => p.y));
    const yTop = browTopY - Math.abs(inner.y - browTopY) * 0.45;
    const yBottom = inner.y;

    const headX = inner.x; // 시작점: 안쪽 눈머리 수직선
    const peakX = inner.x + (outer.x - inner.x) * 0.66; // 아치 피크: 눈동자 바깥쪽

    // 시작점(시안)
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(38,160,180,0.9)";
    line(headX, yTop, headX, yBottom);
    // 아치 피크(브랜드 색)
    ctx.strokeStyle = "rgba(181,101,118,0.95)";
    line(peakX, yTop, peakX, yBottom);
    // 꼬리: 코밑 → 눈꼬리 연장선
    const dx = outer.x - nose.x;
    const dy = outer.y - nose.y;
    const len = Math.hypot(dx, dy) || 1;
    const ex = outer.x + (dx / len) * (len * 0.42);
    const ey = outer.y + (dy / len) * (len * 0.42);
    ctx.strokeStyle = "rgba(120,110,210,0.9)";
    line(outer.x, outer.y, ex, ey);

    ctx.setLineDash([]);
    dot(headX, browTopY, "#26a0b4");
    dot(peakX, browTopY, "#b56576");
    dot(ex, ey, "#786ed2");
  }
  ctx.restore();
}

// ---------- 공개 API ----------

export function drawComposite(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Landmark[] | null,
  settings: DesignSettings,
  show: { brow: boolean; lip: boolean },
  freehand?: Stroke[],
  guide?: boolean
) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  if (landmarks) {
    if (show.lip) drawLips(ctx, landmarks, w, h, settings.lip);
    if (show.brow) drawBrows(ctx, landmarks, w, h, settings.brow);
  }
  // 자유 브러시는 항상 맨 위에 (얼굴 미검출 시에도 그릴 수 있음)
  if (freehand && freehand.length > 0) drawFreehand(ctx, freehand, w, h);
  // 황금비 가이드는 최상단
  if (guide && landmarks) drawGuides(ctx, landmarks, w, h);
}
