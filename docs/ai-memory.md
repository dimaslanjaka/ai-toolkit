# AI Memory CRUD Instructions

Comprehensive guide for managing persistent agent memory using the ai-memory MCP system.

## Overview

This project uses **ai-memory MCP** (SQLite-backed) for semantic recall and persistent agent knowledge across sessions. Database located at `.opencode/memory/memories.db`.

## Core Operations

### STORE — Create or Update Memory

```javascript
memory_store(title, content, tier, namespace, tags, priority)
```

**Parameters:**
- `title` (string, required): Unique identifier per namespace. Storing existing `title+namespace` updates the memory.
- `content` (string, required): Memory content (use TOON compact format by default).
- `tier` (string, required): Storage tier:
  - `short` — 6 hours
  - `mid` — 7 days (auto-promotes to `long` after 5 accesses)
  - `long` — permanent
- `namespace` (string, required): Project/topic organization (e.g., `"ai-toolkit"`)
- `tags` (array[string], optional): Cross-cutting concerns for filtering
- `priority` (number, 0-10, optional): Recall ranking weight

**Usage Pattern:**
- **User corrections/teachings:** `tier: "long"`, `priority: 9`
- **Session findings:** `tier: "mid"`, `priority: 6-8`
- **Temporary context:** `tier: "short"`, `priority: 5`

**Example:**
```javascript
memory_store({
  title: "commitlint acronym-safe subject case rule",
  content: "Custom rule allowing uppercase acronyms (HTTP, API, URL)...",
  tier: "long",
  namespace: "ai-toolkit",
  tags: ["commitlint", "conventional-commits", "regex"],
  priority: 7
})
```

**Returns:**
```json
{
  "id": "ba6fd55e-4d84-4011-ade0-13728bd27c54",
  "namespace": "ai-toolkit",
  "tier": "long",
  "title": "commitlint acronym-safe subject case rule"
}
```

---

### RECALL — Semantic Search

```javascript
memory_recall(context, namespace)
```

**Parameters:**
- `context` (string, required): Natural language query describing what you need
- `namespace` (string, optional): Filter to specific project/topic

**Usage Pattern:**
- **Conversation start:** Always recall relevant context first
- **Before answering questions:** Check if prior work exists

**Example:**
```javascript
memory_recall({
  context: "commitlint configuration and conventional commit rules",
  namespace: "ai-toolkit"
})
```

**Returns:** TOON compact format with ranked results by relevance + priority.

---

### SEARCH — Exact Keyword Match

```javascript
memory_search(query, namespace)
```

**Parameters:**
- `query` (string, required): Exact keywords (AND logic)
- `namespace` (string, optional): Filter to specific project/topic

**Difference from RECALL:**
- `recall` — semantic/fuzzy matching (use for "what do I know about X?")
- `search` — exact keyword AND matching (use for "find memories containing exact phrase Y")

**Example:**
```javascript
memory_search({
  query: "ERR_CONNECTION_REFUSED regex",
  namespace: "ai-toolkit"
})
```

---

### LIST — Browse with Filters

```javascript
memory_list(namespace, tier)
```

**Parameters:**
- `namespace` (string, optional): Filter by project/topic
- `tier` (string, optional): Filter by storage tier (`short`, `mid`, `long`)

**Example:**
```javascript
memory_list({
  namespace: "ai-toolkit",
  tier: "long"
})
```

**Returns:** Count + list of memories with metadata (id, title, tier, priority, tags).

---

### GET — Retrieve Single Memory

```javascript
memory_get(id)
```

**Parameters:**
- `id` (string, required): Memory UUID from prior store/list/recall

**Returns:** Full memory with metadata + links (if any).

**Example:**
```javascript
memory_get({
  id: "ba6fd55e-4d84-4011-ade0-13728bd27c54"
})
```

---

### DELETE — Remove Memory

**Via MCP:** Not exposed as tool; use CLI or direct SQLite access.

**Via CLI:**
```bash
C:\Users\Dell\.local\bin\ai-memory.exe --db ".opencode\memory\memories.db" delete <memory-id>
```

**Batch Delete Example:**
```bash
ai-memory.exe --db ".opencode\memory\memories.db" delete <id1> && \
ai-memory.exe --db ".opencode\memory\memories.db" delete <id2>
```

---

## Advanced Operations

### PROMOTE — Upgrade Tier

```javascript
memory_promote(id)
```

Promotes `mid` → `long`, clears expiry. Use when a mid-tier memory proves valuable long-term.

---

### LINK — Create Relationships

```javascript
memory_link(source_id, target_id, relation)
```

**Relations:**
- `related_to` — general association
- `supersedes` — newer replaces older
- `contradicts` — conflict marker
- `derived_from` — child/parent
- `reflects_on` — meta-commentary

