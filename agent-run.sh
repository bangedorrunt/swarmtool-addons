#!/bin/bash

for agent in interviewer oracle chief-of-staff spec-writer planner validator executor; do
  mkdir -p ".opencode/skill/sisyphus-$agent"
  cp "src/orchestrator/sisyphus/agents/$agent/SKILL.md" ".opencode/skill/sisyphus-$agent/"
done
# 4. Update commands
sed -i '' 's/sisyphus\/oracle/sisyphus-oracle/g' .opencode/command/ama.md
sed -i '' 's/sisyphus\/interviewer/sisyphus-interviewer/g' .opencode/command/sdd.md
sed -i '' 's/sisyphus\/chief-of-staff/sisyphus-chief-of-staff/g' .opencode/command/sdd.md
#5. Commit
git add .opencode/
git commit -m "fix: Flatten skills to sisyphus-* for OpenCode discovery"