/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion, Part } from '@google/genai';
import { detectUltrawork } from './detector.js';
import { ULTRAWORK_SYSTEM_PROMPT, ULTRAWORK_TOAST } from './constants.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Result of ultrawork processing
 */
export interface UltraworkProcessResult {
  /** Whether ultrawork mode was activated */
  activated: boolean;
  /** The modified request with ultrawork prompt injected (if activated) */
  request: PartListUnion;
}

/**
 * Extract text content from a PartListUnion for keyword detection
 */
function extractTextFromParts(parts: PartListUnion): string {
  if (typeof parts === 'string') {
    return parts;
  }

  if (!Array.isArray(parts)) {
    // Single Part object
    const part = parts;
    if ('text' in part && typeof part.text === 'string') {
      return part.text;
    }
    return '';
  }

  // Array of parts
  return parts
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if ('text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join(' ');
}

/**
 * Process a request for ultrawork mode activation.
 *
 * Detects ultrawork keywords and injects the ultrawork system prompt
 * if activated. Also emits a feedback notification.
 *
 * @param request - The original request parts
 * @returns Processing result with activation status and modified request
 *
 * @example
 * const result = processUltrawork([{ text: "ultrawork implement login" }]);
 * if (result.activated) {
 *   // Use result.request which has ultrawork prompt injected
 * }
 */
export function processUltrawork(
  request: PartListUnion,
): UltraworkProcessResult {
  const text = extractTextFromParts(request);
  const isUltrawork = detectUltrawork(text);

  if (!isUltrawork) {
    return {
      activated: false,
      request,
    };
  }

  debugLogger.log('[ultrawork] Ultrawork mode activated');

  // Emit feedback notification
  coreEvents.emitFeedback(
    'info',
    `🚀 ${ULTRAWORK_TOAST.title}: ${ULTRAWORK_TOAST.message}`,
  );

  // Inject ultrawork system prompt at the beginning
  const ultraworkPart: Part = {
    text: ULTRAWORK_SYSTEM_PROMPT,
  };

  // Create modified request with ultrawork prompt prepended
  let modifiedRequest: PartListUnion;

  if (typeof request === 'string') {
    modifiedRequest = [ultraworkPart, { text: request }];
  } else if (!Array.isArray(request)) {
    modifiedRequest = [ultraworkPart, request];
  } else {
    modifiedRequest = [ultraworkPart, ...request];
  }

  return {
    activated: true,
    request: modifiedRequest,
  };
}

/**
 * Check if a request contains ultrawork keywords without modifying it.
 *
 * @param request - The request parts to check
 * @returns true if ultrawork keywords are detected
 */
export function isUltraworkRequest(request: PartListUnion): boolean {
  const text = extractTextFromParts(request);
  return detectUltrawork(text);
}