**Example:**
```javascript
memory_link({
  source_id: "73439e56-924b-4344-8237-8e25e037621c",
  target_id: "ba6fd55e-4d84-4011-ade0-13728bd27c54",
  relation: "supersedes"
})
```

---

## Consolidation Pattern

**Manual Consolidation (when `memory_consolidate` unavailable):**

1. **Identify related memories:**
   ```javascript
   memory_list({ namespace: "ai-toolkit", tier: "long" })
   ```

2. **Retrieve full content:**
   ```javascript
   memory_get({ id: "memory-1" })
   memory_get({ id: "memory-2" })
   // ... etc
   ```

3. **Create unified memory:**
   ```javascript
   memory_store({
     title: "Consolidated: Git workflow and AGENTS.md policies",
     content: "Combined content from multiple memories...",
     tier: "long",
     namespace: "ai-toolkit",
     priority: 9,
     tags: ["git-workflow", "agents-md", "documentation-policy"]
   })
   ```

4. **Delete redundant memories:**
   ```bash
   ai-memory.exe --db ".opencode\memory\memories.db" delete <old-id-1>
   ai-memory.exe --db ".opencode\memory\memories.db" delete <old-id-2>
   ```

---

## Best Practices

### When to Store
- ✅ User corrects/teaches you something
- ✅ Complex debugging findings
- ✅ Architecture decisions
- ✅ Project-specific patterns
- ❌ Ephemeral conversation context (use mid/short tier)
- ❌ General programming knowledge

### Namespace Strategy
- Use project name for project-specific knowledge: `"ai-toolkit"`
- Use domain for cross-project patterns: `"nodejs"`, `"react"`, `"git-workflows"`
- Keep consistent across sessions

### Priority Guidelines
- **10**: Critical project decisions (rare)
- **9**: User corrections, core patterns
- **7-8**: Important findings, bug fixes
- **5-6**: Useful context, session summaries
- **1-4**: Low-priority notes

### Tag Strategy
- Use lowercase, hyphen-separated: `conventional-commits`, `git-workflow`
- Tag by: technology, feature, problem domain
- Avoid over-tagging (3-5 tags max)

---

## Delegation Guidance

When using specialist agents (`@oracle`, `@librarian`, `@explorer`), instruct them to:

1. **Recall relevant memories before starting work:**
   ```
   "Before researching, recall any prior knowledge about commitlint from ai-memory."
   ```

2. **Store findings after completion:**
   ```
   "Store your findings in ai-memory under namespace 'ai-toolkit' with appropriate tags."
   ```

3. **Use project-aligned namespaces:**
   - Always pass the current project namespace
   - Keep consistent with orchestrator's namespace strategy

---

## Configuration

### Environment Variables
- `AI_MEMORY_TIER`: Set default tier (default: `semantic`)
  - Controls MCP server behavior for automatic tier assignment
  - Override per-call using explicit `tier` parameter in `memory_store`

### Database Location
- Project-specific: `.opencode/memory/memories.db` (auto-created)
- CLI default: `~/.local/share/ai-memory/` (global install)

---

## Usage Patterns

### Conversation Start
**RECALL FIRST**: Always call `memory_recall` with relevant context before answering questions about prior work.

```javascript
memory_recall({
  context: "commitlint configuration and git workflow",
  namespace: "ai-toolkit"
})
```

### User Corrections/Teachings
**STORE LEARNINGS**: When user corrects or teaches, call `memory_store` with `tier: "long"`, `priority: 9`.

```javascript
memory_store({
  title: "User preference: avoid overcomplicating simple tasks",
  content: "User feedback: keep solutions simple, avoid adding abstractions...",
  tier: "long",
  namespace: "ai-toolkit",
  priority: 9,
  tags: ["user-preference", "workflow"]
})
```

### Namespace Organization
**NAMESPACES**: Organize by project/topic; always pass namespace when storing/recalling.

- Project-specific: `"ai-toolkit"`, `"my-app"`
- Domain-specific: `"nodejs"`, `"react"`, `"git-workflows"`
- Keep consistent across sessions and specialist agents

---

## Troubleshooting

### CLI Not Found
```bash
# Install via project script
node scripts/ai-memory-installer.js

# Or use global install
where ai-memory  # Windows
which ai-memory  # Linux/macOS
```

### Wrong Database
CLI defaults to `~/.local/share/ai-memory/`. Always specify project database:
```bash
ai-memory.exe --db ".opencode\memory\memories.db" <command>
```

### Deduplication
Storing with existing `title + namespace` **updates** the memory instead of creating duplicate. Use this for iterative refinement.

---

## Related Documentation

- **Letta-compatible markdown files:** See `.opencode/memory/*.md` for version-controlled, human-readable memory blocks
- **AGENTS.md memory guidance:** Lines 40-73 in `AGENTS.md`
- **Full tool reference:** https://github.com/alphaonedev/ai-memory-mcp/tree/main

---

**Last Updated:** 2026-06-25
