"use client";

import Slider from "./Slider";
import { BROW_COLORS, LIP_COLOR_FAMILIES } from "@/lib/designLibrary";

export interface BrushState {
  tool: "draw" | "erase";
  color: string;
  size: number; // 0~1 (캔버스 너비 비율)
  opacity: number;
}

interface Props {
  brush: BrushState;
  onChange: (b: BrushState) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
}

const PALETTE = [
  ...BROW_COLORS.map((c) => c.hex),
  ...LIP_COLOR_FAMILIES.map((c) => c.hex),
];

export default function BrushControls({
  brush,
  onChange,
  onUndo,
  onClear,
  canUndo,
}: Props) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 p-4 mb-4">
      <h3 className="font-semibold text-neutral-800 mb-3">직접 그리기</h3>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onChange({ ...brush, tool: "draw" })}
          className={`flex-1 text-sm rounded-lg py-1.5 border ${
            brush.tool === "draw"
              ? "bg-brand text-white border-brand"
              : "border-neutral-300"
          }`}
        >
          ✏️ 펜
        </button>
        <button
          onClick={() => onChange({ ...brush, tool: "erase" })}
          className={`flex-1 text-sm rounded-lg py-1.5 border ${
            brush.tool === "erase"
              ? "bg-brand text-white border-brand"
              : "border-neutral-300"
          }`}
        >
          🧽 지우개
        </button>
      </div>

      <div className="mb-3">
        <p className="text-xs text-neutral-500 mb-1.5">색상</p>
        <div className="flex gap-2 flex-wrap">
          {PALETTE.map((hex) => (
            <button
              key={hex}
              onClick={() => onChange({ ...brush, color: hex, tool: "draw" })}
              className={`w-6 h-6 rounded-full border-2 ${
                brush.color === hex && brush.tool === "draw"
                  ? "border-brand"
                  : "border-white"
              } shadow`}
              style={{ background: hex }}
            />
          ))}
          <input
            type="color"
            value={brush.color}
            onChange={(e) =>
              onChange({ ...brush, color: e.target.value, tool: "draw" })
            }
            className="w-6 h-6 rounded-full overflow-hidden border border-neutral-300 p-0 cursor-pointer"
            title="직접 색 선택"
          />
        </div>
      </div>

      <div className="space-y-2.5 mb-3">
        <Slider
          label="브러시 크기"
          value={brush.size}
          min={0.004}
          max={0.06}
          step={0.002}
          format={(v) => `${Math.round(v * 1000)}`}
          onChange={(v) => onChange({ ...brush, size: v })}
        />
        <Slider
          label="불투명도"
          value={brush.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ ...brush, opacity: v })}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 text-sm rounded-lg py-1.5 border border-neutral-300 disabled:opacity-40"
        >
          ↶ 되돌리기
        </button>
        <button
          onClick={onClear}
          className="flex-1 text-sm rounded-lg py-1.5 border border-neutral-300 text-red-500"
        >
          전체 지우기
        </button>
      </div>

      <p className="text-[11px] text-neutral-400 mt-3">
        사진 위에 직접 칠해보세요. 얼굴이 인식되지 않아도 그릴 수 있어요.
      </p>
    </section>
  );
}
