"use client";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export default function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: Props) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs text-neutral-500 mb-1">
        <span>{label}</span>
        <span>{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
