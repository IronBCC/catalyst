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
  /** What the two save buttons do, in the user's words. */
  applyLabel?: string;
  applyNewLabel?: string;
  /** Shown while a change is previewed and not yet saved. */
  previewing?: boolean;
  hint?: string;
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
  applyLabel = "Save",
  applyNewLabel = "Save as new world…",
  previewing = false,
  hint,
}: ParamSliderProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const visibleValue = format(clamped);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onInput(next);
  };

  return (
    <section data-testid="param-slider" className="rounded-lg border border-line bg-bg p-3 text-xs text-fg">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-muted">
          {label}
          {previewing ? <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent">previewing</span> : null}
        </span>
        <span className="num text-[15px] text-fg" aria-live="polite">
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
        className="w-full"
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!applyNewOnly ? (
          <button
            type="button"
            onClick={onApply}
            disabled={disabled}
            tabIndex={0}
            role="button"
            data-testid="apply-to-world"
            aria-label={`Apply ${label} to world`}
            className="rounded-md bg-accent px-2.5 py-1 font-medium text-white hover:brightness-95 disabled:opacity-50"
          >
            {applyLabel}
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
          className={`rounded-md px-2.5 py-1 disabled:opacity-50 ${
            applyNewOnly
              ? "bg-accent font-medium text-white hover:brightness-95"
              : "border border-line-strong text-fg hover:bg-panel"
          }`}
        >
          {applyNewLabel}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          tabIndex={0}
          role="button"
          aria-label={`Reset ${label}`}
          className="ml-auto rounded-md px-2 py-1 text-muted hover:text-fg disabled:opacity-50"
        >
          Reset
        </button>
      </div>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted">{hint}</p> : null}
    </section>
  );
}
