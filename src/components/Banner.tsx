"use client";

interface BannerProps {
  message: string;
  tone: "warn" | "error";
  onDismiss?: () => void;
}

export default function Banner({ message, tone, onDismiss }: BannerProps) {
  const surface = tone === "error" ? "bg-red-soft text-red" : "bg-orange-soft text-orange";
  return (
    <div
      data-testid="banner"
      role="status"
      className={`flex items-center gap-3 border-b border-line px-4 py-1.5 text-xs ${surface}`}
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      <span className="flex-1 text-fg">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2 py-0.5 text-muted hover:bg-panel hover:text-fg"
          aria-label="Dismiss message"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
