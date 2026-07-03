/**
 * Parses --proxies and --host CLI arguments for proxy checker runners.
 * Example: node checker.runner.ts --proxies=1.2.3.4:80,5.6.7.8:8080 --host=api.example.com
 */
export function parseRunnerArgs(): { proxies: string[] | null; host: string | null } {
  const proxiesArg = process.argv.find((a) => a.startsWith('--proxies='));
  const hostArg = process.argv.find((a) => a.startsWith('--host='));
  return {
    proxies: proxiesArg ? proxiesArg.split('=', 2)[1].split(',').filter(Boolean) : null,
    host: hostArg ? hostArg.split('=', 2)[1] : null
  };
}
