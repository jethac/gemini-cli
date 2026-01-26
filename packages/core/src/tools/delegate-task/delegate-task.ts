/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';
import type { ToolResult, ToolInvocation } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { LocalAgentExecutor } from '../../agents/local-executor.js';
import type { LocalAgentDefinition, AgentInputs } from '../../agents/types.js';
import {
  DELEGATE_TASK_TOOL_NAME,
  TASK_CATEGORIES,
  AGENT_TYPES,
  getDefaultCategoryConfigs,
  getDefaultAgentTypeConfigs,
} from './constants.js';
import type { DelegateTaskParams, DelegateTaskResult } from './types.js';
import { BackgroundTaskManager } from './task-manager.js';
import { ToolErrorType } from '../tool-error.js';

/**
 * Zod schema for delegate_task parameters.
 */
const delegateTaskSchema = z
  .object({
    prompt: z.string().describe('The task prompt for the agent to execute.'),
    description: z
      .string()
      .describe('Short description of the task (3-5 words).'),
    category: z
      .enum(TASK_CATEGORIES)
      .optional()
      .describe(
        'Category for task routing. Mutually exclusive with subagent_type.',
      ),
    subagent_type: z
      .enum(AGENT_TYPES)
      .optional()
      .describe(
        'Direct agent type selection. Mutually exclusive with category.',
      ),
    load_skills: z
      .array(z.string())
      .describe("Skill names to load into the agent's context."),
    run_in_background: z
      .boolean()
      .describe(
        'Whether to run the task in background. true=async, false=sync.',
      ),
    session_id: z
      .string()
      .optional()
      .describe('Session ID to continue an existing session.'),
  })
  .refine(
    (data) => {
      // Either category or subagent_type, but not both
      const hasCategory = data.category !== undefined;
      const hasSubagentType = data.subagent_type !== undefined;
      return !(hasCategory && hasSubagentType);
    },
    {
      message: 'Provide EITHER category OR subagent_type, not both.',
    },
  );

/**
 * Tool invocation for delegate_task.
 */
class DelegateTaskInvocation extends BaseToolInvocation<
  DelegateTaskParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DelegateTaskParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { category, subagent_type, description } = this.params;
    const routing = category
      ? `category: ${category}`
      : subagent_type
        ? `agent: ${subagent_type}`
        : 'default agent';
    return `Delegating task "${description}" via ${routing}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { prompt, description, run_in_background, session_id, load_skills } =
      this.params;

    // Validate required parameters
    if (load_skills === undefined) {
      return this.errorResult(
        "'load_skills' parameter is REQUIRED. Pass an empty array if no skills needed.",
      );
    }

    if (run_in_background === undefined) {
      return this.errorResult("'run_in_background' parameter is REQUIRED.");
    }

    // Resolve skills
    const skillContent = await this.resolveSkills(load_skills);
    if (skillContent.error) {
      return this.errorResult(skillContent.error);
    }

    // Determine target agent, model, and thinking budget
    const { agent, model, thinkingBudget, systemPrompt } =
      this.resolveAgentAndModel();

    // Handle session continuation
    if (session_id) {
      return this.handleSessionContinuation(
        session_id,
        prompt,
        signal,
        skillContent.content,
      );
    }

    // Create a new session for this task
    const taskManager = BackgroundTaskManager.getInstance();
    const session = taskManager.createSession(
      agent,
      model,
      thinkingBudget,
      systemPrompt,
    );

    // Create agent definition
    const agentDefinition = this.createAgentDefinition(
      agent,
      model,
      thinkingBudget,
      systemPrompt,
      skillContent.content,
    );

    // Execute based on run_in_background
    if (run_in_background) {
      return this.executeBackground(
        agentDefinition,
        description,
        prompt,
        session.session_id,
      );
    } else {
      return this.executeSync(
        agentDefinition,
        prompt,
        signal,
        session.session_id,
      );
    }
  }

  private async resolveSkills(
    skillNames: string[],
  ): Promise<{ content?: string; error?: string }> {
    if (skillNames.length === 0) {
      return { content: '' };
    }

    const skillManager = this.config.getSkillManager();
    const resolvedSkills: string[] = [];
    const notFound: string[] = [];

    for (const name of skillNames) {
      const skill = skillManager.getSkill(name);
      if (skill) {
        resolvedSkills.push(`<skill name="${skill.name}">
