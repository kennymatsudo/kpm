/**
 * Tests for TrackerError class
 */

import { describe, it, expect } from 'vitest';
import { TrackerError } from './errors';

describe('TrackerError', () => {
  describe('constructor', () => {
    it('creates error with code and message', () => {
      const error = new TrackerError('UNAUTHORIZED', 'Invalid credentials');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.userMessage).toBe('Invalid credentials');
      expect(error.message).toBe('Invalid credentials');
      expect(error.name).toBe('TrackerError');
    });

    it('stores original error as cause', () => {
      const originalError = new Error('Original error');
      const error = new TrackerError('UNKNOWN', 'Something went wrong', originalError);
      expect(error.cause).toBe(originalError);
    });

    it('is instanceof Error', () => {
      const error = new TrackerError('UNKNOWN', 'Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TrackerError);
    });
  });

  describe('fromJiraError', () => {
    describe('HTTP status code mapping', () => {
      it('maps 400 to UNKNOWN with message', () => {
        const jiraError = { status: 400, message: 'Bad request' };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('UNKNOWN');
        expect(error.userMessage).toContain('Bad request');
      });

      it('maps 401 to UNAUTHORIZED', () => {
        const jiraError = { status: 401 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.userMessage).toContain('credentials');
      });

      it('maps 403 to FORBIDDEN', () => {
        const jiraError = { status: 403 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('FORBIDDEN');
        expect(error.userMessage).toContain('Access denied');
      });

      it('maps 404 to NOT_FOUND', () => {
        const jiraError = { status: 404 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('NOT_FOUND');
        expect(error.userMessage).toContain('not found');
      });

      it('maps 410 to UNKNOWN', () => {
        const jiraError = { status: 410 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('UNKNOWN');
        expect(error.userMessage).toContain('API');
      });

      it('maps 429 to RATE_LIMITED', () => {
        const jiraError = { status: 429 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.code).toBe('RATE_LIMITED');
        expect(error.userMessage).toContain('Too many requests');
      });

      it('maps 5xx to SERVER_ERROR', () => {
        const error500 = TrackerError.fromJiraError({ status: 500 });
        expect(error500.code).toBe('SERVER_ERROR');
        expect(error500.userMessage).toContain('Jira is experiencing issues');

        const error502 = TrackerError.fromJiraError({ status: 502 });
        expect(error502.code).toBe('SERVER_ERROR');

        const error503 = TrackerError.fromJiraError({ status: 503 });
        expect(error503.code).toBe('SERVER_ERROR');
      });
    });

    describe('error message extraction', () => {
      it('extracts message from errorMessages array', () => {
        const jiraError = {
          status: 400,
          errorMessages: ['Field X is required', 'Field Y is invalid'],
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toContain('Field X is required');
        expect(error.userMessage).toContain('Field Y is invalid');
      });

      it('extracts message from errors object', () => {
        const jiraError = {
          status: 400,
          errors: {
            summary: 'Summary is required',
            description: 'Description too long',
          },
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toContain('Summary is required');
        expect(error.userMessage).toContain('Description too long');
      });

      it('extracts message from response message', () => {
        const jiraError = {
          status: 400,
          message: 'Generic error message',
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toBe('Generic error message');
      });

      it('prefers errorMessages over errors object', () => {
        const jiraError = {
          status: 400,
          errorMessages: ['Primary message'],
          errors: { field: 'Secondary message' },
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toBe('Primary message');
      });

      it('uses 404 custom message from response', () => {
        const jiraError = {
          status: 404,
          errorMessages: ['Issue Does Not Exist'],
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toBe('Issue Does Not Exist');
      });
    });

    describe('network errors', () => {
      it('handles fetch errors', () => {
        const fetchError = new Error('fetch failed: ENOTFOUND');
        const error = TrackerError.fromJiraError(fetchError);
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.userMessage).toContain('network connection');
      });
    });

    describe('unknown errors', () => {
      it('handles plain Error objects', () => {
        const plainError = new Error('Something unexpected');
        const error = TrackerError.fromJiraError(plainError);
        expect(error.code).toBe('UNKNOWN');
        expect(error.userMessage).toContain('Something unexpected');
      });

      it('handles string errors', () => {
        const error = TrackerError.fromJiraError('string error');
        expect(error.code).toBe('UNKNOWN');
        expect(error.userMessage).toContain('string error');
      });

      it('handles null/undefined', () => {
        const errorNull = TrackerError.fromJiraError(null);
        expect(errorNull.code).toBe('UNKNOWN');

        const errorUndefined = TrackerError.fromJiraError(undefined);
        expect(errorUndefined.code).toBe('UNKNOWN');
      });

      it('handles objects without status', () => {
        const error = TrackerError.fromJiraError({ foo: 'bar' });
        expect(error.code).toBe('UNKNOWN');
      });
    });

    describe('error with custom message for specific status', () => {
      it('uses custom message for 400 when provided', () => {
        const jiraError = {
          status: 400,
          errorMessages: ['JQL query syntax error at position 5'],
        };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toContain('JQL query syntax error');
      });

      it('falls back to default message when no custom message', () => {
        const jiraError = { status: 400 };
        const error = TrackerError.fromJiraError(jiraError);
        expect(error.userMessage).toContain('Bad request');
      });
    });
  });
});
