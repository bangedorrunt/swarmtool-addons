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
  agent?: string; // Alias cho agent_name
}): Promise<ResolvedAgent | null> {
  const { agent_name: raw_name, skill_name, agent: alias } = params;
  const targetName = raw_name || alias;

  if (!targetName) return null;

  // 1. Khởi tạo danh sách các tên cần tìm kiếm
  const searchNames = [targetName];

  // Ưu tiên chief-of-staff/ prefix
  if (!targetName.startsWith('chief-of-staff/')) {
    searchNames.unshift(`chief-of-staff/${targetName}`);
  }

  if (skill_name) {
    searchNames.push(`${skill_name}/${targetName}`);
    searchNames.push(`${skill_name}-${targetName}`);
  }

  // 2. Load tất cả agents khả dụng
  const [skillAgents, chiefOfStaffSkills] = await Promise.all([
    loadSkillAgents(),
    loadChiefOfStaffSkills(),
  ]);

  const allAgents = [
    ...skillAgents,
    ...chiefOfStaffSkills.map((s) => ({ name: s.name, config: s })),
  ];

  // 3. Tìm kiếm agent phù hợp nhất
  let found = allAgents.find((a: any) => searchNames.includes(a.name));

  // 4. Fallback logic nếu không tìm thấy
  if (!found) {
    // Thử fallback sang Explore hoặc General của chief-of-staff
    const fallbacks = ['chief-of-staff/explore', 'chief-of-staff/general'];
    found = allAgents.find((a: any) => fallbacks.includes(a.name));
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
