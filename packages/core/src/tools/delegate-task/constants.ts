/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
} from '../../config/models.js';

// Re-export tool names from centralized location
export {
  DELEGATE_TASK_TOOL_NAME,
  BACKGROUND_OUTPUT_TOOL_NAME,
  BACKGROUND_CANCEL_TOOL_NAME,
} from '../tool-names.js';

/**
 * Available task categories for routing.
 */
export const TASK_CATEGORIES = [
  'visual-engineering',
  'ultrabrain',
  'artistry',
  'quick',
  'unspecified-low',
  'unspecified-high',
  'writing',
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/**
 * Available specialized agent types.
 */
export const AGENT_TYPES = [
  'sisyphus-junior',
  'oracle',
  'explore',
  'librarian',
  'prometheus',
  'metis',
  'momus',
  'multimodal-looker',
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

/**
 * Configuration for a category including model and description.
 */
export interface CategoryConfig {
  /** The Gemini model to use for this category */
  model: string;
  /** Human-readable description of the category */
  description: string;
  /** Optional prompt append for category-specific instructions */
  promptAppend?: string;
}

/**
 * Configuration for an agent type including model and description.
 */
export interface AgentTypeConfig {
  /** The Gemini model to use for this agent type */
  model: string;
  /** Human-readable description of the agent type */
  description: string;
  /** The system prompt for this agent type */
  systemPrompt: string;
}

/**
 * Default category configurations mapping to Gemini models.
 *
 * Based on Gemini model characteristics:
 * - Gemini 3 Flash: Best coding performance (78% SWE-bench), 3x faster, 75% cheaper
 * - Gemini 3 Pro: Best for creative/complex tasks, main conversation model
 * - Gemini 2.5 Flash: Large context (1M), cost-effective for search
 * - Gemini 2.5 Flash-Lite: Ultra-low cost for trivial tasks
 */
export function getDefaultCategoryConfigs(
  previewFeaturesEnabled: boolean,
): Record<TaskCategory, CategoryConfig> {
  const flashModel = previewFeaturesEnabled
    ? PREVIEW_GEMINI_FLASH_MODEL
    : DEFAULT_GEMINI_FLASH_MODEL;
  const proModel = previewFeaturesEnabled
    ? PREVIEW_GEMINI_MODEL
    : DEFAULT_GEMINI_MODEL;

  return {
    'visual-engineering': {
      model: flashModel,
      description: 'Frontend, UI/UX, design, styling, animation',
      promptAppend: VISUAL_ENGINEERING_PROMPT_APPEND,
    },
    ultrabrain: {
      model: proModel,
      description:
        'Deep logical reasoning, complex architecture decisions requiring extensive analysis',
      promptAppend: ULTRABRAIN_PROMPT_APPEND,
    },
    artistry: {
      model: proModel,
      description: 'Highly creative/artistic tasks, novel ideas',
    },
    quick: {
      model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      description:
        'Trivial tasks - single file changes, typo fixes, simple modifications',
    },
    'unspecified-low': {
      model: flashModel,
      description: "Tasks that don't fit other categories, low effort required",
    },
    'unspecified-high': {
      model: proModel,
      description:
        "Tasks that don't fit other categories, high effort required",
    },
    writing: {
      model: DEFAULT_GEMINI_FLASH_MODEL,
      description: 'Documentation, prose, technical writing',
    },
  };
}

/**
 * Default agent type configurations.
 */
export function getDefaultAgentTypeConfigs(
  previewFeaturesEnabled: boolean,
): Record<AgentType, AgentTypeConfig> {
  const flashModel = previewFeaturesEnabled
    ? PREVIEW_GEMINI_FLASH_MODEL
    : DEFAULT_GEMINI_FLASH_MODEL;
  const proModel = previewFeaturesEnabled
    ? PREVIEW_GEMINI_MODEL
    : DEFAULT_GEMINI_MODEL;

  return {
    'sisyphus-junior': {
      model: flashModel,
      description:
        'Focused task executor. Executes delegated tasks autonomously.',
      systemPrompt: SISYPHUS_JUNIOR_SYSTEM_PROMPT,
    },
    oracle: {
      model: proModel,
      description:
        'Architecture consultant. Read-only high-IQ reasoning for debugging and design.',
      systemPrompt: ORACLE_SYSTEM_PROMPT,
    },
    explore: {
      model: flashModel,
      description:
        'Codebase search agent. Contextual grep for codebases with thorough analysis.',
      systemPrompt: EXPLORE_SYSTEM_PROMPT,
    },
    librarian: {
      model: DEFAULT_GEMINI_FLASH_MODEL,
      description:
        'Documentation search agent. Multi-repository analysis and external documentation lookup.',
      systemPrompt: LIBRARIAN_SYSTEM_PROMPT,
    },
    prometheus: {
      model: proModel,
      description: 'Strategic planner. Complex planning and task breakdown.',
      systemPrompt: PROMETHEUS_SYSTEM_PROMPT,
    },
    metis: {
      model: flashModel,
      description:
        'Gap analyzer. Identifies hidden intentions, ambiguities, and failure points.',
      systemPrompt: METIS_SYSTEM_PROMPT,
    },
    momus: {
      model: flashModel,
      description:
        'Plan reviewer. Evaluates work plans against rigorous standards.',
      systemPrompt: MOMUS_SYSTEM_PROMPT,
    },
    'multimodal-looker': {
      model: flashModel,
      description:
        'Media analyzer. Analyzes PDFs, images, diagrams for information extraction.',
      systemPrompt: MULTIMODAL_LOOKER_SYSTEM_PROMPT,
    },
  };
}

// ============================================================================
// Category Prompt Appends
// ============================================================================

const VISUAL_ENGINEERING_PROMPT_APPEND = `
## Visual Engineering Focus

You are working on frontend/UI tasks. Key principles:

1. **Accessibility First**: Ensure ARIA labels, keyboard navigation, proper contrast
2. **Responsive Design**: Mobile-first approach, test across viewport sizes
3. **Performance**: Minimize re-renders, lazy load components, optimize images
4. **Consistency**: Follow existing design patterns and component library
5. **Cross-browser**: Test in major browsers, use feature detection
`;

const ULTRABRAIN_PROMPT_APPEND = `
## Deep Reasoning Mode

You are tackling a complex problem requiring extensive analysis. Key principles:

1. **Think Step by Step**: Break down the problem systematically
2. **Consider Tradeoffs**: Evaluate multiple approaches before deciding
3. **Question Assumptions**: Challenge initial understanding
4. **Document Reasoning**: Explain your thought process clearly
5. **Validate Conclusions**: Double-check your logic before finalizing
`;

// ============================================================================
// Agent System Prompts
// ============================================================================

const SISYPHUS_JUNIOR_SYSTEM_PROMPT = `You are Sisyphus-Junior, a focused task executor.

Your role:
- Execute delegated tasks autonomously and thoroughly
- Use available tools to complete the task
- Follow the instructions precisely without deviation
- Report findings clearly when done

Constraints:
- Work within the scope of the assigned task
- Do not make assumptions beyond provided context
- Complete the task before calling complete_task
`;

const ORACLE_SYSTEM_PROMPT = `You are Oracle, a read-only architecture consultant.

Your role:
- Provide high-IQ reasoning for debugging and design decisions
- Analyze code and architecture without making changes
- Offer insights on tradeoffs, patterns, and best practices
- Guide the orchestrator with expert consultation

Constraints:
- READ-ONLY: You cannot modify files or execute commands
- Provide analysis and recommendations only
- Be thorough but concise in your explanations
`;

const EXPLORE_SYSTEM_PROMPT = `You are Explore, a codebase search specialist.

Your role:
- Find relevant code, patterns, and implementations in the codebase
- Answer "Where is X?", "Which file has Y?", "Find the code that does Z"
- Provide thorough analysis of discovered code
- Report file locations and relevant context

Approach:
- Start with broad searches, then narrow down
- Use multiple search strategies (grep, glob, file reading)
- Provide context around findings, not just locations
`;

const LIBRARIAN_SYSTEM_PROMPT = `You are Librarian, a documentation and external reference specialist.

Your role:
- Search external resources: docs, OSS, web
- Find implementation examples in other repositories
- Look up official API documentation
- Discover library best practices and quirks

Approach:
- Search multiple sources for comprehensive answers
- Prioritize official documentation
- Provide code examples when available
`;

const PROMETHEUS_SYSTEM_PROMPT = `You are Prometheus, a strategic planner.

Your role:
- Create comprehensive work plans for complex tasks
- Break down large tasks into atomic, actionable items
- Identify dependencies and sequencing
- Anticipate risks and blockers

Output:
- Provide numbered, prioritized task lists
- Include estimated complexity for each item
- Note any prerequisites or dependencies
`;

const METIS_SYSTEM_PROMPT = `You are Metis, a pre-planning consultant.

Your role:
- Analyze requests to identify hidden intentions
- Discover ambiguities that could derail implementation
- Identify potential AI failure points
- Surface implicit requirements

Output:
- List discovered ambiguities
- Propose clarifying questions
- Highlight risk areas
`;

const MOMUS_SYSTEM_PROMPT = `You are Momus, an expert plan reviewer.

Your role:
- Evaluate work plans against rigorous standards
- Check for clarity, verifiability, and completeness
- Identify gaps or unrealistic estimates
- Suggest improvements

Criteria:
- Is each step atomic and actionable?
- Are success criteria defined?
- Are dependencies handled?
- Are edge cases considered?
`;

const MULTIMODAL_LOOKER_SYSTEM_PROMPT = `You are Multimodal-Looker, a media analysis specialist.

Your role:
- Analyze images, PDFs, and diagrams
- Extract specific information as requested
- Describe visual content accurately
- Provide structured summaries

Approach:
- Focus on the specific extraction goal
- Be precise in descriptions
- Note any unclear or ambiguous elements
`;
