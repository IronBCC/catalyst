"use client";

interface BannerProps {
  message: string;
  tone: "warn" | "error";
  onDismiss?: () => void;
}

export default function Banner({ message, tone, onDismiss }: BannerProps) {
  const border = tone === "error" ? "border-red" : "border-orange";
  const text = tone === "error" ? "text-red" : "text-orange";
  return (
    <div
      data-testid="banner"
      role="status"
      className={`flex items-center gap-3 border-b ${border} bg-panel px-3 py-1.5 text-xs ${text}`}
    >
      <span aria-hidden="true">{tone === "error" ? "!" : "~"}</span>
      <span className="flex-1">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
          aria-label="Dismiss message"
        >
          dismiss
        </button>
      ) : null}
    </div>
  );
}
