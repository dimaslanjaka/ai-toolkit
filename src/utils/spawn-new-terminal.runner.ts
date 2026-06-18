import { spawnNodeTsNewTerminal } from './spawn-new-terminal.js';

spawnNodeTsNewTerminal(
  String.raw`D:\Repositories\workspace\packages\ai-toolkit\src\proxy\opencode-checker.runner.ts`,
  [],
  {
    cwd: process.cwd(),
    keepOpen: false, // auto close
    title: 'Proxy Checker'
  }
);

console.log('Proxy checker started in new terminal');
