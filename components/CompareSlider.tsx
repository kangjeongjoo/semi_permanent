"use client";

import { useRef, useState } from "react";

interface Props {
  beforeUrl: string;
  afterUrl: string;
}

// Before(원본) / After(합성) 좌우 비교 슬라이더
export default function CompareSlider({ beforeUrl, afterUrl }: Props) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  };

  return (
    <div
      ref={ref}
      className="relative w-full select-none touch-none rounded-xl overflow-hidden cursor-ew-resize"
      onMouseDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      {/* After (합성) - 전체 배경 */}
      <img src={afterUrl} alt="합성" className="block w-full" draggable={false} />
      {/* Before (원본) - 왼쪽만 보이게 클립 */}
      <img
        src={beforeUrl}
        alt="원본"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      {/* 핸들 */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-brand text-xs">
          ↔
        </div>
      </div>
      <span className="absolute top-2 left-2 text-[11px] bg-black/50 text-white px-2 py-0.5 rounded">
        원본
      </span>
      <span className="absolute top-2 right-2 text-[11px] bg-brand/80 text-white px-2 py-0.5 rounded">
        합성
      </span>
    </div>
  );
}
