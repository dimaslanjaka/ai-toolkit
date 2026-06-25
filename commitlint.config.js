import conventionalConfig from '@commitlint/config-conventional';

const SUBJECT_CASE_DEFAULT_RULES = conventionalConfig.rules['subject-case'];

/**
 * Custom rule: like subject-case from @commitlint/config-conventional,
 * but allows uppercase acronyms (HTTP, URL, API), Chrome error codes (ERR_*),
 * and Node error codes (ENOENT, EACCES, etc.) while keeping other words lowercase.
 *
 * Allowed patterns:
 * - 2-8 uppercase letters surrounded by non-letters: HTTP, URL, API, UI, CSV
 * - Chrome errors: ERR_CONNECTION_REFUSED, ERR_CERT_INVALID
 * - Node errors: ENOENT, EACCES, ETIMEDOUT, ECONNREFUSED (E + 5-15 uppercase letters)
 */
function subjectCaseAcronymSafe(
  parsed = {},
  _when = SUBJECT_CASE_DEFAULT_RULES[1],
  _value = SUBJECT_CASE_DEFAULT_RULES[2]
) {
  const subject = (parsed.subject || '').trim();

  if (!subject) {
    return [true];
  }

  // Remove allowed uppercase patterns before checking case
  // Match acronyms that are complete words (surrounded by non-letter chars or string boundaries)
  // Order matters: match longer patterns first to prevent partial matches
  // - Chrome errors: ERR_ followed by uppercase and underscores (must come before simple acronyms)
  // - Node errors: E followed by 5-15 uppercase letters
  // - Simple acronyms: 2-8 uppercase letters as complete words
  const withoutAcronyms = subject.replace(/(?<![a-zA-Z])(ERR_[A-Z_]+|E[A-Z]{5,15}|[A-Z]{2,8})(?![a-zA-Z])/g, '');

  // After removing valid acronyms, check if any uppercase letters remain
  if (/[A-Z]/.test(withoutAcronyms)) {
    return [
      false,
      'subject must be lowercase (except for allowed acronyms: 2-8 uppercase letters, ERR_*, E[A-Z]{5,8})'
    ];
  }

  return [true];
}

const Configuration = {
  /*
   * Resolve and load @commitlint/config-conventional from node_modules.
   * Referenced packages must be installed
   */
  extends: ['@commitlint/config-conventional'],
  /*
   * Resolve and load conventional-changelog-atom from node_modules.
   * Referenced packages must be installed
   */
  // parserPreset: 'conventional-changelog-atom',
  /*
   * Resolve and load @commitlint/format from node_modules.
   * Referenced package must be installed
   */
  formatter: '@commitlint/format',
  /*
   * Custom plugin to handle acronyms in subject line
   */
  plugins: [
    {
      rules: {
        'subject-case-acronym-safe': subjectCaseAcronymSafe
      }
    }
  ],
  /*
   * Any rules defined here will override rules from @commitlint/config-conventional
   */
  rules: {
    // Subject (description) rules - use custom rule that allows acronyms
    'subject-case': [0], // Disable default rule
    'subject-case-acronym-safe': SUBJECT_CASE_DEFAULT_RULES, // Use custom rule with same severity
    'subject-full-stop': [2, 'never', '.'],
    'subject-empty': [2, 'never'],
    'subject-min-length': [2, 'always', 4],

    // Body rules
    'header-trim': [1, 'always'],
    'header-max-length': [1, 'always', 140],
    'body-max-line-length': [1, 'always', 120],

    // Type rules
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // Scope rules
    'scope-case': [2, 'always', 'lower-case'],
    'scope-empty': [0, 'never'],
    'scope-max-length': [2, 'always', 16],

    // Footer rules
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100]

    // Referenced issues
    // 'references-empty': [0, 'never']
  },
  /*
   * Array of functions that return true if commitlint should ignore the given message.
   * Given array is merged with predefined functions, which consist of matchers like:
   *
   * - 'Merge pull request', 'Merge X into Y' or 'Merge branch X'
   * - 'Revert X'
   * - 'v1.2.3' (ie semver matcher)
   * - 'Automatic merge X' or 'Auto-merged X into Y'
   *
   * To see full list, check https://github.com/conventional-changelog/commitlint/blob/master/%40commitlint/is-ignored/src/defaults.ts.
   * To disable those ignores and run rules always, set `defaultIgnores: false` as shown below.
   */
  // ignores: [(commit) => commit === ''],
  /*
   * Whether commitlint uses the default ignore rules, see the description above.
   */
  defaultIgnores: true,
  /*
   * Custom URL to show upon failure
   */
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint'
  /*
   * Custom prompt configs
   */
  // prompt: {
  //   messages: {},
  //   questions: {
  //     type: {
  //       description: 'please input type:'
  //     }
  //   }
  // }
};

export default Configuration;
