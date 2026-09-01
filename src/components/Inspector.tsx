"use client";

import { useCallback, useMemo, useState } from "react";
import { AuditBlock } from "@/components/AuditBlock";
import MarketSays from "@/components/MarketSays";
import { ParamSlider } from "@/components/ParamSlider";
import { compactGraph } from "@/lib/prompts";
import { BASELINE_ID } from "@/lib/engine/worlds";
import { isEvent, type Edge, type Node } from "@/lib/schema";
import { useComputed, useStore } from "@/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export default function Inspector() {
  const selection = useStore((s) => s.selection);
  const transient = useStore((s) => s.transient);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const setTransient = useStore((s) => s.setTransient);
  const commitTransient = useStore((s) => s.commitTransient);
  const mutate = useStore((s) => s.mutate);
  const removeEditsFor = useStore((s) => s.removeEditsFor);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);
  const [branchText, setBranchText] = useState("");

  const { graph, computed } = useComputed();
  const onBaseline = activeWorldId === BASELINE_ID;

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

  const apply = useCallback(() => commitTransient(false), [commitTransient]);
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
        mutate(
          { type: "addNode", node: candidate.node, edges: candidate.edges },
          branchText.trim(),
        );
        pushLog({ kind: "world", text: `Branch: ${branchText.trim()}` });
        setStatus({ phase: "idle", message: "" });
        setBranchText("");
      } catch (e) {
        setStatus({ phase: "error", message: (e as Error).message });
        pushLog({ kind: "error", text: `Branch failed: ${(e as Error).message}` });
      }
    },
    [branchText, computed, graph, mutate, pushLog, setStatus],
  );

  if (!graph) {
    return (
      <aside
        data-testid="inspector"
        className="h-full border-l border-line bg-panel p-3 text-xs text-muted"
        aria-label="Inspector"
      >
        Nothing selected.
      </aside>
    );
  }

  return (
    <aside
      data-testid="inspector"
      className="flex h-full flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3 text-xs"
      aria-label="Inspector"
    >
      {onBaseline ? (
        <p className="rounded border border-line px-2 py-1 text-muted">
          Baseline is read-only; edits create a world.
        </p>
      ) : null}

      {!node && !edge ? <p className="text-muted">Select a node or an edge.</p> : null}

      {node ? <NodePanel
        node={node}
        onBaseline={onBaseline}
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
        onReset={() => setTransient(null)}
        onPin={(value) => mutate({ type: "pin", nodeId: node.id, value }, `${node.id} pinned`)}
        onUnpin={() => removeEditsFor(node.id)}
        onAdopt={(value, source) =>
          mutate({ type: "adoptMarket", nodeId: node.id, value, source }, "Adopted market odds")
        }
        branchText={branchText}
        setBranchText={setBranchText}
        onBranch={() => void branchHere(node.id)}
      /> : null}

      {edge ? (
        <EdgePanel
          edge={edge}
          onBaseline={onBaseline}
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

function NodePanel(props: {
  node: Node;
  onBaseline: boolean;
  transientValue: number | null;
  pinned: boolean;
  p: number | null;
  move: number | null;
  terms: { label: string; formula: string; value: number }[];
  fixed: "pin" | "override" | null;
  onInput(v: number): void;
  onApply(): void;
  onApplyNew(label: string): void;
  onReset(): void;
  onPin(v: boolean): void;
  onUnpin(): void;
  onAdopt(value: number, source: string): void;
  branchText: string;
  setBranchText(v: string): void;
  onBranch(): void;
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

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm text-fg">{headline}</h2>

      {event ? (
        <>
          <p className="text-muted">{node.resolution}</p>
          <p className="text-muted">
            lag +{node.lagDays[0]}–{node.lagDays[1]}d
          </p>
        </>
      ) : (
        <p className="text-muted">
          {node.ticker ? `${node.ticker} · ` : ""}
          {node.current !== null ? `${node.current} ${node.unit}` : node.unit}
        </p>
      )}

      <p className="text-muted">
        confidence: <span className="text-fg">{node.confidence}</span>
      </p>

      {node.assumptions.length ? (
        <details open>
          <summary className="text-muted">assumptions</summary>
          <ul className="ml-4 list-disc text-muted">
            {node.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <ParamSlider
        label={slider.label}
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={slider.value}
        format={slider.format}
        applyNewOnly={props.onBaseline}
        onInput={(v) => props.onInput(slider.toEdit(v))}
        onApply={props.onApply}
        onApplyNew={() => props.onApplyNew(`${headline} = ${slider.format(slider.value)}`)}
        onReset={props.onReset}
      />

      {event ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => props.onPin(true)}
            className="rounded border border-line px-2 py-0.5 text-muted hover:text-green"
          >
            Pin true
          </button>
          <button
            type="button"
            onClick={() => props.onPin(false)}
            className="rounded border border-line px-2 py-0.5 text-muted hover:text-red"
          >
            Pin false
          </button>
          {props.pinned ? (
            <button
              type="button"
              onClick={props.onUnpin}
              className="rounded border border-line px-2 py-0.5 text-muted"
            >
              Unpin
            </button>
          ) : null}
        </div>
      ) : null}

      <AuditBlock terms={props.terms} final={finalText} fixed={props.fixed} />

      {event ? (
        <MarketSays node={node} modelP={props.p ?? node.base} onAdopt={props.onAdopt} />
      ) : null}

      <p className="text-muted">{node.rationale}</p>

      {event && node.analogs.length ? (
        <div className="flex flex-wrap gap-1">
          {node.analogs.map((a) => (
            <span key={a} className="rounded-full border border-line px-2 py-0.5 text-muted">
              {a}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <label className="text-muted" htmlFor="branch-here">
          Branch here
        </label>
        <textarea
          id="branch-here"
          rows={2}
          value={props.branchText}
          onChange={(e) => props.setBranchText(e.target.value)}
          className="rounded border border-line bg-bg p-1 text-fg"
          placeholder="…and the closure lasts a month"
        />
        <button
          type="button"
          onClick={props.onBranch}
          className="rounded border border-blue px-2 py-0.5 text-blue"
        >
          Branch here
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EdgePanel(props: {
  edge: Edge;
  onBaseline: boolean;
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
    <div className="flex flex-col gap-2">
      <h2 className="text-sm text-fg">Why this follows</h2>
      <p className="text-fg">{edge.mechanism}</p>

      <p className="text-muted">
        {edge.kind === "ee" ? `polarity: ${edge.polarity}` : `link: ${edge.kind}`}
      </p>

      <p>
        <span
          className={`rounded border px-2 py-0.5 ${
            edge.support === "evidence" ? "border-green text-green" : "border-line text-muted"
          }`}
        >
          {edge.support === "evidence" ? "evidence" : "model assumption"}
        </span>{" "}
        <span className="text-muted">confidence: {edge.confidence}</span>
      </p>

      {edge.assumptions.length ? (
        <ul className="ml-4 list-disc text-muted">
          {edge.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}

      <ParamSlider
        label={param.name}
        min={param.min}
        max={param.max}
        step={param.step}
        value={param.value}
        format={(v) => (param.name === "strength" ? v.toFixed(2) : signed(v))}
        applyNewOnly={props.onBaseline}
        onInput={(v) => props.onParam(param.name, v)}
        onApply={() => props.onParam(param.name, param.value)}
        onApplyNew={() => props.onParam(param.name, param.value)}
        onReset={() => props.onParam(param.name, param.value)}
      />

      <button
        type="button"
        onClick={props.onCut}
        className="rounded border border-red px-2 py-0.5 text-red"
      >
        Cut edge
      </button>
    </div>
  );
}
