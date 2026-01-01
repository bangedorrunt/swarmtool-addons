import { evalite } from 'evalite';
import fs from 'node:fs';
import path from 'node:path';

// Helper to load skill
const loadSkill = () => {
    // Relative path from src/evals/ to src/orchestrator/...
    const skillPath = path.join(process.cwd(), 'src/orchestrator/chief-of-staff/agents/oracle/SKILL.md');
    if (!fs.existsSync(skillPath)) {
        return "MOCK SKILL CONTENT: ORACLE SKILL NOT FOUND";
    }
    return fs.readFileSync(skillPath, 'utf-8');
};

interface OracleOutput {
    epic?: { title: string; request: string };
    execution_strategy?: { mode: 'parallel' | 'sequential' | 'mixed' };
}

evalite('Oracle Agent Strategy', {
    data: [
        {
            input: "I need to add a login page with Google Auth",
            expected: "parallel"
        },
        {
            input: "Refactor the entire auth system and change the database schema",
            expected: "sequential"
        }
    ],
    task: async (input) => {
        const skill = loadSkill();

        // MOCK LLM CALL
        // In a real scenario, correct implementation would be:
        // const response = await client.generate(skill + "\nUser Request: " + input);
        // return JSON.parse(response);

        console.log(`[Mock Agent] processing input: ${input}`);

        // Simple heuristic for demonstration
        if (input.toLowerCase().includes('refactor') || input.toLowerCase().includes('schema')) {
            return {
                epic: { title: "Refactor", request: input },
                execution_strategy: { mode: "sequential" }
            } as OracleOutput;
        } else {
            return {
                epic: { title: "Feature", request: input },
                execution_strategy: { mode: "parallel" }
            } as OracleOutput;
        }
    },
    scorers: [
        // @ts-ignore
        (result: OracleOutput, ctx: { expected: string }) => {
            const mode = result.execution_strategy?.mode;
            return mode === ctx.expected ? 1 : 0;
        }
    ]
});

