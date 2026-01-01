import { evalite } from 'evalite';
import fs from 'node:fs';
import path from 'node:path';

// Mock Oracle Agent Logic (to simulate actual agent)
const mockOracleAgent = (input: string) => {
  // Logic from ADR 004:
  // If request implies refactoring or dependencies -> Sequential
  // If request implies distinct features with no overlap -> Parallel

  if (input.toLowerCase().includes('refactor') || input.toLowerCase().includes('depend')) {
    return {
      epic: { title: 'Refactor Task', request: input },
      tasks: [
        { title: 'Analysis', agent: 'oracle', description: 'Analyze deps' },
        { title: 'Execution', agent: 'executor', description: 'Apply changes' },
      ],
      execution_strategy: {
        mode: 'sequential' as const,
        rationale: 'Dependencies detected',
        risk_assessment: 'LOW',
      },
    };
  } else {
    return {
      epic: { title: 'Feature Task', request: input },
      tasks: [
        { title: 'Frontend', agent: 'executor', description: 'UI changes' },
        { title: 'Backend', agent: 'executor', description: 'API changes' },
      ],
      execution_strategy: {
        mode: 'parallel' as const,
        rationale: 'No shared state',
        risk_assessment: 'LOW',
      },
    };
  }
};

evalite('SDD Workflow: Oracle Decomposition', {
  data: () => [
    {
      input: 'Refactor the authentication module and update the database schema',
      expected: 'sequential',
    },
    {
      input: "Add a new 'About Us' page and update the footer link",
      expected: 'parallel',
    },
    {
      input: 'Update the login form to use the new API depending on the new auth service',
      expected: 'sequential',
    },
  ],
  task: async (input: string) => {
    return mockOracleAgent(input);
  },
  scorers: [
    // 1. Verify Strategy Mode
    // @ts-ignore
    (result, { expected }) => {
      return result.execution_strategy.mode === expected ? 1 : 0;
    },
    // 2. Verify Task Structure
    // @ts-ignore
    (result) => {
      // Must have tasks and execution_strategy
      if (!result || typeof result !== 'object') return 0;
      if (!result.tasks || !Array.isArray(result.tasks)) return 0;
      if (!result.execution_strategy) return 0;
      return 1;
    },
  ],
});
