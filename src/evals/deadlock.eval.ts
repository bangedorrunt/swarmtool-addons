import { evalite } from 'evalite';
import { hasCircularDependencies, detectFileCollisions } from '../orchestrator/utils';

evalite('Deadlock Detection: Task Dependencies', {
  data: () => [
    {
      input: {
        name: 'No dependencies',
        tasks: [
          { id: 't1', dependencies: [] },
          { id: 't2', dependencies: [] },
        ],
      },
      expected: false,
    },
    {
      input: {
        name: 'Sequential dependencies',
        tasks: [
          { id: 't1', dependencies: [] },
          { id: 't2', dependencies: ['t1'] },
          { id: 't3', dependencies: ['t2'] },
        ],
      },
      expected: false,
    },
    {
      input: {
        name: 'Direct cycle',
        tasks: [
          { id: 't1', dependencies: ['t2'] },
          { id: 't2', dependencies: ['t1'] },
        ],
      },
      expected: true,
    },
    {
      input: {
        name: 'Indirect cycle',
        tasks: [
          { id: 't1', dependencies: ['t2'] },
          { id: 't2', dependencies: ['t3'] },
          { id: 't3', dependencies: ['t1'] },
        ],
      },
      expected: true,
    },
    {
      input: {
        name: 'Self dependency',
        tasks: [{ id: 't1', dependencies: ['t1'] }],
      },
      expected: true,
    },
    {
      input: {
        name: 'Complex acyclic',
        tasks: [
          { id: 't1', dependencies: [] },
          { id: 't2', dependencies: ['t1'] },
          { id: 't3', dependencies: ['t1'] },
          { id: 't4', dependencies: ['t2', 't3'] },
        ],
      },
      expected: false,
    },
  ],
  task: async (input: any) => {
    return hasCircularDependencies(input.tasks);
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      return result === ctx?.expected ? 1 : 0;
    },
  ],
});

evalite('Deadlock Detection: Resource Collisions', {
  data: () => [
    {
      input: {
        name: 'No collisions',
        tasks: [
          { id: 't1', affectsFiles: ['file1.ts'] },
          { id: 't2', affectsFiles: ['file2.ts'] },
        ],
      },
      expected: false,
    },
    {
      input: {
        name: 'Direct collision',
        tasks: [
          { id: 't1', affectsFiles: ['file1.ts', 'shared.ts'] },
          { id: 't2', affectsFiles: ['file2.ts', 'shared.ts'] },
        ],
      },
      expected: true,
    },
    {
      input: {
        name: 'Multiple collisions',
        tasks: [
          { id: 't1', affectsFiles: ['a.ts', 'b.ts'] },
          { id: 't2', affectsFiles: ['b.ts', 'c.ts'] },
          { id: 't3', affectsFiles: ['a.ts', 'd.ts'] },
        ],
      },
      expected: true,
    },
  ],
  task: async (input: any) => {
    return detectFileCollisions(input.tasks).hasCollision;
  },
  scorers: [
    // @ts-ignore
    (result, ctx) => {
      return result === ctx?.expected ? 1 : 0;
    },
  ],
});
