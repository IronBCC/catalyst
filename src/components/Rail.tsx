"use client";

import { useCallback, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import { formatPositions, parsePositions } from "@/lib/positions";
import { compactGraph } from "@/lib/prompts";
import {
  GraphSchema,
  WorkspaceSchema,
  type GenerateInput,
  type Workspace,
} from "@/lib/schema";
import { useComputed, useStore } from "@/store";
import { useGenerate } from "@/lib/useGenerate";

const HORIZONS = [30, 90, 180, 365];

export default function Rail() {
  const [pane, setPane] = useState<"hypothesis" | "branch">("hypothesis");
  const [hypothesis, setHypothesis] = useState("");
  const [mode, setMode] = useState<GenerateInput["mode"]>("explore");
  const [target, setTarget] = useState("");
  const [horizonDays, setHorizonDays] = useState(90);
  const [positionsText, setPositionsText] = useState("");
  const [branchText, setBranchText] = useState("");
  const [busy, setBusy] = useState(false);

  const graph = useStore((s) => s.graph);
  const log = useStore((s) => s.log);
  const status = useStore((s) => s.status);
  const selection = useStore((s) => s.selection);
  const positions = useStore((s) => s.positions);
  const setPositions = useStore((s) => s.setPositions);
  const setGraph = useStore((s) => s.setGraph);
  const mutate = useStore((s) => s.mutate);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);
  const setTab = useStore((s) => s.setTab);
  const importWorkspace = useStore((s) => s.importWorkspace);
  const reset = useStore((s) => s.reset);

  const { computed } = useComputed();
  const { start, isLoading } = useGenerate();

  const input = useCallback(
    (): GenerateInput => ({
      hypothesis: hypothesis.trim(),
      mode,
      target: mode === "chain" && target.trim() ? target.trim() : null,
      horizonDays,
      positions,
    }),
    [hypothesis, mode, target, horizonDays, positions],
  );

  const submitHypothesis = useCallback(() => {
    const next = input();
    if (next.hypothesis.length < 5) return;
    if (graph && !window.confirm("Replace the current graph and all its worlds?")) return;
    start(next);
  }, [graph, input, start]);

  const loadExample = useCallback(
    async (slug: string) => {
      setStatus({ phase: "generating", message: `loading ${slug}…` });
      try {
        const res = await fetch(`/fixtures/${slug}.json`);
        if (!res.ok) throw new Error(`fixture ${slug} unavailable`);
        const fixture = await res.json();
        setGraph(GraphSchema.parse(fixture.graph), {
          markets: fixture.markets ?? {},
          quotes: fixture.quotes ?? {},
        });
        setStatus({ phase: "idle", message: "" });
        pushLog({
          kind: "summary",
          text: fixture.graph?.summary?.headline ?? slug,
          followUps: fixture.graph?.summary?.followUps ?? [],
        });
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message });
        pushLog({ kind: "error", text: `Could not load the ${slug} example.` });
      }
    },
    [pushLog, setGraph, setStatus],
  );

  // Named function expression: the retry button on a failed entry calls the
  // same function it lives inside.
  const submitBranch = useCallback(
    async function run(text: string) {
      if (!graph || !computed || !text.trim()) return;
      setBusy(true);
      setStatus({ phase: "branching", message: "exploring a branch…" });
      try {
        const res = await fetch("/api/branch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            graph,
            compact: compactGraph(graph, computed),
            text: text.trim(),
            attachTo: selection?.type === "node" ? selection.id : null,
            count: 1,
            blackSwan: false,
          }),
        });
        if (!res.ok) throw new Error(`branch failed (${res.status})`);
        const body = await res.json();
        const candidate = body?.candidates?.[0];
        if (!candidate) throw new Error("no candidate returned");
        mutate({ type: "addNode", node: candidate.node, edges: candidate.edges }, text.trim());
        pushLog({ kind: "world", text: `Branch: ${text.trim()}` });
        setStatus({ phase: "idle", message: "" });
        setBranchText("");
      } catch (e) {
        // A failed branch leaves the graph and every world exactly as they were.
        setStatus({ phase: "error", message: (e as Error).message });
        pushLog({
          kind: "error",
          text: `Branch failed: ${(e as Error).message}`,
          retry: () => void run(text),
        });
      } finally {
        setBusy(false);
      }
    },
    [computed, graph, mutate, pushLog, selection, setStatus],
  );

  const exportWorkspace = useCallback(() => {
    const s = useStore.getState();
    const payload: Workspace = {
      version: 1,
      graph: s.graph,
      worlds: s.worlds,
      activeWorldId: s.activeWorldId,
      compareWorldId: s.compareWorldId,
      positions: s.positions,
      thesis: s.thesis,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalyst-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      try {
        const parsed = WorkspaceSchema.parse(JSON.parse(await file.text()));
        if (!window.confirm("Replace the current workspace with the imported one?")) return;
        importWorkspace(parsed);
      } catch {
        pushLog({ kind: "error", text: "That file is not a Catalyst workspace." });
      }
    },
    [importWorkspace, pushLog],
  );

  const clearWorkspace = useCallback(() => {
    if (!window.confirm("Clear the workspace? This cannot be undone.")) return;
    reset();
    try {
      localStorage.removeItem("catalyst.workspace");
    } catch {
      /* private mode */
    }
  }, [reset]);

  return (
    <aside
      data-testid="rail"
      className="flex h-full w-full flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-3 text-xs"
      aria-label="Hypothesis and history"
    >
      <div className="flex gap-1" role="tablist" aria-label="Rail mode">
        {(["hypothesis", "branch"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            data-testid={`rail-pane-${p}`}
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={`flex-1 rounded border px-2 py-1 ${
              pane === p ? "border-gold text-gold" : "border-line text-muted"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {pane === "hypothesis" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {EXAMPLES.map((e) => (
              <button
                key={e.slug}
                type="button"
                data-testid={`example-${e.slug}`}
                onClick={() => void loadExample(e.slug)}
                className="rounded-full border border-line px-2 py-0.5 text-muted hover:border-gold hover:text-gold"
              >
                {e.label}
              </button>
            ))}
          </div>

          <label className="text-muted" htmlFor="hypothesis">
            Hypothesis
          </label>
          <textarea
            id="hypothesis"
            data-testid="hypothesis-input"
            rows={3}
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitHypothesis();
              }
            }}
            placeholder="The Strait of Hormuz closes to commercial tanker traffic"
            className="rounded border border-line bg-bg p-2 text-fg"
          />

          <div className="flex gap-2">
            <label className="flex-1 text-muted">
              mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as GenerateInput["mode"])}
                className="mt-1 w-full rounded border border-line bg-bg p-1 text-fg"
              >
                <option value="explore">explore</option>
                <option value="chain">chain</option>
              </select>
            </label>
            <label className="flex-1 text-muted">
              horizon
              <select
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
                className="mt-1 w-full rounded border border-line bg-bg p-1 text-fg"
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}d
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mode === "chain" ? (
            <label className="text-muted">
              target
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Brent settles above $100"
                className="mt-1 w-full rounded border border-line bg-bg p-1 text-fg"
              />
            </label>
          ) : null}

          <label className="text-muted">
            positions
            <input
              data-testid="positions-input"
              value={positionsText || formatPositions(positions)}
              onChange={(e) => {
                setPositionsText(e.target.value);
                setPositions(parsePositions(e.target.value));
              }}
              placeholder="long USO 2 stop 8 target 15"
              className="mt-1 w-full rounded border border-line bg-bg p-1 text-fg"
            />
          </label>

          <button
            type="button"
            data-testid="generate"
            onClick={submitHypothesis}
            disabled={isLoading}
            className="rounded border border-gold px-2 py-1 text-gold disabled:opacity-50"
          >
            {isLoading ? "generating…" : graph ? "New hypothesis" : "Generate"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-muted" htmlFor="branch">
            What if…
          </label>
          <textarea
            id="branch"
            data-testid="branch-input"
            rows={2}
            value={branchText}
            onChange={(e) => setBranchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitBranch(branchText);
              }
            }}
            placeholder="Iran is struck the next day"
            className="rounded border border-line bg-bg p-2 text-fg"
          />
          <button
            type="button"
            data-testid="branch"
            disabled={busy || !graph}
            onClick={() => void submitBranch(branchText)}
            className="rounded border border-blue px-2 py-1 text-blue disabled:opacity-50"
          >
            {busy ? "branching…" : "Branch"}
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 border-t border-line pt-2">
        {status.phase !== "idle" && status.message ? (
          <p className="text-muted" role="status">
            {status.message}
          </p>
        ) : null}
        {log.map((entry) => (
          <div
            key={entry.id}
            data-testid="log-entry"
            className={
              entry.kind === "error"
                ? "text-red"
                : entry.kind === "summary"
                  ? "text-fg"
                  : "text-muted"
            }
          >
            <p
              data-testid={
                entry.kind === "summary"
                  ? "log-summary"
                  : entry.kind === "error"
                    ? "log-error"
                    : "log-text"
              }
            >
              {entry.text}
            </p>
            {entry.followUps?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.followUps.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setPane("branch");
                      setBranchText(f);
                      setTab("map");
                    }}
                    className="rounded-full border border-line px-2 py-0.5 text-muted hover:border-blue hover:text-blue"
                  >
                    Branch: {f}
                  </button>
                ))}
              </div>
            ) : null}
            {entry.retry ? (
              <button
                type="button"
                onClick={entry.retry}
                className="mt-1 rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
              >
                Retry
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-t border-line pt-2">
        <button
          type="button"
          data-testid="export"
          onClick={exportWorkspace}
          className="flex-1 rounded border border-line px-2 py-1 text-muted hover:text-fg"
        >
          Export
        </button>
        <label className="flex-1 cursor-pointer rounded border border-line px-2 py-1 text-center text-muted hover:text-fg">
          Import
          <input
            data-testid="import"
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </label>
        <button
          type="button"
          data-testid="clear"
          onClick={clearWorkspace}
          className="flex-1 rounded border border-line px-2 py-1 text-muted hover:text-red"
        >
          Clear
        </button>
      </div>
    </aside>
  );
}
