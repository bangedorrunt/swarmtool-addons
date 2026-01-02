import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('eval-utils');

/**
 * Shared utility for LLM Inference with File-based Caching
 */
export async function cachedInference(params: {
  prompt: string;
  system?: string;
  model?: string;
  tag?: string;
}) {
  const { prompt, system = '', model = 'nvidia/nemotron-3-nano', tag = 'default' } = params;

  // 1. Setup Cache
  const cacheDir = path.join(process.cwd(), '.evalite/cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  // Create a unique hash based on prompt + system + model
  const hash = crypto
    .createHash('md5')
    .update(prompt + system + model)
    .digest('hex');
  const cacheFile = path.join(cacheDir, `${tag}-${hash}.json`);

  // 2. Return from cache if exists
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  // 3. Call Real LLM
  const provider = process.env.EVAL_PROVIDER || 'lmstudio';
  log.info({ model, provider, tag }, 'Calling LLM API');

  let modelInstance;

  if (provider === 'google') {
    modelInstance = google(model);
  } else {
    const lmstudio = createOpenAICompatible({
      name: 'lmstudio',
      baseURL: 'http://localhost:1234/v1',
    });
    modelInstance = lmstudio(model);
  }

  const { text } = await generateText({
    model: modelInstance,
    system,
    prompt,
  });

  try {
    // Attempt to extract JSON if the agent is supposed to return JSON
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : text;

    // Save to cache
    fs.writeFileSync(
      cacheFile,
      JSON.stringify(
        {
          raw: text,
          parsed: result,
          model,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return result;
  } catch (e) {
    // If not JSON, just return raw text and cache it
    const fallback = { raw: text, parsed: text };
    fs.writeFileSync(cacheFile, JSON.stringify(fallback));
    return text;
  }
}

/**
 * Load skill markdown file
 */
export function loadSkillContent(skillName: string): string {
  const skillPath = path.join(
    process.cwd(),
    `src/orchestrator/chief-of-staff/agents/${skillName}/SKILL.md`
  );
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf-8');
  }
  // Fallback for main chief-of-staff skill
  const mainPath = path.join(process.cwd(), `src/orchestrator/chief-of-staff/SKILL.md`);
  return fs.readFileSync(mainPath, 'utf-8');
}
