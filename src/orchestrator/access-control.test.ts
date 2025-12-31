
import { describe, it, expect } from 'bun:test';
import {
    isChiefOfStaff,
    isProtectedAgent,
    canCallAgent,
    PROTECTED_AGENTS
} from './access-control';

describe('Access Control', () => {

    describe('isChiefOfStaff', () => {
        it('returns true for exact match', () => {
            expect(isChiefOfStaff('chief-of-staff')).toBe(true);
        });

        it('returns true for hierarchical match', () => {
            expect(isChiefOfStaff('chief-of-staff/scheduler')).toBe(true);
        });

        it('returns true for root user (empty string)', () => {
            expect(isChiefOfStaff('')).toBe(true);
        });

        it('returns false for other agents', () => {
            expect(isChiefOfStaff('other-agent')).toBe(false);
            expect(isChiefOfStaff('oracle')).toBe(false);
        });
    });

    describe('isProtectedAgent', () => {
        it('returns true for known protected agents', () => {
            expect(isProtectedAgent('oracle')).toBe(true);
            expect(isProtectedAgent('planner')).toBe(true);
        });

        it('returns true for hierarchical protected agents', () => {
            expect(isProtectedAgent('chief-of-staff/oracle')).toBe(true);
        });

        it('returns false for unknown agents', () => {
            expect(isProtectedAgent('random-worker')).toBe(false);
        });
    });

    describe('canCallAgent', () => {
        it('allows Chief of Staff to call anyone', () => {
            const result = canCallAgent('chief-of-staff', 'oracle');
            expect(result.allowed).toBe(true);
        });

        it('allows User to call anyone', () => {
            const result = canCallAgent('', 'oracle');
            expect(result.allowed).toBe(true);
        });

        it('prevents random agent from calling protected agent', () => {
            const result = canCallAgent('random-worker', 'oracle', true);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('only responds to chief-of-staff');
        });

        it('prevents random agent from calling protected sub-agent', () => {
            const result = canCallAgent('random-worker', 'chief-of-staff/oracle');
            expect(result.allowed).toBe(false);
        });

        it('allows calling non-protected agents', () => {
            const result = canCallAgent('random-worker', 'other-agent');
            expect(result.allowed).toBe(true);
        });

        // Regression case: User calling 'Code' or 'Ask' (native agents)
        it('allows user to call native agents', () => {
            const result = canCallAgent('', 'Code');
            expect(result.allowed).toBe(true);
        });
    });

});
