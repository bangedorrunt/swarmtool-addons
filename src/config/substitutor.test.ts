import { describe, it, expect } from 'vitest';
import { substituteModel } from './substitutor';
import { AgentModelConfig } from './types';

describe('substituteModel', () => {
  describe('basic substitution', () => {
    it('should replace model line when override exists for planner', () => {
      const prompt = `---
description: Planner prompt
mode: subagent
model: opencode/big-pickle
---
Content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/custom-planner' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toContain('model: opencode/custom-planner');
      expect(result).not.toContain('model: opencode/big-pickle');
    });

    it('should replace model line when override exists for worker', () => {
      const prompt = `---
description: Worker prompt
mode: subagent
model: opencode/glm-4.7-free
---
Content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/planner' },
        worker: { model: 'opencode/custom-worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'worker', config);

      expect(result).toContain('model: opencode/custom-worker');
      expect(result).not.toContain('model: opencode/glm-4.7-free');
    });

    it('should replace model line when override exists for researcher', () => {
      const prompt = `---
description: Researcher prompt
mode: subagent
model: opencode/grok-code
---
Content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/planner' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/custom-researcher' },
      };

      const result = substituteModel(prompt, 'researcher', config);

      expect(result).toContain('model: opencode/custom-researcher');
      expect(result).not.toContain('model: opencode/grok-code');
    });
  });

  describe('no substitution', () => {
    it('should return original prompt when no override exists for agent', () => {
      const prompt = `---
description: Worker prompt
mode: subagent
model: opencode/glm-4.7-free
---
Content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/custom-planner' },
        worker: { model: 'opencode/glm-4.7-free' }, // Same as original
        researcher: { model: 'opencode/custom-researcher' },
      };

      const result = substituteModel(prompt, 'worker', config);

      // Should return original unchanged since model is same
      expect(result).toBe(prompt);
    });

    it('should preserve all other content when substituting model', () => {
      const prompt = `---
description: Test prompt
mode: subagent
model: opencode/big-pickle
other: value
---
Main content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/new-model' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toContain('description: Test prompt');
      expect(result).toContain('mode: subagent');
      expect(result).toContain('other: value');
      expect(result).toContain('Main content');
      expect(result).toContain('model: opencode/new-model');
    });
  });

  describe('edge cases', () => {
    it('should handle prompts with multiple model-like lines correctly', () => {
      const prompt = `---
description: Test
mode: subagent
model: opencode/big-pickle
---
Content mentioning model: something else`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/new-model' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toContain('model: opencode/new-model');
      expect(result).toContain('model: something else'); // This should stay unchanged
    });

    it('should handle model lines with extra whitespace', () => {
      const prompt = `---
description: Test
mode: subagent
model:    opencode/big-pickle   
---
Content`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/new-model' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toContain('model: opencode/new-model');
      expect(result).not.toContain('opencode/big-pickle');
    });

    it('should return original prompt if model line not found', () => {
      const prompt = `---
description: Test
mode: subagent
---
Content without model line`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/new-model' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toBe(prompt);
    });
  });

  describe('real-world scenarios', () => {
    it('should work with actual worker.md prompt format', () => {
      const prompt = `---
description: Executes subtasks in a swarm - optimized for Memory Lane
mode: subagent
model: opencode/glm-4.7-free
---

You are a swarm worker agent. Your prompt contains a **MANDATORY SURVIVAL CHECKLIST** - follow it IN ORDER.`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/planner' },
        worker: { model: 'opencode/custom-worker-model' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'worker', config);

      expect(result).toContain('model: opencode/custom-worker-model');
      expect(result).toContain('Executes subtasks in a swarm');
      expect(result).toContain('MANDATORY SURVIVAL CHECKLIST');
    });

    it('should work with actual planner.md prompt format', () => {
      const prompt = `---
description: Strategic task decomposition for swarm coordination - optimized for Memory Lane
mode: subagent
model: opencode/big-pickle
---

You are a swarm planner. Decompose tasks into optimal parallel subtasks.`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/advanced-planner' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/researcher' },
      };

      const result = substituteModel(prompt, 'planner', config);

      expect(result).toContain('model: opencode/advanced-planner');
      expect(result).toContain('Strategic task decomposition');
    });

    it('should work with actual researcher.md prompt format', () => {
      const prompt = `---
description: READ-ONLY research agent - optimized for Memory Lane
mode: subagent
model: opencode/grok-code
---

You are a research agent. Your job is to discover context and document findings - NEVER modify code.`;

      const config: AgentModelConfig = {
        planner: { model: 'opencode/planner' },
        worker: { model: 'opencode/worker' },
        researcher: { model: 'opencode/smart-researcher' },
      };

      const result = substituteModel(prompt, 'researcher', config);

      expect(result).toContain('model: opencode/smart-researcher');
      expect(result).toContain('READ-ONLY research agent');
    });
  });
});
