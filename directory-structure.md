# @dimaslanjaka/ai-toolkit — Directory Structure

```
ai-toolkit/
│
├── .cert/                              # mkcert HTTPS certificates (gitignored)
├── .husky/                             # Git hooks
│   ├── commit-msg                      #   Commit message validation
│   └── pre-commit                      #   Pre-commit lint-staged
│
├── bin/                                # CLI entry points and wrappers
│   ├── bcc / bcc.cmd                   #   Binary collections CLI helper
│   ├── openai-server.cmd               #   Dev server launcher (nodemon + rebuild)
│   ├── py / py.cmd                     #   Python wrapper scripts
│   └── run-ts.cjs / run-ts.cmd         #   TypeScript runner via ts-node
│
├── packages/                           # Monorepo workspaces
├── release/                            # Release artifacts (.tgz)
│
├── scripts/                            # Standalone bootstrapper utilities
│   ├── ai-memory-installer.js          #   Download ai-memory-mcp binary
│   └── sqlite-installer.js             #   Download SQLite precompiled binary
│
├── src/                                # Source code (primary development area)
│   │
│   ├── config.ts                       #   Config loader (re-exports binary-collections)
│   ├── index.ts                        #   Public API entry point
│   │
│   ├── database/                       #   Database layer (SQLite + MySQL)
│   │   ├── MySQLHelper.ts              #     MySQL/MariaDB helper
│   │   ├── ProxyDB.ts                  #     Proxy database service
│   │   ├── SQLiteHelper.ts             #     SQLite connection/query helper
│   │   ├── SQLiteMarker.ts             #     SQLite marker/tracking
│   │   ├── SQLiteModel.ts             #     ORM-like SQLite model
│   │   ├── SQLiteModel-migration.ts    #     DB migration logic
│   │   ├── SQLiteModel.sql             #     DDL schema
│   │   ├── SQLiteModel-seed.sql        #     Seed data
│   │   ├── SQLiteProxy.ts             #     Proxy SQLite model
│   │   ├── SQLiteProxy.sql             #     Proxy DDL schema
│   │   ├── schema.sql                  #     General SQL schema
│   │   ├── shared.ts                   #     Shared DB utilities
│   │   └── types.ts                    #     Database TypeScript types
│   │
│   ├── diff-patcher/                   #   Diff generation and patching
│   │   ├── index.ts                    #     Public API
│   │   ├── patcher.ts                  #     Core patch application
│   │   ├── generate-diff.ts            #     Unified diff generation
│   │   ├── sample.runner.ts            #     Basic usage demo
│   │   └── sample-in-file-edit.runner.ts  #  In-file edit demo
│   │
│   ├── mcp-server/                     #   Model Context Protocol server
│   │   ├── index.js                    #     Entry point
│   │   ├── server-memory.ts            #     Memory MCP server
│   │   ├── ollama.js                   #     Ollama integration
│   │   ├── ollama.md                   #     Ollama usage docs
│   │   ├── context-compress/           #     Context compression module
│   │   ├── librarian/                  #     Research/librarian module
│   │   └── utils/                      #     MCP utilities
│   │
│   ├── openai-server/                  #   OpenAI-compatible API server
│   │   ├── index.ts                    #     Module public API
│   │   ├── server.ts                   #     Express server with provider routing
│   │   ├── start.ts                    #     Server entry point
│   │   ├── utils.ts                    #     Server utilities
│   │   ├── responses-adapter.ts        #     OpenAI responses API adapter
│   │   ├── README.md                   #     Server documentation
│   │   ├── thingking-concept.md        #     Thinking/reasoning concepts
│   │   ├── frontend/                   #     Web chat UI (Vite + React)
│   │   │   ├── index.html              #       Entry HTML
│   │   │   └── src/                    #       React components
│   │   ├── provider/                   #     Backend providers
│   │   │   ├── index.ts                #       Provider registry/selection
│   │   │   ├── chatgpt.ts             #       ChatGPT (Puppeteer) provider
│   │   │   ├── opencode.ts            #       OpenCode provider
│   │   │   └── puter.ts               #       Puter AI provider (default)
│   │   ├── proxy/                      #     Proxy management for server
│   │   │   └── proxy-checker-manager.ts  #   Proxy validation manager
│   │   └── *.runner.ts                 #     Standalone test runners
│   │
│   ├── provider/                       #   AI provider wrappers (non-server)
│   │   ├── index.ts                    #     Public API
│   │   ├── chatgpt/                    #     ChatGPT API client
│   │   │   ├── get.ts                  #       Model fetch
│   │   │   └── get.runner.ts           #       Runner
│   │   ├── kiro/                       #     KiroChat provider
│   │   │   ├── get.ts                  #       Model fetch
│   │   │   ├── kiro-token.ts           #       Token management
│   │   │   ├── get.runner.ts           #       Runner
│   │   │   └── kiro-token.runner.ts    #       Token runner
│   │   ├── openai/                     #     Generic OpenAI provider
│   │   │   ├── checkSupportedModels.mjs  #   Model support checker
│   │   │   └── toke.txt
│   │   ├── opencode/                   #     OpenCode provider
│   │   │   └── get.ts                  #       Model fetch
│   │   └── puter/                      #     Puter AI provider
│   │       ├── get.ts                  #       Model fetch
│   │       └── get.runner.ts           #       Runner
│   │
│   ├── proxy/                          #   Proxy checker and management
│   │   ├── checker.ts                  #     Core validation logic
│   │   ├── checker.runner.ts           #     CLI runner (→ check-proxy binary)
│   │   ├── opencode-checker.ts         #     OpenCode-specific checker
│   │   ├── opencode-checker.runner.ts  #     CLI runner (→ opc-check-proxy binary)
│   │   ├── proxies-data.ts             #     Proxy list data source
│   │   └── proxy-checker-lock.ts       #     Concurrency lock
│   │
│   ├── puppeteer/                      #   Browser automation (Puppeteer)
│   │   ├── launcher.js                 #     Chrome/Chromium launcher
│   │   ├── cookies.js                  #     Session cookie persistence
│   │   ├── chatgpt.runner.js           #     ChatGPT runner
│   │   ├── z-ai.js / z-ai.runner.js    #     Z-AI provider
│   │   └── chatgpt/                    #     ChatGPT web automation
│   │       ├── index.js                #       Module entry
│   │       ├── run.js                  #       Main automation flow
│   │       ├── state.js                #       Session state
│   │       ├── login.js                #       Login flow
│   │       ├── isLoggedIn.js           #       Login status check
│   │       ├── writeQuestion.js        #       Question input
│   │       ├── clickSubmitButton.js    #       Submit button handler
│   │       ├── waitForInitialResponse.js  #    Initial response waiter
│   │       ├── handleStreamingResponse.js #   Streaming response handler
│   │       └── pickExistingChat.js     #       Existing chat selector
│   │
│   └── utils/                          #   Shared utilities
│       ├── env.ts                      #     Environment variable helpers
│       ├── logs.cjs                    #     Logging utilities
│       ├── buildOpenAIClient.ts        #     OpenAI client builder (with proxy)
│       ├── buildOpenAIClient.runner.ts #     Runner
│       ├── spawn-new-terminal.ts       #     Process spawner (new terminal)
│       └── spawn-new-terminal.runner.ts #    Runner
│
├── test/                               # Test suite (Jest)
│   ├── database/                       #   Database tests
│   ├── ollama/                         #   Ollama integration tests
│   ├── openai-server/                  #   OpenAI server tests
│   ├── proxy/                          #   Proxy tests
│   ├── puppeteer/                      #   Puppeteer tests
│   ├── mcp-context-compress.runner.mjs #   MCP compression test
│   └── openai.js                       #   OpenAI client tests
│
├── .env / .env.example                 # Environment configuration
├── .gitignore                          # Git ignore rules
├── .gitattributes                      # Git attribute rules
├── .yarnrc.yml                         # Yarn Berry settings
│
├── package.json                        # NPM package definition (dual CJS/ESM)
├── README.md                           # Project overview
├── AGENTS.md                           # AI agent instructions
├── tsconfig.json                       # Root TypeScript config
├── tsconfig.build.json                 # Build TS config (→ tmp/dist/)
├── tsconfig.dts.json                   # Declaration file config
├── rollup.config.js                    # Rollup bundler config
├── rollup-utils.js                     # Rollup shared utilities
├── rollup.executor.js                  # Programmatic Rollup runner
├── gulpfile.js                         # Gulp build pipeline
├── vite.config.mjs                     # Vite frontend build config
├── jest.config.mjs                     # Jest test runner config
├── eslint.config.mjs                   # ESLint flat config
├── .prettierrc.json                    # Prettier formatting rules
├── commitlint.config.js                # Commitlint conventional commits
├── lint-staged.config.js               # Lint-staged hook rules
├── binary-collections.config.js        # binary-collections settings
│
└── pyproject.toml                      # Python project config
```

