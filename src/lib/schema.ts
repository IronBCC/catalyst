import { z } from "zod";

/**
 * The contract every other module codes against.
 *
 * Two families live here:
 *   - `Llm*` schemas are what the model is asked to produce. They are
 *     `strictObject` with no `.optional()` anywhere: every field is required and
 *     unusable values are spelled `null`, because that is what a structured-output
 *     JSON Schema can express faithfully.
 *   - internal schemas and types are what the engine and the store use, after
 *     `repairGraph` has slugged ids, split edges into kinds and set `support`.
 */

export const ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const Id = z.string().regex(ID_RE);

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const Source = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string(),
  publishedAt: z.string().nullable(),
});
export type Source = z.infer<typeof Source>;

export const Summary = z.strictObject({
  headline: z.string(),
  mainUncertainty: z.string(),
  followUps: z.array(z.string()),
});
export type Summary = z.infer<typeof Summary>;

/* ------------------------------------------------------------------ *
 * LLM-facing schemas
 * ------------------------------------------------------------------ */

export const LlmEventNode = z.strictObject({
  id: z.string(),
  kind: z.literal("event"),
  statement: z.string(),
  resolution: z.string(),
  base: z.number().min(0).max(1),
  // A fixed-length array rather than a tuple: `z.tuple` serialises to the
  // draft-7 list form of `items`, which strict providers reject outright
  // ("'items' must be a schema object, got list"). `repairGraph` narrows it
  // back to [number, number] for the internal model.
  lagDays: z.array(z.number().min(0)).length(2),
  rationale: z.string(),
  analogs: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidence: Confidence,
  marketQuery: z.string(),
  isRoot: z.boolean(),
  isTarget: z.boolean(),
});

export const LlmNumericNode = z.strictObject({
  id: z.string(),
  kind: z.literal("numeric"),
  name: z.string(),
  unit: z.string(),
  ticker: z.string().nullable(),
  current: z.number().nullable(),
  baselineMove: z.number().min(-100).max(100),
  sigma: z.number().min(0).max(200),
  rationale: z.string(),
  assumptions: z.array(z.string()),
  confidence: Confidence,
});

export const LlmNode = z.discriminatedUnion("kind", [LlmEventNode, LlmNumericNode]);

/**
 * One flat edge shape for the model: it fills the parameters its mechanism needs
 * and nulls the rest. `repairGraph` decides the kind from the endpoints.
 */
export const LlmEdge = z.strictObject({
  source: z.string(),
  target: z.string(),
  mechanism: z.string(),
  assumptions: z.array(z.string()),
  confidence: Confidence,
  sourceIds: z.array(z.string()),
  polarity: z.enum(["promote", "inhibit"]).nullable(),
  strength: z.number().min(0).max(1).nullable(),
  impact: z.number().min(-100).max(100).nullable(),
  beta: z.number().min(-10).max(10).nullable(),
  threshold: z.number().nullable(),
  direction: z.enum(["above", "below"]).nullable(),
  width: z.number().min(0).nullable(),
});

export const LlmGraph = z.strictObject({
  nodes: z.array(LlmNode),
  edges: z.array(LlmEdge),
  summary: Summary,
});
export type LlmGraph = z.infer<typeof LlmGraph>;

export const LlmBranchItem = z.strictObject({
  node: LlmNode,
  edges: z.array(LlmEdge),
});

export const LlmBranch = z.strictObject({
  candidates: z.array(LlmBranchItem).min(1).max(5),
});
export type LlmBranch = z.infer<typeof LlmBranch>;

export const LlmThesis = z.strictObject({
  thesis: z.string(),
  rationale: z.string(),
  invalidation: z.array(z.string()),
  confirmation: z.array(z.string()),
  risks: z.array(z.string()),
  marketView: z.string(),
});
export type LlmThesis = z.infer<typeof LlmThesis>;

/* ------------------------------------------------------------------ *
 * Internal model (spec §3)
 * ------------------------------------------------------------------ */

export const EventNodeSchema = z.strictObject({
  id: Id,
  kind: z.literal("event"),
  statement: z.string(),
  resolution: z.string(),
  base: z.number().min(0).max(1),
  lagDays: z.tuple([z.number().min(0), z.number().min(0)]),
  rationale: z.string(),
  analogs: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidence: Confidence,
  marketQuery: z.string(),
  isRoot: z.boolean(),
  isTarget: z.boolean(),
});
export type EventNode = z.infer<typeof EventNodeSchema>;

export const NumericNodeSchema = z.strictObject({
  id: Id,
  kind: z.literal("numeric"),
  name: z.string(),
  unit: z.string(),
  ticker: z.string().nullable(),
  current: z.number().nullable(),
  baselineMove: z.number().min(-100).max(100),
  sigma: z.number().min(0).max(200),
  rationale: z.string(),
  assumptions: z.array(z.string()),
  confidence: Confidence,
});
export type NumericNode = z.infer<typeof NumericNodeSchema>;

export const NodeSchema = z.discriminatedUnion("kind", [EventNodeSchema, NumericNodeSchema]);
export type Node = z.infer<typeof NodeSchema>;

const edgeBase = {
  id: z.string(),
  source: Id,
  target: Id,
  mechanism: z.string(),
  assumptions: z.array(z.string()),
  confidence: Confidence,
  support: z.enum(["evidence", "model_assumption"]),
  sourceIds: z.array(z.string()),
};

