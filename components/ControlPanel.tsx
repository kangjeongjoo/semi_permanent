"use client";

import type { BrowSettings, LipSettings } from "@/lib/types";
import {
  BROW_TEMPLATES,
  LIP_TEMPLATES,
  BROW_COLORS,
  browFromTemplate,
  lipFromTemplate,
} from "@/lib/designLibrary";
import Slider from "./Slider";

interface Props {
  brow: BrowSettings;
  lip: LipSettings;
  show: { brow: boolean; lip: boolean };
  onBrow: (b: BrowSettings) => void;
  onLip: (l: LipSettings) => void;
  onShow: (s: { brow: boolean; lip: boolean }) => void;
}

function Section({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-neutral-800">{title}</h3>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          표시
        </label>
      </div>
      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
        {children}
      </div>
    </section>
  );
}

export default function ControlPanel({
  brow,
  lip,
  show,
  onBrow,
  onLip,
  onShow,
}: Props) {
  return (
    <div>
      {/* 눈썹 */}
      <Section
        title="눈썹"
        enabled={show.brow}
        onToggle={(v) => onShow({ ...show, brow: v })}
      >
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">유형</p>
          <div className="grid grid-cols-2 gap-1.5">
            {BROW_TEMPLATES.map((t) => {
              const active = brow.technique === t.technique && brow.shape === t.shape;
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    onBrow({ ...browFromTemplate(t), color: brow.color })
                  }
                  className={`text-xs rounded-lg border px-2 py-1.5 text-left transition ${
                    active
                      ? "border-brand bg-brand-light/40 text-brand-dark font-medium"
                      : "border-neutral-200 hover:border-brand/50"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">색상</p>
          <div className="flex gap-2 flex-wrap">
            {BROW_COLORS.map((c) => (
              <button
                key={c.id}
                title={c.label}
                onClick={() => onBrow({ ...brow, color: c.hex })}
                className={`w-7 h-7 rounded-full border-2 ${
                  brow.color === c.hex ? "border-brand" : "border-white"
                } shadow`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <Slider label="굵기" value={brow.thickness} min={0.5} max={1.5} step={0.05} onChange={(v) => onBrow({ ...brow, thickness: v })} />
          <Slider label="아치 높이" value={brow.archHeight} min={0} max={1} step={0.05} onChange={(v) => onBrow({ ...brow, archHeight: v })} />
          <Slider label="꼬리 각도" value={brow.tailAngle} min={-15} max={15} step={1} format={(v) => `${v}°`} onChange={(v) => onBrow({ ...brow, tailAngle: v })} />
          <Slider label="꼬리 길이" value={brow.length} min={0.8} max={1.2} step={0.02} onChange={(v) => onBrow({ ...brow, length: v })} />
          <Slider label="앞머리 농도" value={brow.headDensity} min={0} max={1} step={0.05} onChange={(v) => onBrow({ ...brow, headDensity: v })} />
          <Slider label="진하기" value={brow.opacity} min={0.2} max={1} step={0.05} onChange={(v) => onBrow({ ...brow, opacity: v })} />
        </div>
      </Section>

      {/* 입술 */}
      <Section
        title="입술"
        enabled={show.lip}
        onToggle={(v) => onShow({ ...show, lip: v })}
      >
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">유형</p>
          <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
            {LIP_TEMPLATES.map((t) => {
              const active = lip.technique === t.technique && lip.color === t.color;
              return (
                <button
                  key={t.id}
                  onClick={() => onLip(lipFromTemplate(t))}
                  className={`flex items-center gap-2 text-xs rounded-lg border px-2 py-1.5 text-left transition ${
                    active
                      ? "border-brand bg-brand-light/40 text-brand-dark font-medium"
                      : "border-neutral-200 hover:border-brand/50"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ background: t.color }}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <Slider label="발색 강도" value={lip.intensity} min={0} max={1} step={0.05} onChange={(v) => onLip({ ...lip, intensity: v })} />
          <Slider label="채도" value={lip.saturation} min={0.5} max={1.5} step={0.05} onChange={(v) => onLip({ ...lip, saturation: v })} />
          <Slider label="명도" value={lip.lightness} min={0.7} max={1.3} step={0.05} onChange={(v) => onLip({ ...lip, lightness: v })} />
          <Slider label="안쪽 진하기(그라데이션)" value={lip.innerDepth} min={0} max={1} step={0.05} onChange={(v) => onLip({ ...lip, innerDepth: v })} />
          <Slider label="윤곽 또렷함" value={lip.crispness} min={0} max={1} step={0.05} onChange={(v) => onLip({ ...lip, crispness: v })} />
        </div>
      </Section>
    </div>
  );
}
