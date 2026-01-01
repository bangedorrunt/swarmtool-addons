import { loadSkillAgents } from '../opencode/loader';
import { loadChiefOfStaffSkills } from '../opencode/config/skill-loader';

export interface ResolvedAgent {
  name: string;
  config: any;
}

/**
 * Phân giải tên agent từ các tham số đầu vào.
 * Hỗ trợ: hierarchical name (skill/agent), alias, và tự động thử các prefix.
 */
export async function resolveAgent(params: {
  agent_name?: string;
  skill_name?: string;
  agent?: string; // Alias for agent_name
}): Promise<ResolvedAgent | null> {
  const { agent_name: raw_name, skill_name, agent: alias } = params;
  const targetName = raw_name || alias;

  if (!targetName) return null;

  // 1. Construct search candidates in PRIORITY ORDER
  const candidates: string[] = [];

  // A. Explicit Skill (Highest Priority)
  if (skill_name) {
    candidates.push(`${skill_name}/${targetName}`);
    candidates.push(`${skill_name}-${targetName}`);
  }

  // B. Exact Name match (e.g. if user passed "my-skill/oracle" directly)
  candidates.push(targetName);

  // C. Chief-of-Staff Namespace (Fallback for implicit names)
  // Only add if it doesn't already look like a qualified name (has /)
  // OR if we want to allow "oracle" to resolve to "chief-of-staff/oracle" even if "skill/oracle" exists (but we prioritized skill above)
  if (!targetName.startsWith('chief-of-staff/')) {
    candidates.push(`chief-of-staff/${targetName}`);
  }

  // 2. Load all available agents
  const [skillAgents, chiefOfStaffSkills] = await Promise.all([
    loadSkillAgents(),
    loadChiefOfStaffSkills(),
  ]);

  const allAgents = [
    ...skillAgents,
    ...chiefOfStaffSkills.map((s) => ({ name: s.name, config: s })),
  ];

  // 3. Find matched agent (Respecting candidate priority)
  let found = null;
  for (const candidate of candidates) {
    found = allAgents.find((a: any) => a.name === candidate);
    if (found) break;
  }

  // 4. Fallback logic if not found
  if (!found) {
    // Try fallback to Explore or General
    const fallbacks = ['chief-of-staff/explore', 'chief-of-staff/general'];
    for (const fb of fallbacks) {
      found = allAgents.find((a: any) => a.name === fb);
      if (found) break;
    }
  }

  return found ? { name: found.name, config: found.config } : null;
}

/**
 * Lấy danh sách tất cả các tên agent duy nhất.
 */
export async function listAllAgents(): Promise<string[]> {
  const [skillAgents, chiefOfStaffSkills] = await Promise.all([
    loadSkillAgents(),
    loadChiefOfStaffSkills(),
  ]);

  const names = [...skillAgents.map((a) => a.name), ...chiefOfStaffSkills.map((s) => s.name)];

  return [...new Set(names)].sort();
}
