import { describe, it, expect } from '@jest/globals';
import lint from '@commitlint/lint';
import config from '../commitlint.config.js';

describe('commitlint custom rules', () => {
  describe('subject-case-acronym-safe', () => {
    describe('valid commits (should pass)', () => {
      it('allows simple acronyms (2-8 uppercase letters)', async () => {
        const valid = [
          'feat: add HTTP support',
          'fix: improve URL parsing',
          'feat: implement API client',
          'fix: update UI components',
          'feat: add CSV export',
          'fix: handle DNS resolution'
        ];

        for (const message of valid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(true);
        }
      });

      it('allows Chrome error codes (ERR_*)', async () => {
        const valid = [
          'fix: handle ERR_CONNECTION_REFUSED',
          'fix: resolve ERR_CERT_INVALID',
          'fix: catch ERR_NAME_NOT_RESOLVED',
          'feat: retry on ERR_NETWORK_CHANGED'
        ];

        for (const message of valid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(true);
        }
      });

      it('allows Node error codes (E + 5+ uppercase)', async () => {
        const valid = [
          'fix: handle ENOENT error',
          'fix: catch EACCES gracefully',
          'fix: retry on ETIMEDOUT',
          'fix: handle ECONNREFUSED'
        ];

        for (const message of valid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(true);
        }
      });

      it('allows multiple acronyms in one subject', async () => {
        const valid = [
          'feat: add HTTP API client',
          'fix: handle URL and URI parsing',
          'feat: support CSV and JSON export'
        ];

        for (const message of valid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(true);
        }
      });

      it('allows acronyms anywhere in subject', async () => {
        const valid = [
          'feat: improve HTTP request handling',
          'fix: update API error messages',
          'feat: add support for URL shortening'
        ];

        for (const message of valid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(true);
        }
      });
    });

    describe('invalid commits (should fail)', () => {
      it('rejects uppercase in common words', async () => {
        const invalid = [
          'feat: Add New Feature',
          'fix: Update Configuration File',
          'feat: Implement User Authentication'
        ];

        for (const message of invalid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.name === 'subject-case-acronym-safe')).toBe(true);
        }
      });

      it('rejects mixed case', async () => {
        const invalid = ['feat: add NewFeature', 'fix: update ConfigFile', 'feat: implement UserAuth'];

        for (const message of invalid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(false);
        }
      });

      it('rejects single uppercase letter (not an acronym)', async () => {
        const invalid = ['feat: add X support', 'fix: handle I/O error'];

        for (const message of invalid) {
          const result = await lint(message, config.rules, config);
          expect(result.valid).toBe(false);
        }
      });
    });

    describe('edge cases', () => {
      it('handles acronyms at start of subject', async () => {
        const result = await lint('feat: HTTP client implementation', config.rules, config);
        expect(result.valid).toBe(true);
      });

      it('handles acronyms at end of subject', async () => {
        const result = await lint('feat: add support for HTTP', config.rules, config);
        expect(result.valid).toBe(true);
      });

      it('handles multiple spaces around acronyms', async () => {
        const result = await lint('feat: improve  HTTP  handling', config.rules, config);
        expect(result.valid).toBe(true);
      });

      it('rejects acronyms longer than 8 letters', async () => {
        const result = await lint('feat: add VERYLONGACRONYM support', config.rules, config);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('other conventional commit rules', () => {
    it('requires valid commit type', async () => {
      const result = await lint('invalid: test message', config.rules, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.name === 'type-enum')).toBe(true);
    });

    it('requires minimum subject length', async () => {
      const result = await lint('feat: add', config.rules, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.name === 'subject-min-length')).toBe(true);
    });

    it('rejects trailing period in subject', async () => {
      const result = await lint('feat: add new feature.', config.rules, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.name === 'subject-full-stop')).toBe(true);
    });

    it('allows optional scope', async () => {
      const result = await lint('feat(api): add HTTP client', config.rules, config);
      expect(result.valid).toBe(true);
    });

    it('requires lowercase scope', async () => {
      const result = await lint('feat(API): add client', config.rules, config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.name === 'scope-case')).toBe(true);
    });
  });
});
