"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Landmark } from "@/lib/faceLandmarker";
import type {
  DesignSettings,
  SavedDesign,
  Stroke,
  LandmarkOverrides,
} from "@/lib/types";
import { DEFAULT_BROW, DEFAULT_LIP } from "@/lib/designLibrary";
import { drawComposite } from "@/lib/compositor";
import { recommend, faceShapeLabel, type Recommendation } from "@/lib/recommend";
import { saveDesign, listDesigns, deleteDesign } from "@/lib/storage";
import {
  applyOverrides,
  EDITABLE_BROW_INDICES,
  EDITABLE_LIP_INDICES,
} from "@/lib/landmarks";
import ControlPanel from "@/components/ControlPanel";
import CompareSlider from "@/components/CompareSlider";
import Gallery from "@/components/Gallery";
import BrushControls, { type BrushState } from "@/components/BrushControls";

type Status = "idle" | "detecting" | "ready" | "noface" | "error";
type View = "edit" | "compare";
type Tool = "adjust" | "points" | "draw";

const MAX_DIM = 820;

const DEFAULT_BRUSH: BrushState = {
  tool: "draw",
  color: "#6b4a35",
  size: 0.012,
  opacity: 0.85,
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [settings, setSettings] = useState<DesignSettings>({
    brow: DEFAULT_BROW,
    lip: DEFAULT_LIP,
  });
  const [show, setShow] = useState({ brow: true, lip: true });
  const [rec, setRec] = useState<Recommendation | null>(null);

  const [view, setView] = useState<View>("edit");
  const [tool, setTool] = useState<Tool>("adjust");
  const [freehand, setFreehand] = useState<Stroke[]>([]);
  const [overrides, setOverrides] = useState<LandmarkOverrides>({});
  const [brush, setBrush] = useState<BrushState>(DEFAULT_BRUSH);

  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // 점 수정이 반영된 유효 랜드마크
  const effLandmarks = useMemo(
    () => (landmarks ? applyOverrides(landmarks, overrides) : null),
    [landmarks, overrides]
  );

  const refreshGallery = useCallback(async () => {
    try {
      setSaved(await listDesigns());
    } catch {
      /* IndexedDB 미지원 환경 무시 */
    }
  }, []);

  useEffect(() => {
    refreshGallery();
  }, [refreshGallery]);

  // 현재 상태로 합성 다시 그리기
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    drawComposite(canvas, img, effLandmarks, settings, show, freehand);
  }, [effLandmarks, settings, show, freehand]);

  useEffect(() => {
    if (status === "ready" && view === "edit") render();
  }, [render, status, view]);

  const handleFile = async (file: File) => {
    setStatus("detecting");
    setErrorMsg("");
    setRec(null);
    setView("edit");
    setTool("adjust");
    setFreehand([]);
    setOverrides({});

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = canvasRef.current!;
      canvas.width = w;
      canvas.height = h;
      imageRef.current = img;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      setBeforeUrl(canvas.toDataURL("image/jpeg", 0.92));

      try {
        const { detectFace } = await import("@/lib/faceLandmarker");
        const lm = await detectFace(img);
        if (!lm) {
          // 얼굴 미검출 — 직접 그리기는 가능하도록 ready 처리
          setLandmarks(null);
          setStatus("noface");
          return;
        }
        setLandmarks(lm);
        const r = recommend(lm, w, h);
        setRec(r);
        setSettings({ brow: r.brow, lip: r.lip });
        setShow({ brow: true, lip: true });
        setStatus("ready");
      } catch (e) {
        console.error(e);
        setErrorMsg(
          "얼굴 인식 모델을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요."
        );
        setStatus("error");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      setErrorMsg("이미지를 불러오지 못했습니다.");
      setStatus("error");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // 얼굴 미검출이어도 직접 그리기 모드로 진입
  const enterDrawOnly = () => {
    setStatus("ready");
    setTool("draw");
    setShow({ brow: false, lip: false });
  };

  const enterCompare = () => {
    render();
    const canvas = canvasRef.current;
    if (canvas) setAfterUrl(canvas.toDataURL("image/jpeg", 0.92));
    setView("compare");
  };

  const applyRecommendation = () => {
    if (rec) {
      setSettings({ brow: rec.brow, lip: rec.lip });
      setShow({ brow: true, lip: true });
      setOverrides({});
    }
  };

  // ---------- 포인터(그리기 / 점 수정) ----------
  const drawing = useRef(false);
  const dragIdx = useRef<number | null>(null);

  const normPt = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  const overlayDown = (e: React.PointerEvent) => {
    if (tool !== "draw") return;
    drawing.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = normPt(e.clientX, e.clientY);
    setFreehand((f) => [
      ...f,
      {
        tool: brush.tool,
        color: brush.color,
        size: brush.size,
        opacity: brush.opacity,
        points: [p],
      },
    ]);
  };

  const overlayMove = (e: React.PointerEvent) => {
    if (tool === "draw" && drawing.current) {
      const p = normPt(e.clientX, e.clientY);
      setFreehand((f) => {
        if (f.length === 0) return f;
        const last = f[f.length - 1];
        return [...f.slice(0, -1), { ...last, points: [...last.points, p] }];
      });
    } else if (tool === "points" && dragIdx.current !== null) {
      const p = normPt(e.clientX, e.clientY);
      setOverrides((o) => ({ ...o, [dragIdx.current as number]: p }));
    }
  };

  const overlayUp = () => {
    drawing.current = false;
    dragIdx.current = null;
  };

  const undoStroke = () => setFreehand((f) => f.slice(0, -1));
  const clearStrokes = () => setFreehand([]);
  const resetPoints = () => setOverrides({});

  // ---------- 저장 / 다운로드 ----------
  const handleSave = async () => {
    render();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const design: SavedDesign = {
      id: crypto.randomUUID(),
      name: `시안 ${new Date().toLocaleString("ko-KR")}`,
      createdAt: Date.now(),
      thumbnail: canvas.toDataURL("image/jpeg", 0.85),
      settings,
      freehand,
      overrides,
      show,
    };
    try {
      await saveDesign(design);
      await refreshGallery();
      setGalleryOpen(true);
    } catch {
      setErrorMsg("저장에 실패했습니다 (브라우저 저장소 미지원).");
    }
  };

  const download = (dataUrl: string, name: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name}.jpg`;
    a.click();
  };

  const downloadCurrent = () => {
    render();
    const canvas = canvasRef.current;
    if (canvas) download(canvas.toDataURL("image/jpeg", 0.92), "반영구_시안");
  };

  // 점 수정 모드에서 보여줄 핸들 인덱스
  const handleIndices = useMemo(() => {
    if (tool !== "points" || !effLandmarks) return [];
    const idx: number[] = [];
    if (show.brow) idx.push(...EDITABLE_BROW_INDICES);
    if (show.lip) idx.push(...EDITABLE_LIP_INDICES);
    return idx;
  }, [tool, effLandmarks, show.brow, show.lip]);

  const overlayActive = view === "edit" && (tool === "draw" || tool === "points");

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-brand-dark">
          반영구 눈썹·입술 시뮬레이터
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          내 사진에 디자인을 미리 입혀보고 AI 추천을 받거나, 직접 그려볼 수 있어요.
          사진은 기기 안에서만 처리되며 외부로 전송되지 않습니다.
        </p>
      </header>

      <div className="grid md:grid-cols-[1fr_360px] gap-5">
        {/* 좌측: 캔버스 / 비교 */}
        <div>
          <div className="bg-white rounded-xl border border-neutral-200 p-3">
            {status === "idle" && <UploadArea onFile={handleFile} />}

            {status === "detecting" && (
              <div className="aspect-[4/3] flex items-center justify-center text-neutral-400 text-sm">
                얼굴을 분석하는 중…
              </div>
            )}

            {/* 캔버스 + 오버레이 (그리기/점수정) */}
            <div
              className={
                status === "ready" && view === "edit" ? "relative" : "hidden"
              }
            >
              <canvas ref={canvasRef} className="w-full rounded-lg block touch-none" />
              {overlayActive && (
                <div
                  className="absolute inset-0"
                  style={{ cursor: tool === "draw" ? "crosshair" : "default" }}
                  onPointerDown={overlayDown}
                  onPointerMove={overlayMove}
                  onPointerUp={overlayUp}
                  onPointerLeave={overlayUp}
                >
                  {/* 점 수정 핸들 */}
                  {tool === "points" &&
                    effLandmarks &&
                    handleIndices.map((i) => {
                      const l = effLandmarks[i];
                      return (
                        <span
                          key={i}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragIdx.current = i;
                            (e.target as Element).setPointerCapture?.(e.pointerId);
                          }}
                          onPointerMove={overlayMove}
                          onPointerUp={overlayUp}
                          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-brand shadow cursor-grab active:cursor-grabbing"
                          style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
                        />
                      );
                    })}
                </div>
              )}
            </div>

            {status === "ready" && view === "compare" && (
              <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
            )}

            {status === "noface" && (
              <div className="aspect-[4/3] flex flex-col items-center justify-center text-center gap-3 px-6">
                <p className="text-sm text-neutral-600">
                  얼굴을 찾지 못했어요. 정면·무표정·밝은 조명·앞머리를 올린 사진을
                  권장합니다.
                </p>
                <div className="flex gap-2">
                  <UploadButton onFile={handleFile} label="다른 사진 선택" />
                  <button
                    onClick={enterDrawOnly}
                    className="text-sm px-4 py-2 rounded-lg border border-neutral-300"
                  >
                    이 사진에 직접 그리기
                  </button>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="aspect-[4/3] flex flex-col items-center justify-center text-center gap-3 px-6">
                <p className="text-sm text-red-500">{errorMsg}</p>
                <UploadButton onFile={handleFile} label="다시 시도" />
              </div>
            )}
          </div>

          {status === "ready" && (
            <>
              {/* 보기 / 저장 줄 */}
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => setView("edit")}
                  className={`text-sm px-3 py-1.5 rounded-lg border ${
                    view === "edit"
                      ? "bg-brand text-white border-brand"
                      : "border-neutral-300"
                  }`}
                >
                  편집
                </button>
                <button
                  onClick={enterCompare}
                  className={`text-sm px-3 py-1.5 rounded-lg border ${
                    view === "compare"
                      ? "bg-brand text-white border-brand"
                      : "border-neutral-300"
                  }`}
                >
                  Before / After
                </button>
                <button
                  onClick={handleSave}
                  className="text-sm px-3 py-1.5 rounded-lg bg-brand-dark text-white"
                >
                  시안 저장
                </button>
                <button
                  onClick={downloadCurrent}
                  className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300"
                >
                  이미지 다운로드
                </button>
                <UploadButton onFile={handleFile} label="사진 변경" subtle />
              </div>

              {/* 편집 도구 선택 */}
              {view === "edit" && (
                <div className="flex gap-2 mt-2">
                  {(
                    [
                      ["adjust", "유형·조절"],
                      ["points", "점 수정"],
                      ["draw", "직접 그리기"],
                    ] as [Tool, string][]
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => setTool(t)}
                      className={`text-xs px-3 py-1.5 rounded-full border ${
                        tool === t
                          ? "bg-brand-light/60 border-brand text-brand-dark font-medium"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {tool === "points" && Object.keys(overrides).length > 0 && (
                    <button
                      onClick={resetPoints}
                      className="text-xs px-3 py-1.5 rounded-full border border-neutral-300 text-red-500 ml-auto"
                    >
                      점 초기화
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* AI 추천 코멘트 */}
          {rec && status === "ready" && (
            <div className="mt-3 bg-brand-light/30 border border-brand-light rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-brand-dark">
                  ✨ AI 추천 (얼굴형: {faceShapeLabel(rec.metrics.shape)})
                </h3>
                <button
                  onClick={applyRecommendation}
                  className="text-xs text-brand-dark underline"
                >
                  추천값으로 되돌리기
                </button>
              </div>
              <ul className="text-xs text-neutral-600 space-y-1">
                <li>• 눈썹: {rec.browReason}</li>
                <li>• 입술: {rec.lipReason}</li>
              </ul>
              <p className="text-[11px] text-neutral-400 mt-2">
                추천은 출발점이에요. 슬라이더·점 수정·직접 그리기로 자유롭게 바꿔보세요.
              </p>
            </div>
          )}
        </div>

        {/* 우측: 도구별 패널 */}
        <div>
          {status === "ready" && view === "edit" && tool === "adjust" && (
            <ControlPanel
              brow={settings.brow}
              lip={settings.lip}
              show={show}
              onBrow={(brow) => setSettings((s) => ({ ...s, brow }))}
              onLip={(lip) => setSettings((s) => ({ ...s, lip }))}
              onShow={setShow}
            />
          )}

          {status === "ready" && view === "edit" && tool === "points" && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-4 text-sm text-neutral-600">
              <h3 className="font-semibold text-neutral-800 mb-2">점 수정</h3>
              <p className="text-xs leading-relaxed">
                사진 위의 점을 드래그해 눈썹·입술 윤곽을 직접 다듬으세요. 모양은
                자연스럽게 따라옵니다. 표시할 부위는 아래에서 켜고 끌 수 있어요.
              </p>
              <div className="flex gap-4 mt-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={show.brow}
                    onChange={(e) => setShow({ ...show, brow: e.target.checked })}
                  />
                  눈썹 점
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={show.lip}
                    onChange={(e) => setShow({ ...show, lip: e.target.checked })}
                  />
                  입술 점
                </label>
              </div>
            </div>
          )}

          {status === "ready" && view === "edit" && tool === "draw" && (
            <BrushControls
              brush={brush}
              onChange={setBrush}
              onUndo={undoStroke}
              onClear={clearStrokes}
              canUndo={freehand.length > 0}
            />
          )}

          {(status !== "ready" || view === "compare") && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-sm text-neutral-400">
              {view === "compare"
                ? "비교 모드입니다. ‘편집’으로 돌아가면 도구가 나타나요."
                : "사진을 올리면 여기에서 디자인을 조정하거나 직접 그릴 수 있어요."}
            </div>
          )}

          {/* 갤러리 */}
          <div className="mt-4">
            <button
              onClick={() => setGalleryOpen((o) => !o)}
              className="w-full text-sm text-left font-semibold text-neutral-700 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 flex justify-between items-center"
            >
              <span>내 시안 갤러리 ({saved.length})</span>
              <span>{galleryOpen ? "▲" : "▼"}</span>
            </button>
            {galleryOpen && (
              <div className="mt-3">
                <Gallery
                  items={saved}
                  onLoad={(d) => {
                    setSettings(d.settings);
                    setFreehand(d.freehand ?? []);
                    setOverrides(d.overrides ?? {});
                    if (d.show) setShow(d.show);
                    setView("edit");
                    setTool("adjust");
                  }}
                  onDelete={async (id) => {
                    await deleteDesign(id);
                    await refreshGallery();
                  }}
                  onDownload={(d) => download(d.thumbnail, d.name)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------- 업로드 UI ----------

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  return (
    <div className="aspect-[4/3] border-2 border-dashed border-brand-light rounded-lg flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="text-neutral-600 text-sm">
        정면 사진을 올려주세요
        <br />
        <span className="text-xs text-neutral-400">
          무표정 · 밝은 조명 · 앞머리 올림 권장
        </span>
      </p>
      <UploadButton onFile={onFile} label="사진 선택 / 촬영" />
    </div>
  );
}

function UploadButton({
  onFile,
  label,
  subtle,
}: {
  onFile: (f: File) => void;
  label: string;
  subtle?: boolean;
}) {
  return (
    <label
      className={`cursor-pointer text-sm px-4 py-2 rounded-lg ${
        subtle
          ? "border border-neutral-300 text-neutral-600"
          : "bg-brand text-white"
      }`}
    >
      {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
