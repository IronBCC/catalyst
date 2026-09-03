"use client";

import { useCallback, useState } from "react";
import { atNodeLimit, looksLikeEvent, MAX_GRAPH_NODES, nodeBudget } from "@/lib/branching";
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
  const [paneChoice, setPane] = useState<"hypothesis" | "branch" | null>(null);
  const [hypothesis, setHypothesis] = useState("");
  const [mode, setMode] = useState<GenerateInput["mode"]>("explore");
  const [target, setTarget] = useState("");
  const [horizonDays, setHorizonDays] = useState(90);
  const [positionsText, setPositionsText] = useState("");
  const [branchText, setBranchText] = useState("");
  const [busy, setBusy] = useState(false);

  const log = useStore((s) => s.log);
  const status = useStore((s) => s.status);
  const selection = useStore((s) => s.selection);
  const positions = useStore((s) => s.positions);
  const setPositions = useStore((s) => s.setPositions);
  const setGraph = useStore((s) => s.setGraph);
  const branchWorld = useStore((s) => s.branchWorld);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);
  const setTab = useStore((s) => s.setTab);
  const select = useStore((s) => s.select);
  const importWorkspace = useStore((s) => s.importWorkspace);
  const reset = useStore((s) => s.reset);

  // The applied graph, not the raw one: a second branch has to see the nodes the
  // first one added, or it cannot attach to them.
  const { graph, computed } = useComputed();
  const { start, isLoading } = useGenerate();

  // Once a graph exists the useful next move is asking what else it touches, so
  // the rail lands on the branch pane. Derived rather than stored, so it follows
  // the graph without an effect and still yields to an explicit click.
  const pane = graph ? (paneChoice ?? "branch") : "hypothesis";

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

  // The graph carries the request that produced it, so regenerating never
  // depends on whatever is left in the form — it re-asks the same question,
  // which is the point when the answer came back wrong.
  const regenerate = useCallback(() => {
    if (!graph || isLoading) return;
    if (!window.confirm("Regenerate this hypothesis? The current graph and all its worlds are replaced.")) return;
    start({
      hypothesis: graph.hypothesis,
      mode: graph.mode,
      target: graph.target,
      horizonDays: graph.horizonDays,
      positions,
    });
  }, [graph, isLoading, positions, start]);

  const loadExample = useCallback(
    async (slug: string) => {
      if (graph && !window.confirm("Replace the current graph and all its worlds?")) return;
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
    [graph, pushLog, setGraph, setStatus],
  );

  // Named function expression: the retry button on a failed entry calls the
  // same function it lives inside.
  const submitBranch = useCallback(
    async function run(text: string) {
      if (!graph || !computed || !text.trim()) return;
      if (atNodeLimit(graph)) {
        pushLog({
          kind: "error",
          text: `This world already has ${MAX_GRAPH_NODES} nodes. Switch to a smaller world before branching again.`,
        });
        return;
      }
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
        // "What if X" means assume X, so the new event is pinned true. Adding it
        // at its own base rate leaves the map almost unchanged, which reads as
        // the branch having done nothing.
        branchWorld(
          [
            { type: "addNode", node: candidate.node, edges: candidate.edges },
            ...(candidate.node.kind === "event"
              ? [{ type: "pin" as const, nodeId: candidate.node.id, value: true }]
              : []),
          ],
          text.trim(),
        );
        select({ type: "node", id: candidate.node.id });
        setTab("map");
        pushLog({
          kind: "world",
          text: `Branch: ${text.trim()} — assumed true, ${candidate.edges.length} link${candidate.edges.length === 1 ? "" : "s"} into the graph`,
        });
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
    [branchWorld, computed, graph, pushLog, select, selection, setStatus, setTab],
  );

  const exportWorkspace = useCallback(() => {
    const s = useStore.getState();
    const payload: Workspace = {
      version: 1,
      graph: s.graph,
      worlds: s.worlds,
      activeWorldId: s.activeWorldId,
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

  const primary =
    "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-[0_1px_0_rgba(0,0,0,0.08)] hover:brightness-95 disabled:opacity-50";
  const field = "w-full rounded-md px-2.5 py-1.5 text-[13px]";

  return (
    <aside
      data-testid="rail"
      className="flex h-full w-full flex-col overflow-hidden border-r border-line bg-panel text-xs"
      aria-label="Hypothesis and history"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="p-3 pb-0">
        <div className="flex rounded-md border border-line bg-bg p-0.5" role="tablist" aria-label="Rail mode">
          {(["hypothesis", "branch"] as const).map((p) => {
            // A what-if branches from an existing map, so the tab has nothing to
            // show until one exists. `pane` above already forces "hypothesis" in
            // that case; without this the tab still looked live and swallowed the
            // click.
            const locked = p === "branch" && !graph;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                data-testid={`rail-pane-${p}`}
                aria-selected={pane === p}
                disabled={locked}
                title={locked ? "Build a causal map first — what-ifs branch from it" : undefined}
                onClick={() => setPane(p)}
                className={`flex-1 rounded-[5px] px-2 py-1 transition-colors ${
                  pane === p ? "bg-panel text-fg shadow-[0_1px_2px_rgba(20,20,19,0.08)]" : "text-muted hover:text-fg"
                } ${locked ? "cursor-not-allowed opacity-40 hover:text-muted" : ""}`}
              >
                {p === "branch" ? "What if" : "Hypothesis"}
              </button>
            );
          })}
        </div>
      </div>

      {pane === "hypothesis" ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Try</span>
            {EXAMPLES.map((e) => (
              <button
                key={e.slug}
                type="button"
                data-testid={`example-${e.slug}`}
                onClick={() => void loadExample(e.slug)}
                className="rounded-full border border-line-strong px-2.5 py-0.5 text-muted hover:border-accent hover:text-accent"
              >
                {e.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-muted" id="hypothesis-label">
              Hypothesis
            </span>
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
              className={`${field} font-serif text-[15px] leading-snug`}
            />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-muted">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as GenerateInput["mode"])}
                className={field}
              >
                <option value="explore">explore</option>
                <option value="chain">chain</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-muted">
              Horizon
              <select
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
                className={field}
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h} days
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mode === "chain" ? (
            <label className="flex flex-col gap-1 text-muted">
              Target
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Brent settles above $100"
                className={field}
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-muted">
            Positions
            <input
              data-testid="positions-input"
              value={positionsText || formatPositions(positions)}
              onChange={(e) => {
                setPositionsText(e.target.value);
                setPositions(parsePositions(e.target.value));
              }}
              placeholder="long USO 2 stop 8 target 15"
              className={`${field} num`}
            />
          </label>

          <button
            type="button"
            data-testid="generate"
            onClick={submitHypothesis}
            disabled={isLoading}
            className={primary}
          >
            {isLoading ? "Generating…" : graph ? "Start a new hypothesis" : "Build the causal map"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-muted">What if…</span>
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
              className={`${field} font-serif text-[15px] leading-snug`}
            />
          </label>
          <button
            type="button"
            data-testid="branch"
            disabled={busy || !graph || atNodeLimit(graph)}
            onClick={() => void submitBranch(branchText)}
            className={primary}
          >
            {busy ? "Exploring…" : "Explore as a new world"}
          </button>
          <p className="text-muted">
            {atNodeLimit(graph)
              ? `This world is full at ${MAX_GRAPH_NODES} nodes.`
              : `Adds the event, assumes it happens, and opens the result as a new world forked from the current one. The original stays one click away in the world switcher. Room for ${nodeBudget(graph)} more nodes.`}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 border-t border-line p-3">
        {status.phase !== "idle" && status.message ? (
          <p className="flex items-center gap-2 text-muted" role="status">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            {status.message}
          </p>
        ) : null}
        {log.map((entry) => (
          <div key={entry.id} data-testid="log-entry">
            {entry.kind === "summary" ? (
              <blockquote
                data-testid="log-summary"
                className="border-l-2 border-accent pl-3 font-serif text-[15px] leading-snug text-fg"
              >
                {entry.text}
              </blockquote>
            ) : (
              <p
                data-testid={entry.kind === "error" ? "log-error" : "log-text"}
                className={
                  entry.kind === "error"
                    ? "text-red"
                    : entry.kind === "world"
                      ? "rounded-md border-l-2 border-accent bg-accent-soft/50 px-2.5 py-1.5 text-fg"
                      : "text-muted"
                }
              >
                {entry.text}
              </p>
            )}
            {entry.followUps?.length ? (
              <div className="mt-2 flex flex-col gap-1">
                {entry.followUps.filter(looksLikeEvent).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setPane("branch");
                      setBranchText(f);
                      setTab("map");
                    }}
                    className="rounded-md border border-line bg-bg px-2.5 py-1.5 text-left text-fg hover:border-accent"
                    title="Explore this as a what-if"
                  >
                    <span className="text-accent">What if</span> {f}
                  </button>
                ))}
                {entry.followUps.some((f) => !looksLikeEvent(f)) ? (
                  // Research actions are not counterfactuals; offering them as
                  // one-click what-ifs would pin an instruction as an event.
                  <details className="group text-muted">
                    <summary className="cursor-pointer list-none hover:text-fg">
                      <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                      {entry.followUps.filter((f) => !looksLikeEvent(f)).length} things to watch
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {entry.followUps.filter((f) => !looksLikeEvent(f)).map((f) => (
                        <li key={f} className="flex gap-2 px-1">
                          <span aria-hidden="true" className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-faint" />
                          <span>{f.replace(/^watch\s+/i, "")}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
            {entry.retry ? (
              <button
                type="button"
                onClick={entry.retry}
                className="mt-1.5 rounded-md border border-line-strong px-2 py-0.5 text-muted hover:text-fg"
              >
                Retry
              </button>
            ) : null}
          </div>
        ))}
      </div>
      </div>

      <div className="flex shrink-0 gap-1 border-t border-line px-2 py-1.5 text-[11px]">
        <button
          type="button"
          data-testid="export"
          onClick={exportWorkspace}
          className="rounded-md px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg"
        >
          Export
        </button>
        <label className="cursor-pointer rounded-md px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg">
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
        {graph ? (
          <button
            type="button"
            data-testid="regenerate"
            onClick={regenerate}
            disabled={isLoading}
            title={`Re-ask: ${graph.hypothesis}`}
            className="rounded-md px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg disabled:opacity-50"
          >
            {isLoading ? "Regenerating…" : "Regenerate"}
          </button>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          data-testid="clear"
          onClick={clearWorkspace}
          className="rounded-md px-2 py-1 text-muted hover:bg-red-soft hover:text-red"
        >
          Clear
        </button>
      </div>
    </aside>
  );
}
