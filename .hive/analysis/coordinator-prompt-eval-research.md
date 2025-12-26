# Research: Coordinator Prompt Iteration with Evals

**Date:** 2025-12-24  
**Cell:** mjk8tk7jn11  
**Epic:** observability-parallel-swarm  
**Status:** Research Complete  
**Agent:** SilverDusk

---

## Executive Summary

**Question:** How do we measure and improve the ~600-line coordinator prompt without trial-and-error?

**Answer:** **Option B (Evalite Integration) + lightweight versioning** - offline testing with coordinator-discipline scorers gives measurable feedback loops.

| Aspect | Assessment |
|--------|------------|
| **Current State** | ✅ 594-line COORDINATOR_PROMPT, evolved organically, no versioning |
| **Existing Infrastructure** | ✅ Evalite setup with coordinator scorers, session capture to JSONL |
| **Technical Feasibility** | ✅ High - scorers exist, session capture works, validation proven |
| **Effort Estimate** | 2-3 weeks for prompt versioning + eval pipeline automation |
| **Risk Level** | Low - additive feature, existing evals validate approach |
| **Recommendation** | **Hybrid: Version tagging (Option A) + Evalite pipeline (Option B), defer LLM-as-Judge (Option C)** |

---

## 1. Problem Statement

### Current State: Prompt Evolution Without Measurement

From `swarm-prompts.ts` (lines 594-857):

```typescript
export const COORDINATOR_PROMPT = `You are a swarm coordinator...`; // 594 lines
```

**How it's currently iterated:**

1. Add new instruction based on observed failure
2. Test manually with real swarm
3. Hope it doesn't break existing behavior
4. No regression detection
5. No success rate tracking

**Why this hurts:**

- **Ratchet effect** - Prompt grows monotonically (never shrinks)
- **Conflicting instructions** - New rules override old ones silently
- **No validation** - Can't tell if changes improve or regress
- **Context exhaustion risk** - 594 lines × N coordinators = $$$
- **Iteration latency** - Real swarm tests take 10+ minutes

### What We Have Already

**Existing infrastructure that makes evals feasible:**

1. **Coordinator scorers** (`evals/scorers/coordinator-discipline.ts`):
   - `violationCount` - Protocol violations (editing files, running tests)
   - `spawnEfficiency` - Delegation ratio (workers spawned / subtasks planned)
   - `reviewThoroughness` - Review completion rate
   - `timeToFirstSpawn` - Overthinking penalty
   - `overallDiscipline` - Weighted composite (30% violations, 25% spawn, 25% review, 20% speed)

2. **Session capture** (`src/eval-capture.ts`):
   - Captures coordinator decisions to `~/.config/swarm-tools/sessions/{session_id}.jsonl`
   - Event types: DECISION, VIOLATION, OUTCOME
   - Real coordinator behavior as ground truth

3. **Evalite integration** (`evals/coordinator-session.eval.ts`):
   - Scores real captured sessions + synthetic fixtures
   - Already validates coordinator behavior
   - Runs with `pnpm eval:coordinator`

**What's missing:**

