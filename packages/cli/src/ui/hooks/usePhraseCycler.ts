/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { jokeRegistry } from '../jokes/index.js';

export const PHRASE_CHANGE_INTERVAL_MS = 15000;
export const INTERACTIVE_SHELL_WAITING_PHRASE =
  'Interactive shell awaiting input... press tab to focus shell';

/**
 * Default fallback phrase when no provider returns a phrase.
 */
const DEFAULT_FALLBACK_PHRASE = 'Processing…';

/**
 * Custom hook to manage cycling through loading phrases.
 *
 * Uses the jokeRegistry to get phrases from the configured provider.
 * Falls back to tips (with 1/6 probability after first request) when
 * not using custom phrases.
 *
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @param shouldShowFocusHint Whether to show the shell focus hint.
 * @param customPhrases Optional list of custom phrases to use (legacy support).
 * @param showTips Whether to show informative tips (default: true).
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (
  isActive: boolean,
  isWaiting: boolean,
  shouldShowFocusHint: boolean,
  customPhrases?: string[],
  showTips: boolean = true,
) => {
  // Legacy support: if customPhrases are provided directly, use them
  // This maintains backward compatibility with existing callers
  const useLegacyCustomPhrases = customPhrases && customPhrases.length > 0;

  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    DEFAULT_FALLBACK_PHRASE,
  );

  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownFirstRequestTipRef = useRef(false);

  useEffect(() => {
    // Always clear on re-run
    if (phraseIntervalRef.current) {
      clearInterval(phraseIntervalRef.current);
      phraseIntervalRef.current = null;
    }

    if (shouldShowFocusHint) {
      setCurrentLoadingPhrase(INTERACTIVE_SHELL_WAITING_PHRASE);
      return;
    }

    if (isWaiting) {
      setCurrentLoadingPhrase('Waiting for user confirmation...');
      return;
    }

    if (!isActive) {
      // Get initial phrase from provider or use fallback
      const initialPhrase = useLegacyCustomPhrases
        ? customPhrases[0]
        : (jokeRegistry.getRandomPhrase() ?? DEFAULT_FALLBACK_PHRASE);
      setCurrentLoadingPhrase(initialPhrase);
      return;
    }

    const setRandomPhrase = () => {
      // Legacy mode: use customPhrases directly
      if (useLegacyCustomPhrases) {
        const randomIndex = Math.floor(Math.random() * customPhrases.length);
        setCurrentLoadingPhrase(customPhrases[randomIndex]);
        return;
      }

      // New mode: use jokeRegistry with tips integration
      let phrase: string | undefined;

      // Show a tip on the first request after startup, then continue with 1/6 chance
      if (showTips) {
        if (!hasShownFirstRequestTipRef.current) {
          // Show a tip during the first request
          const tipIndex = Math.floor(Math.random() * INFORMATIVE_TIPS.length);
          phrase = INFORMATIVE_TIPS[tipIndex];
          hasShownFirstRequestTipRef.current = true;
        } else if (Math.random() < 1 / 6) {
          // Roughly 1 in 6 chance to show a tip after the first request
          const tipIndex = Math.floor(Math.random() * INFORMATIVE_TIPS.length);
          phrase = INFORMATIVE_TIPS[tipIndex];
        }
      }

      // If we didn't select a tip, get a phrase from the registry
      if (!phrase) {
        phrase = jokeRegistry.getRandomPhrase();
      }

      setCurrentLoadingPhrase(phrase ?? DEFAULT_FALLBACK_PHRASE);
    };

    // Select an initial random phrase
    setRandomPhrase();

    phraseIntervalRef.current = setInterval(() => {
      // Select a new random phrase
      setRandomPhrase();
    }, PHRASE_CHANGE_INTERVAL_MS);

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [
    isActive,
    isWaiting,
    shouldShowFocusHint,
    customPhrases,
    useLegacyCustomPhrases,
    showTips,
  ]);

  return currentLoadingPhrase;
};
