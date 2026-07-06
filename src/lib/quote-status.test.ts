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

    it('does NOT allow ONAY_BEKLIYOR to REVIZYON (approver rejection now routes to TASLAK)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'REVIZYON')).toBe(false);
    });

    it('allows ONAY_BEKLIYOR to TASLAK (retract approval)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'TASLAK')).toBe(true);
    });

    it('allows ONAY_BEKLIYOR to DUZENLEME_TALEP_EDILDI (approver edit request)', () => {
      expect(canTransitionTo('ONAY_BEKLIYOR', 'DUZENLEME_TALEP_EDILDI')).toBe(true);
    });

    it('allows DUZENLEME_TALEP_EDILDI to ONAY_BEKLIYOR (creator resubmits after edits)', () => {
      expect(canTransitionTo('DUZENLEME_TALEP_EDILDI', 'ONAY_BEKLIYOR')).toBe(true);
    });

    it('allows DUZENLEME_TALEP_EDILDI to IPTAL', () => {
      expect(canTransitionTo('DUZENLEME_TALEP_EDILDI', 'IPTAL')).toBe(true);
    });

    it('does NOT allow DUZENLEME_TALEP_EDILDI directly to ONAYLANDI (must go through ONAY_BEKLIYOR)', () => {
      expect(canTransitionTo('DUZENLEME_TALEP_EDILDI', 'ONAYLANDI')).toBe(false);
    });

    it('allows ONAYLANDI to GONDERILDI', () => {
      expect(canTransitionTo('ONAYLANDI', 'GONDERILDI')).toBe(true);
    });

    it('allows ONAYLANDI to TASLAK (creator can reopen for edits before sending)', () => {
      // The "tekrar onaya gönder" button on an approved quote routes
      // through TASLAK so the creator can edit, then re-submit via the
      // standard TASLAK → ONAY_BEKLIYOR path. Direct ONAYLANDI →
      // ONAY_BEKLIYOR is no longer allowed — re-approval without an
      // edit doesn't really make sense.
      expect(canTransitionTo('ONAYLANDI', 'TASLAK')).toBe(true);
    });

    it('does NOT allow ONAYLANDI to ONAY_BEKLIYOR (must go through TASLAK)', () => {
      expect(canTransitionTo('ONAYLANDI', 'ONAY_BEKLIYOR')).toBe(false);
    });

    it('does NOT allow GONDERILDI back to ONAY_BEKLIYOR (no re-approval after send)', () => {
      expect(canTransitionTo('GONDERILDI', 'ONAY_BEKLIYOR')).toBe(false);
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

    it('still allows GONDERILDI to REVIZYON (customer-driven revision)', () => {
      expect(canTransitionTo('GONDERILDI', 'REVIZYON')).toBe(true);
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

    it('allows undoing KAZANILDI back to GONDERILDI or TAKIPTE (client 30.06)', () => {
      expect(canTransitionTo('KAZANILDI', 'GONDERILDI')).toBe(true);
      expect(canTransitionTo('KAZANILDI', 'TAKIPTE')).toBe(true);
    });

    it('does not allow KAZANILDI to jump anywhere else', () => {
      expect(canTransitionTo('KAZANILDI', 'TASLAK')).toBe(false);
      expect(canTransitionTo('KAZANILDI', 'IPTAL')).toBe(false);
      expect(canTransitionTo('KAZANILDI', 'KAYBEDILDI')).toBe(false);
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
      expect(transitions).toContain('IPTAL');
      expect(transitions).toContain('TASLAK');
      expect(transitions).not.toContain('REVIZYON');
    });

    it('returns correct transitions for GONDERILDI', () => {
      const transitions = getAvailableTransitions('GONDERILDI');
      expect(transitions).toContain('TAKIPTE');
      expect(transitions).toContain('KAZANILDI');
      expect(transitions).toContain('KAYBEDILDI');
      expect(transitions).toContain('REVIZYON');
    });

    it('returns correct transitions for ONAYLANDI (includes reopen-for-edits path)', () => {
      const transitions = getAvailableTransitions('ONAYLANDI');
      expect(transitions).toContain('GONDERILDI');
      expect(transitions).toContain('IPTAL');
      expect(transitions).toContain('TASLAK');
      expect(transitions).not.toContain('ONAY_BEKLIYOR');
    });

    it('returns the undo transitions for KAZANILDI (no longer terminal)', () => {
      const transitions = getAvailableTransitions('KAZANILDI');
      expect(transitions).toEqual(['GONDERILDI', 'TAKIPTE']);
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
    it('returns false for KAZANILDI (undoable since 30.06)', () => {
      expect(isTerminalStatus('KAZANILDI')).toBe(false);
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
