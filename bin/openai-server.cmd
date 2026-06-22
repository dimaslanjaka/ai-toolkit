@echo off
setlocal
set SCRIPT_DIR=%~dp0

@REM node "%SCRIPT_DIR%run-ts.cjs" "%SCRIPT_DIR%..\src\openai-server\start.ts" "%SCRIPT_DIR%..\dist\openai-server.mjs"
@REM bun run --watch "%SCRIPT_DIR%..\src\openai-server\start.ts"

npx -y nodemon ^
  --watch src ^
  --watch "rollup.*" ^
  --watch "*gulp*.*" ^
  --ext ts,js,mjs,cjs ^
  --ignore "**/tmp/**" ^
  --ignore "**/*.json" ^
  --ignore "**/*.md" ^
  --ignore "**/node_modules/**" ^
  --ignore "**/*test*" ^
  --ignore "**/*runner*" ^
  --ignore "**/frontend/**" ^
  --delay 10 ^
  --exec "tsc -p tsconfig.build.json && set ROLLUP_ENTRIES=src/openai-server/start.ts && gulp buildServer && node dist/openai-server/start.cjs"

@REM npx -y nodemon --watch "src/**/*.{ts,js,mjs,cjs}" --watch "rollup.*.{js,mjs}" --ext "js,ts,cjs,mjs" --ignore "tmp,node_modules" --exec "bun run src/openai-server/start.ts"
