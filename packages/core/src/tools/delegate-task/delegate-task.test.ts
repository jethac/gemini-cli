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
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';

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
      const configs = getDefaultCategoryConfigs();
      for (const category of TASK_CATEGORIES) {
        expect(configs[category]).toBeDefined();
        expect(configs[category].model).toBeDefined();
        expect(configs[category].thinkingBudget).toBeDefined();
        expect(configs[category].description).toBeDefined();
      }
    });

    it('should always use Gemini 3 Flash for visual-engineering', () => {
      const configs = getDefaultCategoryConfigs();
      expect(configs['visual-engineering'].model).toBe(
        'gemini-3-flash-preview',
      );
    });

    it('should always use Gemini 3 Pro for ultrabrain with max thinking', () => {
      const configs = getDefaultCategoryConfigs();
      expect(configs['ultrabrain'].model).toBe('gemini-3-pro-preview');
      expect(configs['ultrabrain'].thinkingBudget).toBe(32768);
    });

    it('should use Gemini 3 Flash for quick with minimal thinking', () => {
      const configs = getDefaultCategoryConfigs();
      expect(configs['quick'].model).toBe('gemini-3-flash-preview');
      expect(configs['quick'].thinkingBudget).toBe(1024);
    });

    it('should have appropriate thinking budgets for all categories', () => {
      const configs = getDefaultCategoryConfigs();
      // Pro model categories should have higher thinking
      expect(configs['ultrabrain'].thinkingBudget).toBeGreaterThan(
        configs['quick'].thinkingBudget,
      );
      expect(configs['artistry'].thinkingBudget).toBeGreaterThan(
        configs['quick'].thinkingBudget,
      );
    });
  });

  describe('getDefaultAgentTypeConfigs', () => {
    it('should return configs for all agent types', () => {
      const configs = getDefaultAgentTypeConfigs();
      for (const agentType of AGENT_TYPES) {
        expect(configs[agentType]).toBeDefined();
        expect(configs[agentType].model).toBeDefined();
        expect(configs[agentType].thinkingBudget).toBeDefined();
        expect(configs[agentType].description).toBeDefined();
        expect(configs[agentType].systemPrompt).toBeDefined();
      }
    });

    it('should use Gemini 3 Flash for sisyphus-junior', () => {
      const configs = getDefaultAgentTypeConfigs();
      expect(configs['sisyphus-junior'].model).toBe('gemini-3-flash-preview');
    });

    it('should use Gemini 3 Pro for oracle with max thinking', () => {
      const configs = getDefaultAgentTypeConfigs();
      expect(configs['oracle'].model).toBe('gemini-3-pro-preview');
      expect(configs['oracle'].thinkingBudget).toBe(32768);
    });

    it('should use lower thinking for search agents', () => {
      const configs = getDefaultAgentTypeConfigs();
      expect(configs['explore'].thinkingBudget).toBeLessThan(
        configs['oracle'].thinkingBudget,
      );
      expect(configs['librarian'].thinkingBudget).toBeLessThan(
        configs['oracle'].thinkingBudget,
      );
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

describe('Session Management', () => {
  let manager: BackgroundTaskManager;

  beforeEach(() => {
    BackgroundTaskManager.resetInstance();
    manager = BackgroundTaskManager.getInstance();
  });

  afterEach(() => {
    BackgroundTaskManager.resetInstance();
  });

  describe('createSession', () => {
    it('should create session with unique ID', () => {
      const session1 = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'You are an oracle',
      );
      const session2 = manager.createSession(
        'explore',
        'gemini-3-flash-preview',
        4096,
        'You are an explorer',
      );

      expect(session1.session_id).toBeDefined();
      expect(session2.session_id).toBeDefined();
      expect(session1.session_id).not.toBe(session2.session_id);
      expect(session1.session_id).toMatch(/^ses_/);
    });

    it('should store session configuration correctly', () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'You are an oracle',
      );

      expect(session.agent).toBe('oracle');
      expect(session.model).toBe('gemini-3-pro-preview');
      expect(session.thinkingBudget).toBe(32768);
      expect(session.systemPrompt).toBe('You are an oracle');
      expect(session.messages).toEqual([]);
      expect(session.created_at).toBeInstanceOf(Date);
      expect(session.last_updated).toBeInstanceOf(Date);
    });
  });

  describe('getSession', () => {
    it('should retrieve existing session', () => {
      const created = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );
      const retrieved = manager.getSession(created.session_id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.session_id).toBe(created.session_id);
      expect(retrieved?.agent).toBe('oracle');
    });

    it('should return undefined for non-existent session', () => {
      const session = manager.getSession('non_existent_session');
      expect(session).toBeUndefined();
    });
  });

  describe('addSessionMessage', () => {
    it('should add messages to session', () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      manager.addSessionMessage(session.session_id, 'user', 'Hello, oracle!');
      manager.addSessionMessage(
        session.session_id,
        'assistant',
        'Hello! How can I help you?',
      );

      const messages = manager.getSessionMessages(session.session_id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello, oracle!');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Hello! How can I help you?');
    });

    it('should update last_updated timestamp', async () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      const originalUpdated = session.last_updated.getTime();

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.addSessionMessage(session.session_id, 'user', 'Test message');

      const updated = manager.getSession(session.session_id);
      expect(updated?.last_updated.getTime()).toBeGreaterThan(originalUpdated);
    });

    it('should not throw for non-existent session', () => {
      expect(() => {
        manager.addSessionMessage('non_existent', 'user', 'Test message');
      }).not.toThrow();
    });
  });

  describe('getSessionMessages', () => {
    it('should return empty array for non-existent session', () => {
      const messages = manager.getSessionMessages('non_existent');
      expect(messages).toEqual([]);
    });

    it('should return messages in order', () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      manager.addSessionMessage(session.session_id, 'user', 'First');
      manager.addSessionMessage(session.session_id, 'assistant', 'Second');
      manager.addSessionMessage(session.session_id, 'user', 'Third');

      const messages = manager.getSessionMessages(session.session_id);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('getSessionByTaskId', () => {
    it('should return session linked to task', () => {
      const task = manager.createTask('Test task', 'oracle');
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      manager.linkTaskToSession(task.task_id, session.session_id);

      const foundSession = manager.getSessionByTaskId(task.task_id);
      expect(foundSession).toBeDefined();
      expect(foundSession?.session_id).toBe(session.session_id);
    });

    it('should return undefined for task without session', () => {
      const task = manager.createTask('Test task', 'oracle');
      // Don't link to any session

      const foundSession = manager.getSessionByTaskId(task.task_id);
      // Task has a default session_id but no matching session in the sessions map
      expect(foundSession).toBeUndefined();
    });

    it('should return undefined for non-existent task', () => {
      const session = manager.getSessionByTaskId('non_existent_task');
      expect(session).toBeUndefined();
    });
  });

  describe('linkTaskToSession', () => {
    it('should link task to session', () => {
      const task = manager.createTask('Test task', 'oracle');
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      const originalSessionId = task.session_id;
      manager.linkTaskToSession(task.task_id, session.session_id);

      const updatedTask = manager.getTask(task.task_id);
      expect(updatedTask?.session_id).toBe(session.session_id);
      expect(updatedTask?.session_id).not.toBe(originalSessionId);
    });

    it('should not throw for non-existent task', () => {
      expect(() => {
        manager.linkTaskToSession('non_existent', 'some_session');
      }).not.toThrow();
    });
  });

  describe('cleanupSessions', () => {
    it('should remove old sessions', async () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      // Manually backdate the session for testing
      const oldDate = new Date(Date.now() - 7200000); // 2 hours ago
      const storedSession = manager.getSession(session.session_id);
      if (storedSession) {
        storedSession.last_updated = oldDate;
      }

      const count = manager.cleanupSessions(3600000); // 1 hour max age

      expect(count).toBe(1);
      expect(manager.getSession(session.session_id)).toBeUndefined();
    });

    it('should keep recent sessions', () => {
      const session = manager.createSession(
        'oracle',
        'gemini-3-pro-preview',
        32768,
        'System prompt',
      );

      const count = manager.cleanupSessions(3600000); // 1 hour max age

      expect(count).toBe(0);
      expect(manager.getSession(session.session_id)).toBeDefined();
    });
  });

  describe('task creates session_id', () => {
    it('should include session_id in newly created tasks', () => {
      const task = manager.createTask('Test task', 'oracle');

      expect(task.session_id).toBeDefined();
      expect(task.session_id).toMatch(/^ses_/);
    });
  });
});
