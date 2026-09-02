"use client";

import { useCallback, useMemo, useState } from "react";
import { AuditBlock } from "@/components/AuditBlock";
import { atNodeLimit, MAX_GRAPH_NODES } from "@/lib/branching";
import MarketSays from "@/components/MarketSays";
import { ParamSlider } from "@/components/ParamSlider";
import { compactGraph } from "@/lib/prompts";
import { BASELINE_ID } from "@/lib/engine/worlds";
import { isEvent, type Edge, type Node } from "@/lib/schema";
import { useComputed, useStore } from "@/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

// A world is named after the what-if that made it, which is a whole sentence.
// Chrome that has to sit on one line gets the short form.
const short = (name: string, max = 24) =>
  name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function Inspector({ onClose }: { onClose?: () => void } = {}) {
  const selection = useStore((s) => s.selection);
  const transient = useStore((s) => s.transient);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const setTransient = useStore((s) => s.setTransient);
  const commitTransient = useStore((s) => s.commitTransient);
  const mutate = useStore((s) => s.mutate);
  const branchWorld = useStore((s) => s.branchWorld);
  const removeEditsFor = useStore((s) => s.removeEditsFor);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);
  const select = useStore((s) => s.select);
  const [branchText, setBranchText] = useState("");
  // Bound to a node id: a correction written for one node must not be waiting
  // in the box when a different node is selected.
  const [correction, setCorrection] = useState<{ nodeId: string; text: string } | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const { graph, computed, compare, world, diff } = useComputed();
  const onBaseline = activeWorldId === BASELINE_ID;
  const worldName = world?.name ?? "this world";

  const node: Node | null = useMemo(
    () =>
      selection?.type === "node" ? (graph?.nodes.find((n) => n.id === selection.id) ?? null) : null,
    [graph, selection],
  );
  const edge: Edge | null = useMemo(
    () =>
      selection?.type === "edge" ? (graph?.edges.find((e) => e.id === selection.id) ?? null) : null,
    [graph, selection],
  );

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of graph?.nodes ?? []) map[n.id] = isEvent(n) ? n.statement : n.name;
    return map;
  }, [graph]);

  // Saving into Baseline forks, so the fork gets the change as its name rather
  // than the placeholder "World".
  const apply = useCallback((label: string) => commitTransient(false, label), [commitTransient]);
  const applyNew = useCallback(
    (label: string) => {
      const name = window.prompt("Name this world", label);
      if (name) commitTransient(true, name);
    },
    [commitTransient],
  );

  const branchHere = useCallback(
    async (nodeId: string) => {
      if (!graph || !computed || !branchText.trim()) return;
      if (atNodeLimit(graph)) {
        pushLog({
          kind: "error",
          text: `This world already has ${MAX_GRAPH_NODES} nodes. Switch to a smaller world before branching again.`,
        });
        return;
      }
      setStatus({ phase: "branching", message: "exploring a branch…" });
      try {
        const res = await fetch("/api/branch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            graph,
            compact: compactGraph(graph, computed),
            text: branchText.trim(),
            attachTo: nodeId,
            count: 1,
            blackSwan: false,
          }),
        });
        if (!res.ok) throw new Error(`branch failed (${res.status})`);
        const body = await res.json();
        const candidate = body?.candidates?.[0];
        if (!candidate) throw new Error("no candidate returned");
        // Same as the rail: assert the event, and give it its own world.
        branchWorld(
          [
            { type: "addNode", node: candidate.node, edges: candidate.edges },
            ...(candidate.node.kind === "event"
              ? [{ type: "pin" as const, nodeId: candidate.node.id, value: true }]
              : []),
          ],
          branchText.trim(),
        );
        pushLog({
          kind: "world",
          text: `Branch: ${branchText.trim()} — assumed true, ${candidate.edges.length} link${candidate.edges.length === 1 ? "" : "s"} into the graph`,
        });
        setStatus({ phase: "idle", message: "" });
        setBranchText("");
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message });
        pushLog({ kind: "error", text: `Branch failed: ${(e as Error).message}` });
      }
    },
    [branchText, branchWorld, computed, graph, pushLog, setStatus],
  );

  // A correction is the user telling the model it got this node wrong. It
  // rewrites the node and every edge touching it, as an edit in the current
  // world, so Baseline still holds the model's own answer.
  const correctNode = useCallback(
    async (nodeId: string) => {
      const text = correction?.nodeId === nodeId ? correction.text.trim() : "";
      if (!graph || !computed || text.length < 3) return;
      setCorrecting(true);
      setStatus({ phase: "branching", message: "applying the correction…" });
      try {
        const res = await fetch("/api/correct", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            graph,
            compact: compactGraph(graph, computed),
            nodeId,
            text,
          }),
        });
        if (!res.ok) throw new Error(`correction failed (${res.status})`);
        const body = await res.json();
        if (!body?.node) throw new Error("no revision returned");
        mutate({ type: "reviseNode", node: body.node, edges: body.edges ?? [] }, `Correction: ${text}`);
        pushLog({
          kind: "world",
          text: `Correction: ${text} — node rewritten, ${(body.edges ?? []).length} link${(body.edges ?? []).length === 1 ? "" : "s"} restated`,
        });
        setStatus({ phase: "idle", message: "" });
        setCorrection(null);
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message });
        pushLog({ kind: "error", text: `Correction failed: ${(e as Error).message}` });
      } finally {
        setCorrecting(false);
      }
    },
    [computed, correction, graph, mutate, pushLog, setStatus],
  );

  if (!graph) {
    return (
      <aside
        data-testid="inspector"
        className="h-full border-l border-line bg-panel p-4 text-xs text-muted"
        aria-label="Inspector"
      >
        <p className="font-serif text-[15px] text-fg">Details</p>
        <p className="mt-1 leading-relaxed">
          Select a node or a link on the map to see how its number is built, what the market thinks, and to try a change.
        </p>
      </aside>
    );
  }

  return (
    <aside
      data-testid="inspector"
      className="flex h-full flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-4 text-xs"
      aria-label="Inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-muted">
          {node ? (isEvent(node) ? "Event" : "Market variable") : edge ? "Link" : "Details"}
          {node && diff?.addedNodeIds.has(node.id) ? (
            <span
              title={worldName}
              className="max-w-[14rem] truncate rounded-full bg-accent px-2 py-px text-[10px] font-medium uppercase tracking-wide text-white"
            >
              New in {short(worldName)}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          aria-label="Close details"
          onClick={() => {
            select(null);
            onClose?.();
          }}
          className="-mr-1 -mt-1 rounded-md px-2 py-0.5 text-muted hover:bg-panel-2 hover:text-fg"
        >
          ×
        </button>
      </div>

      {!node && !edge ? (
        <div className="text-muted">
          <p className="font-serif text-[15px] text-fg">Details</p>
          <p className="mt-1 leading-relaxed">
            Select a node or a link on the map to see how its number is built, what the market thinks, and to try a change.
          </p>
        </div>
      ) : null}

      {node ? <NodePanel
        node={node}
        transientValue={
          transient?.type === "override" && transient.nodeId === node.id ? transient.value : null
        }
        pinned={computed?.events.get(node.id)?.fixed === "pin"}
        p={computed?.events.get(node.id)?.p ?? null}
        move={computed?.numerics.get(node.id)?.move ?? null}
        terms={
          isEvent(node)
            ? (computed?.events.get(node.id)?.terms ?? [])
            : (computed?.numerics.get(node.id)?.terms ?? [])
        }
        fixed={
          isEvent(node)
            ? (computed?.events.get(node.id)?.fixed ?? null)
            : (computed?.numerics.get(node.id)?.fixed ?? null)
        }
        onInput={(value) => setTransient({ type: "override", nodeId: node.id, value })}
        onApply={apply}
        onApplyNew={(label) => applyNew(label)}
        onBaseline={onBaseline}
        worldName={worldName}
        impact={transient ? impactRows(graph, computed, compare) : []}
        onReset={() => setTransient(null)}
        onPin={(value) => mutate({ type: "pin", nodeId: node.id, value }, `${node.id} pinned`)}
        onUnpin={() => removeEditsFor(node.id)}
        onAdopt={(value, source) =>
          mutate({ type: "adoptMarket", nodeId: node.id, value, source }, "Adopted market odds")
        }
        branchText={branchText}
        setBranchText={setBranchText}
        onBranch={() => void branchHere(node.id)}
        correctionText={correction?.nodeId === node.id ? correction.text : ""}
        setCorrectionText={(text) => setCorrection({ nodeId: node.id, text })}
        onCorrect={() => void correctNode(node.id)}
        correcting={correcting}
        names={names}
      /> : null}

      {edge ? (
        <EdgePanel
          edge={edge}
          onParam={(param, value) =>
            mutate({ type: "setEdgeParam", edgeId: edge.id, param, value }, `${edge.id} ${param}`)
          }
          onCut={() => mutate({ type: "cutEdge", edgeId: edge.id }, `cut ${edge.id}`)}
        />
      ) : null}
    </aside>
  );
}

/* ------------------------------------------------------------------ */

type ImpactRow = { id: string; name: string; before: string; after: string; delta: number; deltaText: string };

/** The nodes a previewed change moves, biggest first. Events in points, numerics in percent. */
function impactRows(
  graph: ReturnType<typeof useComputed>["graph"],
  computed: ReturnType<typeof useComputed>["computed"],
  compare: ReturnType<typeof useComputed>["compare"],
  limit = 5,
): ImpactRow[] {
  if (!graph || !computed || !compare) return [];
  const rows: (ImpactRow & { size: number })[] = [];
  for (const n of graph.nodes) {
    if (isEvent(n)) {
      const a = computed.events.get(n.id)?.p;
      const b = compare.events.get(n.id)?.p;
      if (a == null || b == null) continue;
      const delta = Math.round((a - b) * 100);
      if (Math.abs(delta) < 1) continue;
      rows.push({ id: n.id, name: n.statement, before: pct(b), after: pct(a), delta, deltaText: `${delta >= 0 ? "+" : ""}${delta}pp`, size: Math.abs(delta) });
    } else {
      const a = computed.numerics.get(n.id)?.move;
      const b = compare.numerics.get(n.id)?.move;
      if (a == null || b == null) continue;
      const delta = Math.round((a - b) * 10) / 10;
      if (Math.abs(delta) < 0.5) continue;
      rows.push({ id: n.id, name: n.name, before: signed(b), after: signed(a), delta, deltaText: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`, size: Math.abs(delta) });
    }
  }
  return rows.sort((x, y) => y.size - x.size).slice(0, limit);
}

function NodePanel(props: {
  node: Node;
  transientValue: number | null;
  pinned: boolean;
  p: number | null;
  move: number | null;
  terms: { label: string; formula: string; value: number }[];
  fixed: "pin" | "override" | null;
  onInput(v: number): void;
  onApply(label: string): void;
  onApplyNew(label: string): void;
  onBaseline: boolean;
  worldName: string;
  impact: ImpactRow[];
  onReset(): void;
  onPin(v: boolean): void;
  onUnpin(): void;
  onAdopt(value: number, source: string): void;
  branchText: string;
  setBranchText(v: string): void;
  onBranch(): void;
  correctionText: string;
  setCorrectionText(v: string): void;
  onCorrect(): void;
  correcting: boolean;
  names: Record<string, string>;
}) {
  const { node } = props;
  const event = isEvent(node);

  // Events slide in probability points; numerics slide in level when a price is
  // known, and in percent move when it is not.
  const slider = event
    ? {
        label: "probability",
        min: 0,
        max: 100,
        step: 1,
        value: (props.transientValue ?? props.p ?? node.base) * 100,
        format: (v: number) => `${Math.round(v)}%`,
        toEdit: (v: number) => v / 100,
      }
    : node.current
      ? {
          label: `level (${node.unit})`,
          min: node.current * 0.5,
          max: node.current * 1.5,
          step: node.current / 200,
          value:
            node.current *
            (1 + (props.transientValue ?? props.move ?? node.baselineMove) / 100),
          format: (v: number) => `${v.toFixed(2)} ${node.unit}`,
          toEdit: (v: number) => ((v - node.current!) / node.current!) * 100,
        }
      : {
          label: "move",
          min: -50,
          max: 50,
          step: 0.5,
          value: props.transientValue ?? props.move ?? node.baselineMove,
          format: signed,
          toEdit: (v: number) => v,
        };

  const headline = event ? node.statement : node.name;
  const finalText = event
    ? pct(props.p ?? node.base)
    : signed(props.move ?? node.baselineMove);
  const changeLabel = `${headline} = ${slider.format(slider.value)}`;
  const previewing = props.transientValue !== null;

  const CONF: Record<string, string> = { high: "text-green", medium: "text-blue", low: "text-orange" };
  const ghost = "rounded-md border border-line-strong px-2.5 py-1 text-fg hover:bg-panel-2";

  return (
    <div className="flex flex-col gap-4">
      <header className="-mt-3">
        <h2 className="font-serif text-[19px] leading-tight text-fg">{headline}</h2>
        {event ? (
          <p className="mt-1.5 leading-relaxed text-muted">{node.resolution}</p>
        ) : (
          <p className="num mt-1.5 text-muted">
            {node.ticker ? `${node.ticker} · ` : ""}
            {node.current !== null ? `${node.current} ${node.unit}` : node.unit}
          </p>
        )}
        <p className="mt-1.5 flex flex-wrap gap-x-3 text-muted">
          {event ? (
            <span>
              lag <span className="num text-fg">+{node.lagDays[0]}–{node.lagDays[1]}d</span>
            </span>
          ) : null}
          <span>
            confidence <span className={CONF[node.confidence] ?? "text-fg"}>{node.confidence}</span>
          </span>
        </p>
      </header>

      <ParamSlider
        label={slider.label}
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={slider.value}
        format={slider.format}
        onInput={(v) => props.onInput(slider.toEdit(v))}
        onApply={() => props.onApply(changeLabel)}
        onApplyNew={() => props.onApplyNew(changeLabel)}
        onReset={props.onReset}
        previewing={previewing}
        applyLabel={props.onBaseline ? "Save as new world" : `Save to ${short(props.worldName)}`}
        applyNewLabel={props.onBaseline ? "Save with a name…" : "Fork as new world…"}
        hint={
          previewing
            ? props.onBaseline
              ? "Baseline stays as it is. Saving forks a world that carries this change."
              : `Nothing is saved yet. Deltas on the map show what this change does to ${short(props.worldName)}.`
            : event
              ? "Drag to set the probability by hand. Only nodes downstream of this one move."
              : "Drag to set the level by hand. Only nodes downstream of this one move."
        }
      />

      {previewing && props.impact.length ? (
        <section className="rounded-lg border border-accent/30 bg-accent-soft/40 p-3">
          <h3 className="text-muted">If you save this</h3>
          <ul className="mt-1.5 space-y-1">
            {props.impact.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-fg" title={row.name}>
                  {row.name}
                </span>
                <span className="num shrink-0 text-muted">
                  {row.before} → <span className="text-fg">{row.after}</span>{" "}
                  <span className={row.delta >= 0 ? "text-green" : "text-red"}>{row.deltaText}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : previewing ? (
        <p className="text-muted">Nothing downstream moves by a visible amount.</p>
      ) : null}

      {event ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted">Assume it</span>
          <button type="button" onClick={() => props.onPin(true)} className={ghost}>
            happens
          </button>
          <button type="button" onClick={() => props.onPin(false)} className={ghost}>
            does not
          </button>
          {props.pinned ? (
            <button type="button" onClick={props.onUnpin} className="rounded-md px-2 py-1 text-muted hover:text-fg">
              Unpin
            </button>
          ) : null}
        </div>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer list-none text-muted hover:text-fg">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          How this number is built
        </summary>
        <div className="mt-2">
          <AuditBlock terms={props.terms} final={finalText} fixed={props.fixed} names={props.names} />
        </div>
      </details>

      {event ? (
        <MarketSays node={node} modelP={props.p ?? node.base} onAdopt={props.onAdopt} />
      ) : null}

      {node.assumptions.length || node.rationale || (event && node.analogs.length) ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-muted hover:text-fg">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Why the model thinks so
          </summary>
          <div className="mt-2 flex flex-col gap-3">
      {node.assumptions.length ? (
            <section>
              <h3 className="mb-1 text-muted">Rests on</h3>
              <ul className="space-y-1 text-fg">
                {node.assumptions.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-faint" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {node.rationale ? (
            <section>
              <h3 className="mb-1 text-muted">Why the model thinks so</h3>
              <p className="leading-relaxed text-fg">{node.rationale}</p>
            </section>
          ) : null}

          {event && node.analogs.length ? (
            <section>
              <h3 className="mb-1 text-muted">Precedents</h3>
              <div className="flex flex-wrap gap-1">
                {node.analogs.map((a) => (
                  <span key={a} className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
                    {a}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          </div>
        </details>
      ) : null}

      <details className="group border-t border-line pt-3" data-testid="correction">
        <summary className="cursor-pointer list-none text-muted hover:text-fg">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          Correction
        </summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[11px] leading-snug text-muted">
            Tell the model what it got wrong here — the wording, the direction, who it helps. It
            rewrites this node and the links touching it, as a change in the current world.
            Baseline keeps the model&rsquo;s own version.
          </p>
          <textarea
            id="correction"
            data-testid="correction-input"
            rows={3}
            value={props.correctionText}
            onChange={(e) => props.setCorrectionText(e.target.value)}
            className="w-full rounded-md px-2.5 py-1.5 font-serif text-[15px] leading-snug"
            placeholder="This works the other way round — it should help the outcome downstream, not hurt it"
          />
          <button
            type="button"
            data-testid="correction-apply"
            disabled={props.correcting || props.correctionText.trim().length < 3}
            onClick={props.onCorrect}
            className="self-start rounded-md bg-accent px-2.5 py-1 font-medium text-white hover:brightness-95 disabled:opacity-50"
          >
            {props.correcting ? "Correcting…" : "Apply correction"}
          </button>
        </div>
      </details>

      <details className="group border-t border-line pt-3">
        <summary className="cursor-pointer list-none text-muted hover:text-fg">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          What if, from here
        </summary>
        <div className="mt-2 flex flex-col gap-1.5">
        <p className="text-[11px] leading-snug text-muted">
          Adds a new event linked to this node, assumes it happens, and opens the result as a new world forked from the current one.
        </p>
        <textarea
          id="branch-here"
          rows={2}
          value={props.branchText}
          onChange={(e) => props.setBranchText(e.target.value)}
          className="w-full rounded-md px-2.5 py-1.5 font-serif text-[15px] leading-snug"
          placeholder="…and the closure lasts a month"
        />
        <button
          type="button"
          onClick={props.onBranch}
          className="self-start rounded-md bg-accent px-2.5 py-1 font-medium text-white hover:brightness-95"
        >
          Explore as a new world
        </button>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EdgePanel(props: {
  edge: Edge;
  onParam(param: "strength" | "impact" | "beta", value: number): void;
  onCut(): void;
}) {
  const { edge } = props;

  const param =
    edge.kind === "ee" || edge.kind === "ne"
      ? { name: "strength" as const, value: edge.strength, min: 0, max: 1, step: 0.01 }
      : edge.kind === "en"
        ? { name: "impact" as const, value: edge.impact, min: -100, max: 100, step: 1 }
        : { name: "beta" as const, value: edge.beta, min: -10, max: 10, step: 0.1 };

  return (
    <div className="flex flex-col gap-4">
      <header className="-mt-3">
        <p className="text-muted">{edge.kind === "ee" ? `${edge.polarity}s` : edge.kind}</p>
        <h2 className="mt-0.5 font-serif text-[17px] leading-snug text-fg">{edge.mechanism}</h2>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 ${
              edge.support === "evidence" ? "bg-green-soft text-green" : "bg-panel-2 text-muted"
            }`}
          >
            {edge.support === "evidence" ? "backed by evidence" : "model assumption"}
          </span>
          <span className="text-muted">confidence {edge.confidence}</span>
        </p>
      </header>

      {edge.assumptions.length ? (
        <section>
          <h3 className="mb-1 text-muted">Rests on</h3>
          <ul className="space-y-1 text-fg">
            {edge.assumptions.map((a) => (
              <li key={a} className="flex gap-2">
                <span aria-hidden="true" className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ParamSlider
        label={param.name}
        min={param.min}
        max={param.max}
        step={param.step}
        value={param.value}
        format={(v) => (param.name === "strength" ? v.toFixed(2) : signed(v))}
        onInput={(v) => props.onParam(param.name, v)}
        onApply={() => props.onParam(param.name, param.value)}
        onApplyNew={() => props.onParam(param.name, param.value)}
        onReset={() => props.onParam(param.name, param.value)}
      />

      <button
        type="button"
        onClick={props.onCut}
        className="self-start rounded-md border border-red/40 px-2.5 py-1 text-red hover:bg-red-soft"
      >
        Remove this link
      </button>
    </div>
  );
}
