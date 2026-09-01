"use client";

import { ChangeEvent } from "react";

export interface ParamSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onInput(v: number): void;
  onApply(): void;
  onApplyNew(): void;
  onReset(): void;
  disabled?: boolean;
  applyNewOnly?: boolean;
}

export function ParamSlider({
  label,
  min,
  max,
  step,
  value,
  format,
  onInput,
  onApply,
  onApplyNew,
  onReset,
  disabled = false,
  applyNewOnly = false,
}: ParamSliderProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const visibleValue = format(clamped);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onInput(next);
  };

  return (
    <section data-testid="param-slider" className="rounded border border-line bg-panel p-2 text-sm text-fg">
      <div className="mb-2 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-muted" aria-live="polite">
          {visibleValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={handleInput}
        disabled={disabled}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuetext={visibleValue}
        aria-disabled={disabled}
        className="w-full accent-blue"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {!applyNewOnly ? (
          <button
            type="button"
            onClick={onApply}
            disabled={disabled}
            tabIndex={0}
            role="button"
            data-testid="apply-to-world"
            aria-label={`Apply ${label} to world`}
            className="rounded border border-line bg-bg px-2 py-1 text-xs text-fg disabled:opacity-50"
          >
            Apply to world
          </button>
        ) : null}
        <button
          type="button"
          onClick={onApplyNew}
          disabled={disabled}
          tabIndex={0}
          role="button"
          data-testid="apply-here"
          aria-label={`Apply ${label} as new world`}
          className="rounded border border-green bg-bg px-2 py-1 text-xs text-fg disabled:opacity-50"
        >
          Apply as new world
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          tabIndex={0}
          role="button"
          aria-label={`Reset ${label}`}
          className="rounded border border-line bg-bg px-2 py-1 text-xs text-fg disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
