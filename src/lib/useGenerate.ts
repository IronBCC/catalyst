"use client";

import { useCallback, useEffect, useRef } from "react";
import { useObject } from "@ai-sdk/react";
import { LlmGraph, type GenerateInput } from "@/lib/schema";
import { draftGraph, repairGraph } from "@/lib/engine/repair";
import { useStore } from "@/store";

/**
 * Streams a graph out of /api/generate.
 *
 * Numbers on screen are never the model's: the partials only drive a draft
 * graph so the canvas has something to grow, and the final object goes through
 * `repairGraph` before it becomes state.
 */
export function useGenerate() {
  const setDraft = useStore((s) => s.setDraft);
  const setGraph = useStore((s) => s.setGraph);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);

  const input = useRef<GenerateInput | null>(null);
  const lastCount = useRef(0);

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/generate",
    schema: LlmGraph,
    onFinish({ object, error }) {
      if (error || !object || !input.current) return;
      const graph = repairGraph(object, input.current, "openrouter");
      setGraph(graph);
      setStatus({ phase: "idle", message: "" });
      pushLog({
        kind: "summary",
        text: graph.summary?.headline ?? "Graph ready",
        followUps: graph.summary?.followUps ?? [],
      });
      lastCount.current = 0;
    },
    onError(error) {
      setDraft(null);
      setStatus({ phase: "error", message: error.message });
      pushLog({
        kind: "error",
        text: `Generation failed: ${error.message}`,
        retry: () => {
          if (input.current) start(input.current);
        },
      });
      lastCount.current = 0;
    },
  });

  const start = useCallback(
    (next: GenerateInput) => {
      input.current = next;
      lastCount.current = 0;
      setDraft(null);
      setStatus({ phase: "generating", message: "mapping causes…" });
      pushLog({ kind: "user", text: next.hypothesis });
      submit(next);
    },
    [pushLog, setDraft, setStatus, submit],
  );

  // The partial object is a value, not a callback, so the draft is kept in
  // sync from an effect rather than inside the stream handler.
  useEffect(() => {
    if (!object || !input.current) return;
    const draft = draftGraph(object, input.current);
    if (!draft) return;
    if (draft.nodes.length !== lastCount.current) {
      lastCount.current = draft.nodes.length;
      setStatus({ phase: "generating", message: `mapping causes… ${draft.nodes.length} nodes` });
    }
    setDraft(draft);
  }, [object, setDraft, setStatus]);

  return { start, stop, isLoading };
}
