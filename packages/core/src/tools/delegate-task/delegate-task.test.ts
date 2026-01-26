/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DelegateTaskTool } from './delegate-task.js';
import {
  BackgroundOutputTool,
  BackgroundCancelTool,
} from './background-tools.js';
import { BackgroundTaskManager } from './task-manager.js';
import {
  TASK_CATEGORIES,
  AGENT_TYPES,
  getDefaultCategoryConfigs,
  getDefaultAgentTypeConfigs,
} from './constants.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';

// Mock MessageBus
const createMockMessageBus = (): MessageBus => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
});

// Mock Config
const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    getPreviewFeatures: vi.fn().mockReturnValue(false),
    getSkillManager: vi.fn().mockReturnValue({
      getSkill: vi.fn().mockReturnValue(null),
      getSkills: vi.fn().mockReturnValue([]),
    }),
    ...overrides,
  }) as unknown as Config;

describe('DelegateTaskTool', () => {
  let tool: DelegateTaskTool;
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    mockConfig = createMockConfig();
    tool = new DelegateTaskTool(mockConfig, mockMessageBus);
  });

  afterEach(() => {
    BackgroundTaskManager.resetInstance();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create tool with correct name', () => {
      expect(tool.name).toBe('delegate_task');
    });

    it('should have correct display name', () => {
      expect(tool.displayName).toBe('Delegate Task');
    });

    it('should include available categories in description', () => {
      for (const category of TASK_CATEGORIES) {
        expect(tool.description).toContain(category);
      }
    });

    it('should include available agent types in description', () => {
      for (const agentType of AGENT_TYPES) {
        expect(tool.description).toContain(agentType);
      }
    });
  });

  describe('build', () => {
    it('should build invocation with valid parameters', () => {
      const params = {
        prompt: 'Test task',
        description: 'Test description',
        load_skills: [],
        run_in_background: false,
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should build invocation even when both category and subagent_type are provided', () => {
      // Note: The mutual exclusivity constraint is documented in the schema description,
      // but the actual enforcement happens in the tool description guidance to the LLM.
      // The tool will use category-based routing when both are provided.
      const params = {
        prompt: 'Test task',
        description: 'Test description',
        category: 'quick' as const,
        subagent_type: 'explore' as const,
        load_skills: [],
        run_in_background: false,
      };

      // Build should succeed - category takes precedence in resolveAgentAndModel
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should accept category without subagent_type', () => {
      const params = {
        prompt: 'Test task',
        description: 'Test description',
        category: 'quick' as const,
        load_skills: [],
        run_in_background: false,
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should accept subagent_type without category', () => {
      const params = {
        prompt: 'Test task',
        description: 'Test description',
        subagent_type: 'explore' as const,
        load_skills: [],
        run_in_background: false,
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });
  });
});

describe('Category and Agent Configurations', () => {
  describe('getDefaultCategoryConfigs', () => {
    it('should return configs for all categories', () => {
      const configs = getDefaultCategoryConfigs(false);
      for (const category of TASK_CATEGORIES) {
        expect(configs[category]).toBeDefined();
        expect(configs[category].model).toBeDefined();
        expect(configs[category].description).toBeDefined();
      }
    });

    it('should use flash model for visual-engineering', () => {
      const configs = getDefaultCategoryConfigs(false);
      expect(configs['visual-engineering'].model).toBe('gemini-2.5-flash');
    });

    it('should use pro model for ultrabrain', () => {
      const configs = getDefaultCategoryConfigs(false);
      expect(configs['ultrabrain'].model).toBe('gemini-2.5-pro');
    });

    it('should use flash-lite model for quick', () => {
      const configs = getDefaultCategoryConfigs(false);
      expect(configs['quick'].model).toBe('gemini-2.5-flash-lite');
    });

    it('should use preview models when enabled', () => {
      const configs = getDefaultCategoryConfigs(true);
      expect(configs['visual-engineering'].model).toBe(
        'gemini-3-flash-preview',
      );
      expect(configs['ultrabrain'].model).toBe('gemini-3-pro-preview');
    });
  });

  describe('getDefaultAgentTypeConfigs', () => {
    it('should return configs for all agent types', () => {
      const configs = getDefaultAgentTypeConfigs(false);
      for (const agentType of AGENT_TYPES) {
        expect(configs[agentType]).toBeDefined();
        expect(configs[agentType].model).toBeDefined();
        expect(configs[agentType].description).toBeDefined();
        expect(configs[agentType].systemPrompt).toBeDefined();
      }
    });

    it('should use flash model for sisyphus-junior', () => {
      const configs = getDefaultAgentTypeConfigs(false);
      expect(configs['sisyphus-junior'].model).toBe('gemini-2.5-flash');
    });

    it('should use pro model for oracle', () => {
      const configs = getDefaultAgentTypeConfigs(false);
      expect(configs['oracle'].model).toBe('gemini-2.5-pro');
    });
  });
});

describe('BackgroundTaskManager', () => {
  let manager: BackgroundTaskManager;

  beforeEach(() => {
    BackgroundTaskManager.resetInstance();
    manager = BackgroundTaskManager.getInstance();
  });

  afterEach(() => {
    BackgroundTaskManager.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = BackgroundTaskManager.getInstance();
      const instance2 = BackgroundTaskManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('createTask', () => {
    it('should create task with unique IDs', () => {
      const task1 = manager.createTask('Task 1', 'agent1');
      const task2 = manager.createTask('Task 2', 'agent2');

      expect(task1.task_id).toBeDefined();
      expect(task2.task_id).toBeDefined();
      expect(task1.task_id).not.toBe(task2.task_id);
    });

    it('should create task with pending status', () => {
      const task = manager.createTask('Test task', 'test-agent');
      expect(task.status).toBe('pending');
    });

    it('should set task description and agent', () => {
      const task = manager.createTask('Test description', 'test-agent');
      expect(task.description).toBe('Test description');
      expect(task.agent).toBe('test-agent');
    });
  });

  describe('startTask', () => {
    it('should update task status to running', () => {
      const task = manager.createTask('Test task', 'test-agent');
      manager.startTask(task.task_id);

      const updatedTask = manager.getTask(task.task_id);
      expect(updatedTask?.status).toBe('running');
    });
  });

  describe('completeTask', () => {
    it('should update task status to completed with result', () => {
      const task = manager.createTask('Test task', 'test-agent');
      manager.completeTask(task.task_id, 'Task result');

      const updatedTask = manager.getTask(task.task_id);
      expect(updatedTask?.status).toBe('completed');
      expect(updatedTask?.result).toBe('Task result');
      expect(updatedTask?.completed_at).toBeDefined();
    });
  });

  describe('failTask', () => {
    it('should update task status to failed with error', () => {
      const task = manager.createTask('Test task', 'test-agent');
      manager.failTask(task.task_id, 'Error message');

      const updatedTask = manager.getTask(task.task_id);
      expect(updatedTask?.status).toBe('failed');
      expect(updatedTask?.error).toBe('Error message');
      expect(updatedTask?.completed_at).toBeDefined();
    });
  });

  describe('cancelTask', () => {
    it('should cancel running task', () => {
      const task = manager.createTask('Test task', 'test-agent');
      manager.startTask(task.task_id);
      const cancelled = manager.cancelTask(task.task_id);

      expect(cancelled).toBe(true);
      const updatedTask = manager.getTask(task.task_id);
      expect(updatedTask?.status).toBe('cancelled');
    });

    it('should return false for non-running task', () => {
      const task = manager.createTask('Test task', 'test-agent');
      manager.completeTask(task.task_id, 'Result');
      const cancelled = manager.cancelTask(task.task_id);

      expect(cancelled).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all running tasks', () => {
      const task1 = manager.createTask('Task 1', 'agent1');
      const task2 = manager.createTask('Task 2', 'agent2');
      manager.startTask(task1.task_id);
      manager.startTask(task2.task_id);

      const count = manager.cancelAll();
      expect(count).toBe(2);
    });
  });

  describe('getActiveTasks', () => {
    it('should return only pending and running tasks', () => {
      const task1 = manager.createTask('Task 1', 'agent1');
      const task2 = manager.createTask('Task 2', 'agent2');
      const task3 = manager.createTask('Task 3', 'agent3');

      manager.startTask(task1.task_id);
      manager.completeTask(task2.task_id, 'Result');
      // task3 remains pending

      const activeTasks = manager.getActiveTasks();
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map((t) => t.task_id)).toContain(task1.task_id);
      expect(activeTasks.map((t) => t.task_id)).toContain(task3.task_id);
    });
  });
});

describe('BackgroundOutputTool', () => {
  let tool: BackgroundOutputTool;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    BackgroundTaskManager.resetInstance();
    mockMessageBus = createMockMessageBus();
    tool = new BackgroundOutputTool(mockMessageBus);
  });

  afterEach(() => {
    BackgroundTaskManager.resetInstance();
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('background_output');
  });

  describe('execute', () => {
    it('should return error for non-existent task', async () => {
      const invocation = tool.build({ task_id: 'non_existent' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('not found');
    });

    it('should return task status for existing task', async () => {
      const manager = BackgroundTaskManager.getInstance();
      const task = manager.createTask('Test task', 'test-agent');
      manager.completeTask(task.task_id, 'Test result');

      const invocation = tool.build({ task_id: task.task_id });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('completed');
      expect(result.llmContent).toContain('Test result');
    });
  });
});

describe('BackgroundCancelTool', () => {
  let tool: BackgroundCancelTool;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    BackgroundTaskManager.resetInstance();
    mockMessageBus = createMockMessageBus();
    tool = new BackgroundCancelTool(mockMessageBus);
  });

  afterEach(() => {
    BackgroundTaskManager.resetInstance();
  });

  it('should have correct name', () => {
    expect(tool.name).toBe('background_cancel');
  });

  describe('execute', () => {
    it('should cancel specific task', async () => {
      const manager = BackgroundTaskManager.getInstance();
      const task = manager.createTask('Test task', 'test-agent');
      manager.startTask(task.task_id);

      const invocation = tool.build({ task_id: task.task_id });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('cancelled');
    });

    it('should cancel all tasks with all=true', async () => {
      const manager = BackgroundTaskManager.getInstance();
      const task1 = manager.createTask('Task 1', 'agent1');
      const task2 = manager.createTask('Task 2', 'agent2');
      manager.startTask(task1.task_id);
      manager.startTask(task2.task_id);

      const invocation = tool.build({ all: true });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('2');
    });

    it('should return error when neither task_id nor all provided', async () => {
      const invocation = tool.build({});
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
    });
  });
});