export const EdgeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...edgeBase,
    kind: z.literal("ee"),
    polarity: z.enum(["promote", "inhibit"]),
    strength: z.number().min(0).max(1),
  }),
  z.strictObject({ ...edgeBase, kind: z.literal("en"), impact: z.number().min(-100).max(100) }),
  z.strictObject({ ...edgeBase, kind: z.literal("nn"), beta: z.number().min(-10).max(10) }),
  z.strictObject({
    ...edgeBase,
    kind: z.literal("ne"),
    threshold: z.number(),
    direction: z.enum(["above", "below"]),
    width: z.number().min(0),
    strength: z.number().min(0).max(1),
  }),
]);
export type Edge = z.infer<typeof EdgeSchema>;
export type EdgeKind = Edge["kind"];

export const GraphSchema = z.strictObject({
  id: z.string(),
  hypothesis: z.string(),
  mode: z.enum(["explore", "chain"]),
  target: z.string().nullable(),
  horizonDays: z.number().int().min(1).max(730),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  sources: z.array(Source),
  model: z.string(),
  generatedAt: z.string(),
  summary: Summary.nullable(),
});
export type Graph = z.infer<typeof GraphSchema>;

export const PositionSchema = z.strictObject({
  ticker: z.string(),
  side: z.enum(["long", "short"]),
  size: z.number().positive(),
  stopPct: z.number().nullable(),
  targetPct: z.number().nullable(),
});
export type Position = z.infer<typeof PositionSchema>;

export const EditSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pin"), nodeId: Id, value: z.boolean() }),
  z.strictObject({ type: z.literal("override"), nodeId: Id, value: z.number() }),
  z.strictObject({ type: z.literal("cutEdge"), edgeId: z.string() }),
  z.strictObject({
    type: z.literal("setEdgeParam"),
    edgeId: z.string(),
    param: z.enum(["strength", "impact", "beta"]),
    value: z.number(),
  }),
  z.strictObject({ type: z.literal("addNode"), node: NodeSchema, edges: z.array(EdgeSchema) }),
  z.strictObject({
    type: z.literal("adoptMarket"),
    nodeId: Id,
    value: z.number(),
    source: z.string(),
  }),
]);
export type Edit = z.infer<typeof EditSchema>;

export const WorldSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  edits: z.array(EditSchema),
  createdAt: z.string(),
});
export type World = z.infer<typeof WorldSchema>;

export const WORKSPACE_VERSION = 1;

export const WorkspaceSchema = z.strictObject({
  version: z.literal(1),
  graph: GraphSchema.nullable(),
  worlds: z.array(WorldSchema),
  activeWorldId: z.string().nullable(),
  compareWorldId: z.string().nullable(),
  positions: z.array(PositionSchema),
  thesis: z.record(z.string(), LlmThesis),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/* ------------------------------------------------------------------ *
 * Verdict lives here, not in the engine, so that `ThesisInput` can name it
 * without the schema module importing the engine. `chainVerdict` imports it.
 * ------------------------------------------------------------------ */

export const VerdictSchema = z.strictObject({
  lift: z.number(),
  pIfTrue: z.number(),
  pIfFalse: z.number(),
  label: z.enum(["strong", "plausible", "weak", "none"]),
  pathEdgeIds: z.array(z.string()),
  weakestEdgeId: z.string().nullable(),
  pathCount: z.number().int().min(0),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/* ------------------------------------------------------------------ *
 * Route inputs
 * ------------------------------------------------------------------ */

export const GenerateInputSchema = z.strictObject({
  hypothesis: z.string().min(5).max(500),
  mode: z.enum(["explore", "chain"]),
  target: z.string().max(500).nullable(),
  horizonDays: z.number().int().min(1).max(730),
  positions: z.array(PositionSchema).max(20),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;

export const BranchInputSchema = z.strictObject({
  graph: GraphSchema,
  compact: z.string().max(20000),
  text: z.string().max(500).nullable(),
  attachTo: z.string().nullable(),
  count: z.union([z.literal(1), z.literal(3)]),
  blackSwan: z.boolean(),
});
export type BranchInput = z.infer<typeof BranchInputSchema>;

export const LegSchema = z.strictObject({
  ticker: z.string(),
  name: z.string(),
  direction: z.enum(["long", "short"]),
  expectedMove: z.number(),
  p10: z.number(),
  p90: z.number(),
  entry: z.number().nullable(),
  stop: z.number().nullable(),
  takeProfit: z.number().nullable(),
});
export type Leg = z.infer<typeof LegSchema>;

const NodeNote = z.strictObject({
  nodeId: z.string(),
  statement: z.string(),
  deltaPnl: z.number(),
});

export const ThesisInputSchema = z.strictObject({
  hypothesis: z.string(),
  horizonDays: z.number().int().min(1).max(730),
  worldName: z.string(),
  primary: LegSchema.nullable(),
  candidates: z.array(LegSchema),
  invalidation: z.array(NodeNote),
  confirmation: z.array(NodeNote),
  risks: z.array(
    z.strictObject({ nodeId: z.string(), statement: z.string(), base: z.number() }),
  ),
  marketView: z.array(
    z.strictObject({
      statement: z.string(),
      model: z.number(),
      market: z.number(),
      edge: z.number(),
      url: z.string(),
    }),
  ),
  mc: z
    .strictObject({ pProfit: z.number(), ev: z.number(), p5: z.number() })
    .nullable(),
  verdict: VerdictSchema.nullable(),
});
export type ThesisInput = z.infer<typeof ThesisInputSchema>;

/* ------------------------------------------------------------------ */

export const isEvent = (n: Node): n is EventNode => n.kind === "event";
export const isNumeric = (n: Node): n is NumericNode => n.kind === "numeric";