- Prompt versioning (can't A/B test)
- Automated regression testing (manual run only)
- Success rate tracking over time
- Prompt effectiveness analytics

### Desired State

**When iterating the coordinator prompt, we should be able to:**

1. **Test offline** - Run evals without spawning real swarms (too slow)
2. **Measure regression** - Did this change reduce spawn efficiency?
3. **Track effectiveness** - Which prompt version has highest success rate?
4. **Validate coverage** - Are all sections of the prompt being followed?
5. **Detect ignored sections** - Which instructions are LLM skipping?

---

## 2. Options Analysis

### Option A: Lightweight Versioning + Analytics (1 week)

**Approach:** Tag prompts with hash/semver, query existing o11y data for success rates.

**Implementation:**

```typescript
// src/swarm-prompts.ts
import { createHash } from "crypto";

export const COORDINATOR_PROMPT_VERSION = "v1.2.0";
export const COORDINATOR_PROMPT_HASH = hashPrompt(COORDINATOR_PROMPT);

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 8);
}

// Inject version into prompt footer
export const COORDINATOR_PROMPT = `...
---
Coordinator Prompt Version: ${COORDINATOR_PROMPT_VERSION} (${COORDINATOR_PROMPT_HASH})
`;

// Tag events with prompt version
captureCoordinatorEvent({
  event_type: "DECISION",
  decision_type: "decomposition_complete",
  payload: { 
    prompt_version: COORDINATOR_PROMPT_VERSION,
    prompt_hash: COORDINATOR_PROMPT_HASH,
    subtask_count: 5 
  }
});
```

**Analytics Queries:**

```sql
-- Success rate by prompt version
SELECT 
  json_extract(data, '$.prompt_version') as prompt_version,
  COUNT(*) as total_epics,
  SUM(CASE WHEN json_extract(data, '$.success') = 'true' THEN 1 ELSE 0 END) as successes,
  ROUND(
    CAST(SUM(CASE WHEN json_extract(data, '$.success') = 'true' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100,
    2
  ) as success_rate_pct
FROM events
WHERE type = 'subtask_outcome'
GROUP BY prompt_version
ORDER BY success_rate_pct DESC;

-- Violation rate by prompt version
SELECT 
  json_extract(data, '$.prompt_version') as prompt_version,
  COUNT(*) as violation_count,
  json_extract(data, '$.violation_type') as violation_type
FROM events
WHERE type = 'coordinator_violation'
GROUP BY prompt_version, violation_type
ORDER BY violation_count DESC;
```

**Pros:**

- ✅ Minimal implementation (1 week)
- ✅ Uses existing o11y data (no new infrastructure)
- ✅ Version tracking for all future runs
- ✅ A/B testing possible (deploy two versions, compare)

**Cons:**

- ❌ Requires real swarm runs (no offline testing)
- ❌ Slow feedback (10+ min per epic)
- ❌ Small sample sizes (low statistical power)
- ❌ No regression detection before deployment

**Verdict:** **Necessary but not sufficient** - gives us version tracking, but doesn't solve the "test before deploying" problem.

---

### Option B: Evalite Integration (Offline Testing) (2-3 weeks)

**Approach:** Extend existing evalite setup to test coordinator prompts offline with synthetic scenarios.

**Key Insight:** We already have scorers + session capture. Just need to:

1. Generate synthetic scenarios (coordinator decisions)
2. Test prompt variations against scenarios
3. Score with existing coordinator-discipline scorers
4. Compare versions offline (no real swarms)

**Implementation:**

```typescript
// evals/coordinator-prompt.eval.ts
import { evalite } from "evalite";
import { formatCoordinatorPrompt } from "../src/swarm-prompts.js";
import { 
  violationCount, 
  spawnEfficiency, 
  reviewThoroughness,
  overallDiscipline 
} from "./scorers/coordinator-discipline.js";

// Synthetic scenarios covering key decision points
const coordinatorScenarios = [
  {
    input: {
      task: "Add OAuth authentication",
      project_path: "/mock/project",
      scenario: "simple_feature_addition"
    },
    expected: {
      should_spawn_workers: true,
      should_ask_clarifying_questions: false, // clear task
      should_spawn_researcher: false, // OAuth is well-known
      min_subtasks: 3,
      max_subtasks: 8
    }
  },
  {
    input: {
      task: "Migrate to Next.js 16 Cache Components",
      project_path: "/mock/project",
      scenario: "unfamiliar_technology"
    },
    expected: {
      should_spawn_workers: true,
      should_ask_clarifying_questions: true, // ambiguous strategy
      should_spawn_researcher: true, // Cache Components are new
      min_subtasks: 4,
      max_subtasks: 10
    }
  },
  {
    input: {
      task: "Refactor authentication across all API routes",
      project_path: "/mock/project",
      scenario: "file_based_refactor"
    },
    expected: {
      should_spawn_workers: true,
      should_ask_clarifying_questions: false,
      should_spawn_researcher: false,
      strategy: "file-based",
      min_subtasks: 5,
      max_subtasks: 15
    }
  },
  // ... 10+ more scenarios
];

evalite("Coordinator Prompt - Decision Quality", {
  data: async () => coordinatorScenarios.map(s => ({
    input: formatCoordinatorPrompt({ 
      task: s.input.task, 
      projectPath: s.input.project_path 
    }),
    expected: s.expected
  })),
  
  task: async (input) => {
    // Mock coordinator LLM call with prompt
    const response = await mockCoordinatorResponse(input);
    return JSON.stringify(response);
  },
  
  scorers: [
    // Existing scorers
    violationCount,
    spawnEfficiency,
    reviewThoroughness,
    
    // New scenario-specific scorers
    createScorer({
      name: "Researcher Spawned When Needed",
      scorer: ({ output, expected }) => {
        const session = JSON.parse(output);
        const spawnedResearcher = session.events.some(
          e => e.decision_type === "researcher_spawned"
        );
        
        if (expected.should_spawn_researcher) {
          return {
            score: spawnedResearcher ? 1.0 : 0.0,
            message: spawnedResearcher 
              ? "Correctly spawned researcher" 
              : "MISSING: Should have spawned researcher for unfamiliar tech"
          };
        } else {
          return {
            score: spawnedResearcher ? 0.0 : 1.0,
            message: spawnedResearcher 
              ? "VIOLATION: Spawned researcher unnecessarily" 
              : "Correctly skipped researcher"
          };
        }
      }
    }),
    
    createScorer({
      name: "Clarifying Questions When Needed",
      scorer: ({ output, expected }) => {
        const session = JSON.parse(output);
        const askedQuestions = session.events.some(
          e => e.decision_type === "socratic_question"
        );
        
        if (expected.should_ask_clarifying_questions) {
          return {
            score: askedQuestions ? 1.0 : 0.0,
            message: askedQuestions 
              ? "Correctly asked clarifying questions" 
              : "MISSING: Should have asked questions for ambiguous task"
          };
        } else {
          return {
            score: askedQuestions ? 0.5 : 1.0, // Minor penalty for unnecessary questions
            message: askedQuestions 
              ? "Asked questions for clear task (minor inefficiency)" 
              : "Correctly skipped questions"
          };
        }
      }
    }),
    
    overallDiscipline
  ]
});
```

**Prompt Version Comparison:**

```typescript
// Test multiple prompt versions
evalite("Coordinator Prompt Version Comparison", {
  data: async () => {
    const scenarios = await loadCoordinatorScenarios();
    const versions = [
      { version: "v1.2.0", prompt: COORDINATOR_PROMPT_V1_2_0 },
      { version: "v1.3.0-beta", prompt: COORDINATOR_PROMPT_V1_3_0 },
    ];
    
    // Cross product: each scenario × each version
    return scenarios.flatMap(scenario =>
      versions.map(v => ({
        input: { ...scenario.input, prompt: v.prompt },
        expected: { ...scenario.expected, version: v.version }
      }))
    );
  },
  
  task: async (input) => {
    const response = await mockCoordinatorResponse(input.prompt, input);
    return JSON.stringify(response);
  },
  
  scorers: [/* same as above */]
});
```

**Regression Testing:**

```bash
# Before deploying new prompt version
pnpm eval:coordinator-regression

# Compares current prompt against baseline (v1.2.0)
# Fails if any score drops >5%
```

**Pros:**

- ✅ Offline testing (fast feedback, no real swarms)
- ✅ Regression detection (score current vs baseline)
- ✅ Version comparison (A/B test offline)
- ✅ Reuses existing scorers (coordinator-discipline.ts)
- ✅ Synthetic scenarios = high coverage

**Cons:**

- ❌ Mock LLM responses (not 100% real)
- ❌ Scenario maintenance (need to keep scenarios updated)
- ❌ Doesn't catch emergent failures (only tests known scenarios)

**Verdict:** **High ROI** - gives us offline testing + regression detection with existing infrastructure.

---

### Option C: LLM-as-Judge Continuous Eval (4-5 weeks)

**Approach:** Post-swarm eval where LLM reviews coordinator's adherence to prompt.

**Implementation:**

```typescript
// After every swarm completes
async function evaluateCoordinatorPromptAdherence(
  session_id: string,
  epic_id: string
) {
  // 1. Load coordinator session
  const session = await loadCapturedSession(session_id);
  
  // 2. Extract prompt sections
  const promptSections = extractPromptSections(COORDINATOR_PROMPT);
  
  // 3. LLM reviews session against each section
  const evaluation = await llm.generate({
    prompt: `
      You are evaluating a coordinator's adherence to their prompt.
      
      **Coordinator Prompt Section:**
      ${promptSections[0]} // e.g., "Phase 0: Socratic Planning"
      
      **Coordinator Session Events:**
      ${JSON.stringify(session.events)}
      
      **Questions:**
      1. Did the coordinator follow this section's instructions?
      2. If not, what did they skip or do differently?
      3. Was the deviation justified or a violation?
      
      Score: 0-1 (0 = ignored, 1 = perfectly followed)
    `,
    schema: z.object({
      section: z.string(),
      followed: z.boolean(),
      score: z.number().min(0).max(1),
      deviations: z.array(z.string()),
      justified: z.boolean()
    })
  });
  
  // 4. Store eval results
  await storePromptAdherenceEval({
    session_id,
    epic_id,
    prompt_version: COORDINATOR_PROMPT_VERSION,
    section_scores: evaluation.section_scores,
    overall_adherence: evaluation.overall_score
  });
  
  // 5. Flag ignored sections
  const ignoredSections = evaluation.section_scores.filter(
    s => s.score < 0.5 && !s.justified
  );
  
  if (ignoredSections.length > 0) {
    console.warn(
      `⚠️  Coordinator ignored ${ignoredSections.length} prompt sections:`,
      ignoredSections.map(s => s.section)
    );
  }
}
```

**Auto-Flag Ignored Sections:**

```sql
-- Which prompt sections are consistently ignored?
SELECT 
  section,
  COUNT(*) as eval_count,
  AVG(score) as avg_adherence,
  SUM(CASE WHEN score < 0.5 THEN 1 ELSE 0 END) as ignored_count
FROM prompt_adherence_evals
WHERE prompt_version = 'v1.2.0'
GROUP BY section
HAVING avg_adherence < 0.7
ORDER BY avg_adherence ASC;
```

**Prompt Compaction Based on Adherence:**

```typescript
// Automatically remove sections with <50% adherence
async function compactPrompt(version: string, threshold = 0.5) {
  const adherence = await getPromptAdherence(version);
  
  const sectionsToRemove = adherence.filter(s => s.avg_score < threshold);
  
  console.log(
    `🗑️  Removing ${sectionsToRemove.length} low-adherence sections:`,
    sectionsToRemove.map(s => s.section)
  );
  
  return removePromptSections(COORDINATOR_PROMPT, sectionsToRemove);
}
```

**Pros:**

- ✅ Detects ignored sections (real usage data)
- ✅ Auto-compaction (removes dead weight)
- ✅ Comprehensive coverage (all sections evaluated)
- ✅ Post-hoc analysis (no upfront effort)

**Cons:**

- ❌ Significant implementation (4-5 weeks)
- ❌ Requires post-swarm LLM calls ($$$)
- ❌ Slow feedback (after swarm completes)
- ❌ Meta-problem (LLM judging LLM, hallucination risk)

**Verdict:** **Future enhancement** - powerful but heavy. Defer until Option B proves insufficient.

---

## 3. Recommendation: Hybrid Approach

**Phase 1: Versioning + Existing Evals (Week 1)**

1. Add prompt versioning to `swarm-prompts.ts`:
   ```typescript
   export const COORDINATOR_PROMPT_VERSION = "v1.2.0";
   export const COORDINATOR_PROMPT_HASH = hashPrompt(COORDINATOR_PROMPT);
   ```

2. Tag coordinator events with version:
   ```typescript
   captureCoordinatorEvent({
     event_type: "DECISION",
     payload: { prompt_version: COORDINATOR_PROMPT_VERSION }
   });
   ```

3. Run existing evals with versioned prompts:
   ```bash
   pnpm eval:coordinator
   ```

4. Query success rates by version (using existing o11y data).

**Phase 2: Offline Regression Testing (Week 2-3)**

1. Create `evals/coordinator-prompt.eval.ts` with synthetic scenarios.

2. Add scenario-specific scorers:
   - `researcherSpawnedWhenNeeded`
   - `clarifyingQuestionsWhenNeeded`
   - `strategySelectionCorrect`

3. Implement version comparison eval:
   ```bash
   pnpm eval:coordinator-regression
   ```

4. CI gate: Fail PR if any score drops >5% from baseline.

**Phase 3: Analytics Dashboard (Week 4) - OPTIONAL**

1. Build prompt effectiveness dashboard:
   - Success rate by version
   - Violation rate by version
   - Section adherence heatmap

2. Export to CSV for Excel/BI tools (reuse from observability ADR).

**Defer to v0.34+:**

- LLM-as-Judge continuous eval (Option C)
- Automated prompt compaction
- A/B testing in production (requires traffic splitting)

---

## 4. Implementation Details

### Versioning Strategy

**Semantic Versioning:**

- **Major** (v2.0.0) - Breaking changes (remove sections, reorder phases)
- **Minor** (v1.3.0) - Additive changes (new instructions, new phases)
- **Patch** (v1.2.1) - Clarifications, typo fixes

**Hash-based Validation:**

```typescript
// Detect accidental prompt edits
if (COORDINATOR_PROMPT_HASH !== getExpectedHash(COORDINATOR_PROMPT_VERSION)) {
  throw new Error(
    `Coordinator prompt changed but version not bumped! ` +
    `Update COORDINATOR_PROMPT_VERSION or revert changes.`
  );
}
```

### Synthetic Scenarios

**Coverage Matrix:**

| Scenario Type | Examples | Scorers |
|--------------|----------|---------|
| **Simple feature** | "Add dark mode toggle" | spawnEfficiency, noResearcher |
| **Unfamiliar tech** | "Migrate to Cache Components" | spawnResearcher, askQuestions |
| **File-based refactor** | "Rename all API endpoints" | strategySelection, fileConflictDetection |
| **Bug fix** | "Fix race condition in auth" | riskBasedStrategy, noOverthinking |
| **Ambiguous task** | "Improve performance" | askQuestions, scopeClarification |

**Fixture Format:**

```typescript
interface CoordinatorScenario {
  input: {
    task: string;
    project_path: string;
    flags?: string[]; // --fast, --auto, etc.
  };
  expected: {
    should_spawn_workers: boolean;
    should_spawn_researcher: boolean;
    should_ask_clarifying_questions: boolean;
    strategy?: "file-based" | "feature-based" | "risk-based";
    min_subtasks: number;
    max_subtasks: number;
  };
}
```

### Regression Detection

**Baseline scores (from current eval runs):**

```json
{
  "version": "v1.2.0",
  "baseline_scores": {
    "violationCount": 0.95,
    "spawnEfficiency": 0.88,
    "reviewThoroughness": 0.92,
    "overallDiscipline": 0.89
  }
}
```

**Regression threshold:**

```typescript
const REGRESSION_THRESHOLD = 0.05; // 5% drop = fail

function detectRegression(
  baseline: Scores,
  current: Scores
): RegressionReport {
  const regressions = Object.entries(current).filter(
    ([metric, score]) => {
      const baselineScore = baseline[metric];
      return (baselineScore - score) > REGRESSION_THRESHOLD;
    }
  );
  
  return {
    hasRegression: regressions.length > 0,
    regressions: regressions.map(([metric, score]) => ({
      metric,
      baseline: baseline[metric],
      current: score,
      drop: baseline[metric] - score
    }))
  };
}
```

---

## 5. Success Metrics

### Phase 1 (Versioning) Success Criteria

- [ ] All coordinator events tagged with prompt version
- [ ] Version bumped on every prompt change
- [ ] Hash validation prevents accidental edits
- [ ] Analytics queries return success rates by version

### Phase 2 (Offline Evals) Success Criteria

- [ ] 10+ synthetic scenarios covering key decision points
- [ ] Regression detection catches >90% of prompt regressions
- [ ] Eval runs in <5 minutes (offline, no real swarms)
- [ ] CI gate prevents deploying regressed prompts
- [ ] Version comparison shows measurable improvements

### Long-term (v0.34+) Success Criteria

- [ ] Prompt length reduced by 20% (via adherence-based compaction)
- [ ] Coordinator violation rate <5% (from current ~15%)
- [ ] Average spawn efficiency >95% (from current ~88%)
- [ ] Review thoroughness >95% (from current ~92%)

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Synthetic scenarios don't match reality** | Evals pass, real swarms fail | Combine with real session capture, update scenarios based on production failures |
| **Version fatigue** (too many versions) | Hard to track which is best | Automated regression testing, only bump on measurable improvements |
| **Prompt drift** (instructions conflict over time) | LLM confused by contradictions | Periodic prompt audits, section dependency analysis |
| **Eval maintenance burden** | Scenarios get stale | Treat scenarios as fixtures (TDD for prompts), update on prompt changes |

---

## 7. Open Questions

### 7.1 How do we mock coordinator LLM responses for offline testing?

**Options:**

1. **Replay real sessions** - Use captured sessions as "ground truth" responses
2. **LLM in eval** - Call actual LLM with prompt variations (slower, costs money)
3. **Rule-based mock** - Deterministic responses for known scenarios (fast, brittle)

**Recommendation:** Start with (1) for regression testing, add (2) for version comparison.

### 7.2 What's the right regression threshold?

**5% score drop = fail** seems reasonable, but need to calibrate:

- Run baseline evals on v1.2.0 (10+ runs)
- Measure variance in scores
- Set threshold at 2× standard deviation

### 7.3 How do we handle prompt sections that are intentionally ignored?

Example: `--fast` flag skips Socratic Planning.

**Solution:** Scenario-specific expected behavior:

```typescript
{
  input: { task: "...", flags: ["--fast"] },
  expected: { should_ask_clarifying_questions: false }
}
```

### 7.4 Should we version sub-prompts separately?

We have:
- `COORDINATOR_PROMPT` (main)
- `RESEARCHER_PROMPT` (spawned for docs)
- `EVALUATION_PROMPT` (self-eval)

**Recommendation:** Version separately if they evolve independently. For now, bundle into `COORDINATOR_PROMPT_VERSION`.

---

## 8. Next Steps

1. **Approve this ADR** - Get stakeholder buy-in on hybrid approach
2. **Create Phase 1 cell** - Prompt versioning (1 week)
3. **Create Phase 2 cell** - Offline evals + regression testing (2 weeks)
4. **Ship v1.3.0** - First versioned coordinator prompt
5. **Iterate** - Use eval feedback to improve prompts measurably

---

## 9. Integration Plan

### With Existing o11y Tools

**Event capture** (`eval-capture.ts`):
- Already tags events with session_id, epic_id
- Add: prompt_version, prompt_hash

**Analytics queries** (from observability ADR):
- Add prompt version filtering
- Compare success rates across versions

**Evalite** (`coordinator-session.eval.ts`):
- Extend with prompt version comparison
- Add regression detection

### With Learning System

**Pattern maturity scoring**:
- Track prompt version in eval_records
- Detect if prompt changes affect pattern success rates

**Anti-pattern detection**:
- Flag prompt sections that correlate with violations
- Auto-deprecate ineffective instructions

---

## 10. Alternatives Considered

### 10.1 Manual Testing Only (Rejected)

**Approach:** Keep iterating by feel, test with real swarms.

**Why rejected:**
- Too slow (10+ min feedback)
- No regression detection
- Can't A/B test easily

### 10.2 Prompt Engineering Platform (e.g., Weights & Biases) (Rejected)

**Approach:** Use external prompt versioning tool.

**Why rejected:**
- Adds external dependency
- Existing evals infrastructure is sufficient
- We control the data (libSQL, semantic-memory)

### 10.3 Genetic Algorithm Prompt Optimization (Rejected for Phase 1)

**Approach:** Mutate prompt, test variations, keep best performers.

**Why rejected:**
- Over-engineered for current problem
- Requires massive eval runs (10k+ per generation)
- Risk of local maxima (prompt gets weird)

**Maybe in v0.35+** if manual iteration proves too slow.

---

## Appendix A: Coordinator Prompt Structure (Current)

From `swarm-prompts.ts` (lines 594-857):

**Sections:**

1. **Task** (input substitution)
2. **CRITICAL: Coordinator Role Boundaries** (what NOT to do)
3. **CRITICAL: NEVER Fetch Documentation Directly** (forbidden tools)
4. **Workflow:**
   - Phase 0: Socratic Planning (interactive)
   - Phase 1: Initialize (swarmmail_init)
   - Phase 1.5: Research Phase (spawn researcher for unfamiliar tech)
   - Phase 2: Knowledge Gathering (semantic-memory, CASS, skills)
   - Phase 3: Decompose (strategy selection, validation)
   - Phase 4: Create Cells (hive_create_epic)
   - Phase 5: DO NOT Reserve Files (workers reserve)
   - Phase 6: Spawn Workers (parallel or sequential)
   - Phase 7: MANDATORY Review Loop (review after EVERY worker)
   - Phase 8: Complete (hive_sync)
5. **Strategy Reference** (file/feature/risk-based)
6. **Flag Reference** (--fast, --auto, --confirm-only)

**Line count:** 594-857 = **263 lines** (my initial "~500" was wrong - coordinator prompt is 263 lines, but total swarm-prompts.ts is 1838 lines).

---

## Appendix B: Example Eval Output

```bash
$ pnpm eval:coordinator-regression

Running coordinator prompt regression tests...

✓ Baseline: v1.2.0 (loaded from .eval-baselines/v1.2.0.json)
✓ Current: v1.3.0-beta

Scenario: "Add OAuth authentication"
  Baseline  Current   Delta    Status
  --------  -------   -----    ------
  Violations:        0.95      0.92     -3%     ✓ PASS
  Spawn Efficiency:  0.88      0.91     +3%     ✓ PASS
  Review Thorough:   0.92      0.94     +2%     ✓ PASS
  Overall:           0.89      0.91     +2%     ✓ PASS

Scenario: "Migrate to Cache Components"
  Baseline  Current   Delta    Status
  --------  -------   -----    ------
  Violations:        0.90      0.85     -5%     ⚠️  THRESHOLD
  Spawn Efficiency:  0.85      0.88     +3%     ✓ PASS
  Researcher:        1.00      1.00     0%      ✓ PASS
  Overall:           0.87      0.88     +1%     ✓ PASS

Overall: 2/2 scenarios passed regression threshold (5% drop)

⚠️  Warning: "Migrate to Cache Components" violation score dropped 5% (at threshold)
Consider investigating why new prompt version increased violations.

✓ Safe to deploy v1.3.0-beta
```

---

*This research was completed by SilverDusk as part of the observability-parallel-swarm epic. Findings inform the prompt iteration strategy for coordinator agents.*
