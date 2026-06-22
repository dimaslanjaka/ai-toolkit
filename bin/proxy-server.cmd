@echo off

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
  --exec "tsc -p tsconfig.build.json && set ROLLUP_ENTRIES=src/proxy/server.runner.ts && gulp buildServer && node dist/proxy/server.runner.cjs"

@REM node --no-warnings=ExperimentalWarning --loader ts-node/esm src/proxy/server.ts