${skill.body}
</skill>`);
      } else {
        notFound.push(name);
      }
    }

    if (notFound.length > 0) {
      const available = skillManager
        .getSkills()
        .map((s) => s.name)
        .join(', ');
      return {
        error: `Skills not found: ${notFound.join(', ')}. Available skills: ${available}`,
      };
    }

    return { content: resolvedSkills.join('\n\n') };
  }

  private resolveAgentAndModel(): {
    agent: string;
    model: string;
    thinkingBudget: number;
    systemPrompt: string;
  } {
    const { category, subagent_type } = this.params;

    if (category) {
      const categoryConfigs = getDefaultCategoryConfigs();
      const config = categoryConfigs[category];
      const agentConfigs = getDefaultAgentTypeConfigs();
      const defaultAgent = agentConfigs['sisyphus-junior'];

      return {
        agent: 'sisyphus-junior',
        model: config.model,
        thinkingBudget: config.thinkingBudget,
        systemPrompt: defaultAgent.systemPrompt + (config.promptAppend || ''),
      };
    }

    if (subagent_type) {
      const agentConfigs = getDefaultAgentTypeConfigs();
      const config = agentConfigs[subagent_type];
      return {
        agent: subagent_type,
        model: config.model,
        thinkingBudget: config.thinkingBudget,
        systemPrompt: config.systemPrompt,
      };
    }

    // Default to sisyphus-junior
    const agentConfigs = getDefaultAgentTypeConfigs();
    const defaultAgent = agentConfigs['sisyphus-junior'];
    return {
      agent: 'sisyphus-junior',
      model: defaultAgent.model,
      thinkingBudget: defaultAgent.thinkingBudget,
      systemPrompt: defaultAgent.systemPrompt,
    };
  }

  private async handleSessionContinuation(
    sessionId: string,
    prompt: string,
    signal: AbortSignal,
    skillContent?: string,
  ): Promise<ToolResult> {
    const taskManager = BackgroundTaskManager.getInstance();
    const session = taskManager.getSession(sessionId);

    if (!session) {
      return this.errorResult(
        `Session "${sessionId}" not found. Start a new task without session_id.`,
      );
    }

    // Add the new user message to session history
    taskManager.addSessionMessage(sessionId, 'user', prompt);

    // Build conversation context from session history
    const conversationContext = session.messages
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n\n');

    // Create agent definition with conversation context
    const agentDefinition = this.createAgentDefinition(
      session.agent,
      session.model,
      session.thinkingBudget,
      session.systemPrompt,
      skillContent,
    );

    // Modify the system prompt to include conversation history
    const systemPromptWithHistory = `${agentDefinition.promptConfig.systemPrompt}

## Previous Conversation
${conversationContext}

