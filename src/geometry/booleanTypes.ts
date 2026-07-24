/**
 * Boolean geometry contract (spec BLN-003). Library-agnostic: no clipping-engine
 * types leak across this boundary (BLN-004). The API is asynchronous so a later
 * Web Worker / WASM engine can replace the adapter without touching commands or
 * UI (BLN-011).
 */
import type { Matrix2D } from "@/model/types";
import type { FillRule } from "@/model/types";
import type { PathGeometry } from "./pathTypes";

export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";

export interface BooleanOperand {
  id: string;
  /** Geometry in the node's LOCAL space; `transform` maps it to world space. */
  geometry: PathGeometry;
  fillRule: FillRule;
  /** World transform (parent chain × node transform). */
  transform: Matrix2D;
}

export interface BooleanResult {
  /** Result geometry in WORLD space. Empty segments = empty result. */
  geometry: PathGeometry;
  fillRule: FillRule;
  warnings: string[];
  /** True when the operation produced no visible geometry (BLN-008). */
  empty: boolean;
}

export interface BooleanGeometryEngine {
  /**
   * For "subtract", operands are ordered back→front: the front-most (last)
   * operand is subtracted from the union of the rest (BLN-002).
   */
  execute(operation: BooleanOperation, operands: BooleanOperand[]): Promise<BooleanResult>;
}
