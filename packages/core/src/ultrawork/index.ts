/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ultrawork Mode
 *
 * Ultrawork is a maximum precision execution mode that enforces:
 * - Mandatory certainty protocols before implementation
 * - Agent utilization for context gathering
 * - Verification guarantees with evidence
 * - Zero tolerance for partial work
 *
 * Activation:
 * - Include "ultrawork" or "ulw" keyword in any prompt
 * - Use /ulw-loop command for continuous execution
 *
 * @example
 * // Keyword activation
 * "ultrawork implement a login system with OAuth"
 * "ulw refactor the authentication module"
 *
 * @module ultrawork
 */

export { detectUltrawork, removeCodeBlocks } from './detector.js';
export {
  ULTRAWORK_SYSTEM_PROMPT,
  PLANNER_ULTRAWORK_PROMPT,
  ULTRAWORK_TOAST,
} from './constants.js';
export {
  processUltrawork,
  isUltraworkRequest,
  type UltraworkProcessResult,
} from './ultraworkProcessor.js';
