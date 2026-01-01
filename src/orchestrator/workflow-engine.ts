/**
 * Workflow Engine - Declaration-Based Coordination
 *
 * This module implements a Markdown-based workflow engine that:
 * 1. Loads workflow definitions from .md files
 * 2. Parses phases, steps, and agent assignments
 * 3. Manages state transitions and result propagation
 * 4. Integrates with LEDGER.md for persistence
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { getEventDrivenLedger } from './event-driven-ledger';
import { spawnChildAgent, SpawnResult } from './session-coordination';
import { loadLedger, saveLedger, Ledger } from './ledger';

export interface WorkflowStep {
  agent: string;
  prompt: string;
  wait?: boolean;
  checkpoint?: boolean;
  context_keys?: string[];
}

export interface WorkflowPhase {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  trigger?: string[];
  entry_agent: string;
  phases: WorkflowPhase[];
}

export interface WorkflowState {
  workflow_id: string;
  current_phase_index: number;
  current_step_index: number;
  step_results: Record<string, any>;
  status: 'active' | 'paused' | 'completed' | 'failed';
}

export class WorkflowLoader {
  private workflowDir: string;

  constructor(workflowDir: string = join(process.cwd(), 'src/orchestrator/workflow')) {
    this.workflowDir = workflowDir;
  }

  /**
   * Load all workflows from the workflow directory
   */
  async loadAll(): Promise<WorkflowDefinition[]> {
    if (!existsSync(this.workflowDir)) return [];

    const files = await readdir(this.workflowDir);
    const workflows: WorkflowDefinition[] = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const wf = await this.parseFile(join(this.workflowDir, file));
        if (wf) workflows.push(wf);
      }
    }

    return workflows;
  }

  /**
   * Parse a single markdown workflow file
   */
  async parseFile(filePath: string): Promise<WorkflowDefinition | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      let frontmatter: any = {};
      let inFrontmatter = false;
      let yamlLines: string[] = [];

      // Extract frontmatter
      for (const line of lines) {
        if (line.trim() === '---') {
          if (!inFrontmatter) {
            inFrontmatter = true;
          } else {
            inFrontmatter = false;
            break;
          }
          continue;
        }
        if (inFrontmatter) {
          yamlLines.push(line);
        }
      }

      // Simple YAML parser for frontmatter
      yamlLines.forEach((line) => {
        const [key, ...val] = line.split(':');
        if (key && val) {
          let value = val.join(':').trim();
          if (value.startsWith('[') && value.endsWith(']')) {
            frontmatter[key.trim()] = value
              .slice(1, -1)
              .split(',')
              .map((s) => s.trim().replace(/['"]/g, ''));
          } else {
            frontmatter[key.trim()] = value.replace(/['"]/g, '');
          }
        }
      });

      const phases: WorkflowPhase[] = [];
      let currentPhase: WorkflowPhase | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Phase Header: ## Phase X: Name
        if (line.startsWith('## Phase')) {
          const name = line.replace(/^## Phase\s+\d+:\s+/, '').trim();
          currentPhase = { name, steps: [] };
          phases.push(currentPhase);
          continue;
        }

        // Step Item: - Agent: X
        if (currentPhase && line.startsWith('- Agent:')) {
          const agent = line.replace('- Agent:', '').trim();
          const step: WorkflowStep = { agent, prompt: '' };

          // Look ahead for prompt and options
          let j = i + 1;
          while (j < lines.length && lines[j].trim().startsWith('- ')) {
            const subLine = lines[j].trim();
            if (subLine.startsWith('- Prompt:')) {
              step.prompt = subLine.replace('- Prompt:', '').trim().replace(/^"|"$/g, '');
            } else if (subLine.startsWith('- Wait:')) {
              step.wait = subLine.replace('- Wait:', '').trim() === 'true';
            } else if (subLine.startsWith('- Checkpoint:')) {
              step.checkpoint = subLine.replace('- Checkpoint:', '').trim() === 'true';
            }
            j++;
          }
          currentPhase.steps.push(step);
        }
      }

      return {
        name: frontmatter.name || basename(filePath, '.md'),
        trigger: frontmatter.trigger,
        entry_agent: frontmatter.entry_agent,
        phases,
      };
    } catch (e) {
      console.error(`[WorkflowLoader] Failed to parse ${filePath}:`, e);
      return null;
    }
  }
}

export class WorkflowProcessor {
  private client: any;
  private workflow: WorkflowDefinition;
  private state: WorkflowState;

  constructor(client: any, workflow: WorkflowDefinition, initialState?: WorkflowState) {
    this.client = client;
    this.workflow = workflow;
    this.state = initialState || {
      workflow_id: workflow.name,
      current_phase_index: 0,
      current_step_index: 0,
      step_results: {},
      status: 'active',
    };
  }

  /**
   * Execute the workflow from current state
   */
  async execute(parentSessionId: string, initialTask: string): Promise<void> {
    const ledger = getEventDrivenLedger();

    await ledger.emit('ledger.epic.started' as any, {
      epicId: `wf-${this.state.workflow_id}`,
      epicTitle: `Workflow: ${this.workflow.name}`,
    });

    while (this.state.current_phase_index < this.workflow.phases.length) {
      const phase = this.workflow.phases[this.state.current_phase_index];

      while (this.state.current_step_index < phase.steps.length) {
        const step = phase.steps[this.state.current_step_index];

        // 1. Prepare Prompt (replace variables)
        let prompt = step.prompt.replace('{{task}}', initialTask);
        // Add previous results context if needed
        if (Object.keys(this.state.step_results).length > 0) {
          prompt +=
            '\n\nPrevious steps summary:\n' + JSON.stringify(this.state.step_results, null, 2);
        }

        // 2. Log Step
        console.log(
          `[Workflow] Phase ${this.state.current_phase_index + 1}, Step ${this.state.current_step_index + 1}: ${step.agent}`
        );

        // 3. Handle Checkpoint
        if (step.checkpoint) {
          this.state.status = 'paused';
          await this.saveToLedger();
          await ledger.emit('ledger.task.yielded' as any, {
            epicId: `wf-${this.state.workflow_id}`,
            taskId: `step-${this.state.current_phase_index}-${this.state.current_step_index}`,
            result: 'Workflow reached checkpoint. User approval required.',
          });
          return; // Stop and wait for resume
        }

        // 4. Spawn Agent
        const result: SpawnResult = await spawnChildAgent(this.client, step.agent, prompt, {
          parentSessionId,
          waitForCompletion: step.wait !== false,
        });

        // 5. Store Result
        if (result.success && result.result) {
          this.state.step_results[
            `phase${this.state.current_phase_index}_step${this.state.current_step_index}`
          ] = {
            agent: step.agent,
            output: result.result.slice(0, 1000), // Truncate for ledger
          };
        }

        this.state.current_step_index++;
        await this.saveToLedger();
      }

      this.state.current_phase_index++;
      this.state.current_step_index = 0;
      await this.saveToLedger();
    }

    this.state.status = 'completed';
    await this.saveToLedger();

    await ledger.emit('ledger.epic.completed' as any, {
      epicId: `wf-${this.state.workflow_id}`,
      result: 'Workflow completed successfully.',
    });
  }

  /**
   * Save current workflow state to LEDGER.md
   */
  private async saveToLedger() {
    const ledger = await loadLedger();
    // Extend ledger meta for workflow tracking
    (ledger.meta as any).active_workflow = this.state;
    await saveLedger(ledger);
  }
}
