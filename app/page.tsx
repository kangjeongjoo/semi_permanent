"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Landmark } from "@/lib/faceLandmarker";
import type { DesignSettings, SavedDesign } from "@/lib/types";
import { DEFAULT_BROW, DEFAULT_LIP } from "@/lib/designLibrary";
import { drawComposite } from "@/lib/compositor";
import { recommend, faceShapeLabel, type Recommendation } from "@/lib/recommend";
import { saveDesign, listDesigns, deleteDesign } from "@/lib/storage";
import ControlPanel from "@/components/ControlPanel";
import CompareSlider from "@/components/CompareSlider";
import Gallery from "@/components/Gallery";

type Status = "idle" | "detecting" | "ready" | "noface" | "error";

const MAX_DIM = 820;

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

  const [mode, setMode] = useState<"edit" | "compare">("edit");
  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");

  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);

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

  // 현재 설정으로 합성 다시 그리기
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    drawComposite(canvas, img, landmarks, settings, show);
  }, [landmarks, settings, show]);

  useEffect(() => {
    if (status === "ready") render();
  }, [render, status]);

  const handleFile = async (file: File) => {
    setStatus("detecting");
    setErrorMsg("");
    setRec(null);
    setMode("edit");

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

      // 원본만 그려서 before 이미지 확보
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      setBeforeUrl(canvas.toDataURL("image/jpeg", 0.92));

      try {
        const { detectFace } = await import("@/lib/faceLandmarker");
        const lm = await detectFace(img);
        if (!lm) {
          setLandmarks(null);
          setStatus("noface");
          return;
        }
        setLandmarks(lm);
        // AI 추천 적용
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

  const enterCompare = () => {
    render();
    const canvas = canvasRef.current;
    if (canvas) setAfterUrl(canvas.toDataURL("image/jpeg", 0.92));
    setMode("compare");
  };

  const applyRecommendation = () => {
    if (rec) {
      setSettings({ brow: rec.brow, lip: rec.lip });
      setShow({ brow: true, lip: true });
    }
  };

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

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-brand-dark">
          반영구 눈썹·입술 시뮬레이터
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          내 사진에 디자인을 미리 입혀보고 AI 추천을 받아보세요. 사진은 기기 안에서만
          처리되며 외부로 전송되지 않습니다.
        </p>
      </header>

      <div className="grid md:grid-cols-[1fr_360px] gap-5">
        {/* 좌측: 캔버스 / 비교 */}
        <div>
          <div className="bg-white rounded-xl border border-neutral-200 p-3">
            {status === "idle" && (
              <UploadArea onFile={handleFile} />
            )}

            {status === "detecting" && (
              <div className="aspect-[4/3] flex items-center justify-center text-neutral-400 text-sm">
                얼굴을 분석하는 중…
              </div>
            )}

            {/* 캔버스는 항상 마운트(렌더 타깃) - idle/detecting 때는 숨김 */}
            <div className={status === "ready" && mode === "edit" ? "" : "hidden"}>
              <canvas ref={canvasRef} className="w-full rounded-lg" />
            </div>

            {status === "ready" && mode === "compare" && (
              <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
            )}

            {status === "noface" && (
              <div className="aspect-[4/3] flex flex-col items-center justify-center text-center gap-3 px-6">
                <p className="text-sm text-neutral-600">
                  얼굴을 찾지 못했어요. 정면·무표정·밝은 조명·앞머리를 올린 사진을
                  권장합니다.
                </p>
                <UploadButton onFile={handleFile} label="다른 사진 선택" />
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
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setMode("edit")}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  mode === "edit"
                    ? "bg-brand text-white border-brand"
                    : "border-neutral-300"
                }`}
              >
                편집
              </button>
              <button
                onClick={enterCompare}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  mode === "compare"
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
                추천은 출발점이에요. 아래에서 자유롭게 바꿔보세요.
              </p>
            </div>
          )}
        </div>

        {/* 우측: 컨트롤 패널 */}
        <div>
          {status === "ready" ? (
            <ControlPanel
              brow={settings.brow}
              lip={settings.lip}
              show={show}
              onBrow={(brow) => setSettings((s) => ({ ...s, brow }))}
              onLip={(lip) => setSettings((s) => ({ ...s, lip }))}
              onShow={setShow}
            />
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-sm text-neutral-400">
              사진을 올리면 여기에서 눈썹·입술 디자인을 조정할 수 있어요.
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
                    setMode("edit");
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
        capture="user"
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
