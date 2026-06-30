"use client";

import type { SavedDesign } from "@/lib/types";

interface Props {
  items: SavedDesign[];
  onLoad: (d: SavedDesign) => void;
  onDelete: (id: string) => void;
  onDownload: (d: SavedDesign) => void;
}

export default function Gallery({ items, onLoad, onDelete, onDownload }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-400 text-center py-6">
        저장한 시안이 없습니다. 마음에 드는 디자인을 저장해 보세요.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((d) => (
        <div
          key={d.id}
          className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
          <img
            src={d.thumbnail}
            alt={d.name}
            className="w-full aspect-square object-cover cursor-pointer"
            onClick={() => onLoad(d)}
          />
          <div className="p-2">
            <p className="text-xs font-medium truncate">{d.name}</p>
            <p className="text-[10px] text-neutral-400 mb-1.5">
              {new Date(d.createdAt).toLocaleString("ko-KR")}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => onLoad(d)}
                className="flex-1 text-[11px] bg-brand-light/50 text-brand-dark rounded py-1"
              >
                불러오기
              </button>
              <button
                onClick={() => onDownload(d)}
                className="text-[11px] border border-neutral-200 rounded px-2 py-1"
              >
                ↓
              </button>
              <button
                onClick={() => onDelete(d.id)}
                className="text-[11px] border border-neutral-200 rounded px-2 py-1 text-red-500"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
