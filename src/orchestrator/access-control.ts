/**
 * Functional Access Control Logic
 *
 * Provides composable guard functions for agent permissions.
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Agents that can only be called by chief-of-staff or internal system
 */
export const PROTECTED_AGENTS = [
  'planner',
  'executor',
  'validator',
  'oracle',
  'librarian',
  'explore',
  'interviewer',
  'spec-writer',
  'memory-catcher',
  'workflow-architect',
  'frontend-ui-ux-engineer',
] as const;

export type ProtectedAgent = (typeof PROTECTED_AGENTS)[number];

// ============================================================================
// Types
// ============================================================================

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

// ============================================================================
// Guards
// ============================================================================

/**
 * Check if the caller is the Chief of Staff (or root user)
 */
export const isChiefOfStaff = (caller: string): boolean => {
  return (
    caller === 'chief-of-staff' || caller.includes('chief-of-staff/') || caller === '' // Root user
  );
};

/**
 * Check if an agent name is in the protected list or is a protected sub-agent
 */
export const isProtectedAgent = (agentName: string): boolean => {
  return PROTECTED_AGENTS.some((pa) => agentName === pa || agentName.endsWith(`/${pa}`));
};

/**
 * Check if the target agent name implies internal hierarchy
 */
export const isInternalHierarchy = (agentName: string): boolean => {
  return agentName.includes('chief-of-staff/');
};

// ============================================================================
// Logic
// ============================================================================

/**
 * Main access control check
 *
 * @param caller - The name of the agent calling the tool (empty string = user)
 * @param targetAgent - The name of the agent being spawned/called
 * @param isCustomSkill - Whether the target matches a known custom skill name (optional hint)
 */
export const canCallAgent = (
  caller: string,
  targetAgent: string,
  isCustomSkill: boolean = false
): AccessResult => {
  // 1. If caller is Chief of Staff, everything is allowed
  if (isChiefOfStaff(caller)) {
    return { allowed: true };
  }

  // 2. Determine if the target needs protection
  // It needs protection if:
  // - It is in the PROTECTED_AGENTS list (or ends with it)
  // - AND (It is a custom skill OR It looks like an internal hierarchical name)
  const shouldEnforceProtection = isCustomSkill || isInternalHierarchy(targetAgent);

  if (shouldEnforceProtection && isProtectedAgent(targetAgent)) {
    return {
      allowed: false,
      reason: `The ${targetAgent} agent only responds to chief-of-staff.`,
      suggestion:
        'Use skill_agent to call chief-of-staff, who will coordinate sub-agents internally.',
    };
  }

  // 3. Default allow
  return { allowed: true };
};
