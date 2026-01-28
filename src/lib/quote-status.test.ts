import { describe, it, expect } from 'vitest';
import {
  canTransitionTo,
  getAvailableTransitions,
  isTerminalStatus,
  requiresApproval,
  QuoteStatus,
} from './quote-status';

describe('Quote Status Transitions', () => {
  describe('canTransitionTo', () => {
    it('allows TASLAK to ONAY_BEKLIYOR', () => {
      expect(canTransitionTo('TASLAK', 'ONAY_BEKLIYOR')).toBe(true);
    });

    it('allows TASLAK to IPTAL', () => {
      expect(canTransitionTo('TASLAK', 'IPTAL')).toBe(true);
    });

    it('does not allow TASLAK to KAZANILDI directly', () => {
      expect(canTransitionTo('TASLAK', 'KAZANILDI')).toBe(false);
    });

    it('allows ONAY_BEKLIYOR to ONAYLANDI', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'ONAYLANDI')).toBe(true);
    });

    it('allows ONAY_BEKLIYOR to REVIZYON (rejection)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON')).toBe(true);
    });

    it('allows ONAYLANDI to GONDERILDI', () => {
      expect(canTransitionTo('ONAYLANDI', 'GONDERILDI')).toBe(true);
    });

    it('allows GONDERILDI to TAKIPTE', () => {
      expect(canTransitionTo('GONDERILDI', 'TAKIPTE')).toBe(true);
    });

    it('allows GONDERILDI to KAZANILDI', () => {
      expect(canTransitionTo('GONDERILDI', 'KAZANILDI')).toBe(true);
    });

    it('allows GONDERILDI to KAYBEDILDI', () => {
      expect(canTransitionTo('GONDERILDI', 'KAYBEDILDI')).toBe(true);
    });

    it('allows TAKIPTE to KAZANILDI', () => {
      expect(canTransitionTo('TAKIPTE', 'KAZANILDI')).toBe(true);
    });

    it('allows TAKIPTE to KAYBEDILDI', () => {
      expect(canTransitionTo('TAKIPTE', 'KAYBEDILDI')).toBe(true);
    });

    it('allows TAKIPTE to REVIZYON', () => {
      expect(canTransitionTo('TAKIPTE', 'REVIZYON')).toBe(true);
    });

    it('allows REVIZYON to ONAY_BEKLIYOR', () => {
      expect(canTransitionTo('REVIZYON', 'ONAY_BEKLIYOR')).toBe(true);
    });

    it('does not allow transition from KAZANILDI', () => {
      expect(canTransitionTo('KAZANILDI', 'TASLAK')).toBe(false);
      expect(canTransitionTo('KAZANILDI', 'IPTAL')).toBe(false);
    });

    it('does not allow transition from KAYBEDILDI', () => {
      expect(canTransitionTo('KAYBEDILDI', 'TASLAK')).toBe(false);
      expect(canTransitionTo('KAYBEDILDI', 'TAKIPTE')).toBe(false);
    });

    it('does not allow transition from IPTAL', () => {
      expect(canTransitionTo('IPTAL', 'TASLAK')).toBe(false);
    });

    it('does not allow transition to same status', () => {
      expect(canTransitionTo('TASLAK', 'TASLAK')).toBe(false);
      expect(canTransitionTo('GONDERILDI', 'GONDERILDI')).toBe(false);
    });
  });

  describe('getAvailableTransitions', () => {
    it('returns correct transitions for TASLAK', () => {
      const transitions = getAvailableTransitions('TASLAK');
      expect(transitions).toContain('ONAY_BEKLIYOR');
      expect(transitions).toContain('IPTAL');
      expect(transitions).not.toContain('KAZANILDI');
    });

    it('returns correct transitions for ONAY_BEKLIYOR', () => {
      const transitions = getAvailableTransitions('ONAY_BEKLIYOR');
      expect(transitions).toContain('ONAYLANDI');
      expect(transitions).toContain('REVIZYON');
      expect(transitions).toContain('IPTAL');
    });

    it('returns correct transitions for GONDERILDI', () => {
      const transitions = getAvailableTransitions('GONDERILDI');
      expect(transitions).toContain('TAKIPTE');
      expect(transitions).toContain('KAZANILDI');
      expect(transitions).toContain('KAYBEDILDI');
      expect(transitions).toContain('REVIZYON');
    });

    it('returns empty array for KAZANILDI (terminal)', () => {
      const transitions = getAvailableTransitions('KAZANILDI');
      expect(transitions).toEqual([]);
    });

    it('returns empty array for KAYBEDILDI (terminal)', () => {
      const transitions = getAvailableTransitions('KAYBEDILDI');
      expect(transitions).toEqual([]);
    });

    it('returns empty array for IPTAL (terminal)', () => {
      const transitions = getAvailableTransitions('IPTAL');
      expect(transitions).toEqual([]);
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for KAZANILDI', () => {
      expect(isTerminalStatus('KAZANILDI')).toBe(true);
    });

    it('returns true for KAYBEDILDI', () => {
      expect(isTerminalStatus('KAYBEDILDI')).toBe(true);
    });

    it('returns true for IPTAL', () => {
      expect(isTerminalStatus('IPTAL')).toBe(true);
    });

    it('returns false for TASLAK', () => {
      expect(isTerminalStatus('TASLAK')).toBe(false);
    });

    it('returns false for GONDERILDI', () => {
      expect(isTerminalStatus('GONDERILDI')).toBe(false);
    });

    it('returns false for TAKIPTE', () => {
      expect(isTerminalStatus('TAKIPTE')).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('returns true for ONAY_BEKLIYOR', () => {
      expect(requiresApproval('ONAY_BEKLIYOR')).toBe(true);
    });

    it('returns false for TASLAK', () => {
      expect(requiresApproval('TASLAK')).toBe(false);
    });

    it('returns false for ONAYLANDI', () => {
      expect(requiresApproval('ONAYLANDI')).toBe(false);
    });

    it('returns false for GONDERILDI', () => {
      expect(requiresApproval('GONDERILDI')).toBe(false);
    });
  });
});
