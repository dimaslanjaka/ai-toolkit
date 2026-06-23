-- -------------------------------------------------
-- chatgpt provider (src\openai-server\provider\chatgpt.ts)
-- -------------------------------------------------
INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'gpt-4o',
    'model',
    1718380395,
    'openai',
    '[]',
    'gpt-4o',
    NULL,
    'chatgpt',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'gpt-4',
    'model',
    1687882411,
    'openai',
    '[]',
    'gpt-4',
    NULL,
    'chatgpt',
    1
  );

-- -------------------------------------------------
-- opencode provider (src\openai-server\provider\opencode.ts)
-- -------------------------------------------------
INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'deepseek-v4-flash-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'deepseek-v4-flash-free',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'big-pickle',
    'model',
    1718380395,
    'opencode',
    '[]',
    'big-pickle',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'mimo-v2.5-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'mimo-v2.5-free',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'qwen3.6-plus-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'qwen3.6-plus-free',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'minimax-m3-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'minimax-m3-free',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'nemotron-3-ultra-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'nemotron-3-ultra-free',
    NULL,
    'opencode',
    1
  );

INSERT
OR IGNORE INTO "models" (
  "id",
  "object",
  "created",
  "owned_by",
  "permission",
  "root",
  "parent",
  "provider",
  "enabled"
)
VALUES
  (
    'north-mini-code-free',
    'model',
    1718380395,
    'opencode',
    '[]',
    'north-mini-code-free',
    NULL,
    'opencode',
    1
  );

-- -------------------------------------------------
-- puter provider (src\openai-server\provider\puter.ts)
-- -------------------------------------------------
-- Claude models (provider = anthropic)
INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-fable-5',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-fable-5',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4.8-fast',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4.8-fast',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4-8',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4-8',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4.7-fast',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4.7-fast',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4-7',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4-7',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4.6-fast',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4.6-fast',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-sonnet-4-6',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-sonnet-4-6',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4-6',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4-6',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4-5',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4-5',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-haiku-4-5',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-haiku-4-5',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-sonnet-4-5',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-sonnet-4-5',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4-1',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4-1',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-opus-4',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-opus-4',
    NULL,
    'puter',
    1
  );

INSERT
OR IGNORE INTO "models"
VALUES
  (
    'claude-sonnet-4',
    'model',
    1718380395,
    'anthropic',
    '[]',
    'claude-sonnet-4',
    NULL,
    'puter',
    1
  );

-- -------------------------------------------------
-- End of seed script