## Current Request
Continue the conversation. The user's new message is provided as the task input.`;

    agentDefinition.promptConfig.systemPrompt = systemPromptWithHistory;

    try {
      const executor = await LocalAgentExecutor.create(
        agentDefinition,
        this.config,
      );

      const inputs: AgentInputs = { task: prompt };
      const output = await executor.run(inputs, signal);

      // Add the assistant response to session history
      taskManager.addSessionMessage(sessionId, 'assistant', output.result);

      const result: DelegateTaskResult = {
        session_id: sessionId,
        status: 'completed',
        agent: session.agent,
        model: session.model,
        result: output.result,
      };

      return {
        llmContent: this.formatResult(result),
        returnDisplay: `Session ${sessionId} continued`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return this.errorResult(`Session continuation failed: ${errorMessage}`);
    }
  }

  private createAgentDefinition(
    agent: string,
    model: string,
    thinkingBudget: number,
    systemPrompt: string,
    skillContent?: string,
  ): LocalAgentDefinition {
    const fullSystemPrompt = skillContent
      ? `${systemPrompt}\n\n## Loaded Skills\n\n${skillContent}`
      : systemPrompt;

    return {
      kind: 'local',
      name: `delegate-${agent}`,
      description: `Delegated task executor: ${agent}`,
      inputConfig: {
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'The task to execute' },
          },
          required: ['task'],
        },
      },
      promptConfig: {
        systemPrompt: fullSystemPrompt,
        query: '${task}',
      },
      modelConfig: {
        model,
        generateContentConfig: {
          thinkingConfig: {
            thinkingBudget,
          },
        },
      },
      runConfig: {
        maxTimeMinutes: 30,
        maxTurns: 50,
      },
      // Use all available tools for the delegated agent
      toolConfig: undefined,
    };
  }

  private async executeSync(
    agentDefinition: LocalAgentDefinition,
    prompt: string,
    signal: AbortSignal,
    sessionId: string,
  ): Promise<ToolResult> {
    const taskManager = BackgroundTaskManager.getInstance();

    // Record the user message
    taskManager.addSessionMessage(sessionId, 'user', prompt);

    try {
      const executor = await LocalAgentExecutor.create(
        agentDefinition,
        this.config,
      );

      const inputs: AgentInputs = { task: prompt };
      const output = await executor.run(inputs, signal);

      // Record the assistant response
      taskManager.addSessionMessage(sessionId, 'assistant', output.result);

      const result: DelegateTaskResult = {
        session_id: sessionId,
        status: 'completed',
        agent: agentDefinition.name,
        model: agentDefinition.modelConfig.model ?? 'unknown',
        result: output.result,
      };

      return {
        llmContent: this.formatResult(result),
        returnDisplay: `Task completed by ${result.agent}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return this.errorResult(`Task execution failed: ${errorMessage}`);
    }
  }

  private executeBackground(
    agentDefinition: LocalAgentDefinition,
    description: string,
    prompt: string,
    sessionId: string,
  ): ToolResult {
    const taskManager = BackgroundTaskManager.getInstance();
    const taskInfo = taskManager.createTask(description, agentDefinition.name);

    // Link the task to the existing session
    taskManager.linkTaskToSession(taskInfo.task_id, sessionId);

    const signal = taskManager.getAbortSignal(taskInfo.task_id)!;

    // Record the user message
    taskManager.addSessionMessage(sessionId, 'user', prompt);

    // Start the task asynchronously
    const taskPromise = (async (): Promise<DelegateTaskResult> => {
      taskManager.startTask(taskInfo.task_id);

      try {
        const executor = await LocalAgentExecutor.create(
          agentDefinition,
          this.config,
        );

        const inputs: AgentInputs = { task: prompt };
        const output = await executor.run(inputs, signal);

        // Record the assistant response
        taskManager.addSessionMessage(sessionId, 'assistant', output.result);

        taskManager.completeTask(taskInfo.task_id, output.result);

        return {
          task_id: taskInfo.task_id,
          session_id: sessionId,
          status: 'completed',
          agent: agentDefinition.name,
          model: agentDefinition.modelConfig.model ?? 'unknown',
          result: output.result,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        taskManager.failTask(taskInfo.task_id, errorMessage);

        return {
          task_id: taskInfo.task_id,
          session_id: sessionId,
          status: 'failed',
          agent: agentDefinition.name,
          model: agentDefinition.modelConfig.model ?? 'unknown',
          error: errorMessage,
        };
      }
    })();

    taskManager.setTaskPromise(taskInfo.task_id, taskPromise);

    const result: DelegateTaskResult = {
      task_id: taskInfo.task_id,
      session_id: sessionId,
      status: 'running',
      agent: agentDefinition.name,
      model: agentDefinition.modelConfig.model ?? 'unknown',
    };

    return {
      llmContent: `Background task started.

Task ID: ${result.task_id}
Session ID: ${result.session_id}
Description: ${description}
Agent: ${result.agent}
Model: ${result.model}
Status: ${result.status}

Use \`background_output\` with task_id="${result.task_id}" to check progress or get results.
Use \`session_id="${result.session_id}"\` in a future delegate_task call to continue this conversation.`,
      returnDisplay: `Background task started: ${description}`,
    };
  }

  private formatResult(result: DelegateTaskResult): string {
    if (result.status === 'completed') {
      return `Task completed successfully.

Session ID: ${result.session_id}
Agent: ${result.agent}
Model: ${result.model}

Result:
${result.result}`;
    }

    if (result.status === 'failed') {
      return `Task failed.

Session ID: ${result.session_id}
Agent: ${result.agent}
Model: ${result.model}

Error: ${result.error}`;
    }

    return `Task status: ${result.status}

Task ID: ${result.task_id}
Session ID: ${result.session_id}
Agent: ${result.agent}
Model: ${result.model}`;
  }

  private errorResult(message: string): ToolResult {
    return {
      llmContent: `Error: ${message}`,
      returnDisplay: `Error: ${message}`,
      error: {
        message,
        type: ToolErrorType.INVALID_TOOL_PARAMS,
      },
    };
  }
}

/**
 * The delegate_task tool for spawning agent tasks with category-based or direct agent selection.
 */
export class DelegateTaskTool extends BaseDeclarativeTool<
  DelegateTaskParams,
  ToolResult
> {
  static readonly Name = DELEGATE_TASK_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const categoryList = TASK_CATEGORIES.join(', ');
    const agentList = AGENT_TYPES.join(', ');

    super(
      DelegateTaskTool.Name,
      'Delegate Task',
      `Spawn agent task with category-based or direct agent selection.

MUTUALLY EXCLUSIVE: Provide EITHER category OR subagent_type, not both (unless continuing a session).

- load_skills: ALWAYS REQUIRED. Pass at least one skill name or empty array.
- category: Use predefined category → Spawns agent with category-optimized model
  Available categories: ${categoryList}
- subagent_type: Use specific agent directly
  Available agents: ${agentList}
- run_in_background: true=async (returns task_id), false=sync (waits for result). REQUIRED.
- session_id: Existing session to continue (from previous task output).

**WHEN TO USE session_id:**
- Task failed/incomplete → session_id with "fix: [specific issue]"
- Need follow-up on previous result → session_id with additional question
- Multi-turn conversation with same agent → always session_id`,
      Kind.Think,
      zodToJsonSchema(delegateTaskSchema),
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: DelegateTaskParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DelegateTaskParams, ToolResult> {
    return new DelegateTaskInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Delegate Task',
    );
  }
}
