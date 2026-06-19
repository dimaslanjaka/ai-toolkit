---
name: sync-agents-md
description: Sync AGENTS.md with real repository workflows using evidence-based updates
mode: all
---

## Objective
Maintain AGENTS.md as a strict reflection of real repository behavior.

## Execution pipeline

### Step 1: Load source truth
Read:
- AGENTS.md
- package.json
- yarn.lock
- CI workflows (.github/workflows)
- build configs (rollup, tsconfig, eslint)
- scripts directories
- `.opencode/memory/` — prior edit context and decisions

---

### Step 2: Extract workflows (skills)
Invoke via `skill` tool:
1. `extract-workflows` — discover undocumented commands and conventions
2. `normalize-commands` — verify command syntax and platform variants
3. `format-agents-md` — apply consistent entry formatting

Expected output:
- verified commands with evidence sources
- script sources (package.json, bin/, scripts/)
- execution context (env vars, flags, platform notes)

Reject any unverified command. If a command cannot be confirmed in the repo, insert a TODO instead.

---

### Step 3: Compare state
Identify:
- missing workflows
- outdated commands
- conflicting instructions
- redundant sections

---

### Step 4: Generate patch plan
Apply `format-agents-md` formatting rules:
- Entry format: single `- ` bullet per concept; sub-bullets only for listed items
- Commands: backtick-fenced (` ` `command` ` `)
- Pipelines: arrow notation (`step1` → `step2` → `step3`)
- File paths: forward slashes on all platforms
- Section order: structure → build → lint/test → hooks → dev → paths → memory → lang guidelines

Patch rules:
- minimal diff only
- section-level precision
- no full rewrites
- preserve existing formatting style

---

### Step 5: Validate patch (hard rules)

Reject patch if:
- it modifies unrelated sections
- it introduces new unknown commands (must be verifiable in the repo first)
- it removes existing valid workflows without evidence
- it touches dist/, coverage/, tmp/, build outputs

If uncertain → insert TODO with a brief note rather than guessing.

---

### Step 6: Apply changes

Only apply validated diff.

---

### Step 7: Report and persist
Return:
- changed sections
- evidence sources
- any TODO items

After applying changes:
1. Update `.opencode/memory/AGENTS.md.md` with what changed and why
2. Use ai-memory to store the sync decision (namespace: ai-toolkit, tier: mid)