import { describe, it, expect } from 'vitest';
import {
  needsApproval,
  getApprovalReasons,
  ApprovalReason,
  ApprovalThresholds,
  DEFAULT_THRESHOLDS,
} from './approval-rules';

describe('Approval Rules', () => {
  describe('needsApproval', () => {
    it('returns false for quote under all thresholds', () => {
      const result = needsApproval({
        totalValue: 5000,
        maxDiscountPct: 10,
        minKatsayi: 1.0,
      });
      expect(result).toBe(false);
    });

    it('returns true when total value exceeds threshold', () => {
      const result = needsApproval({
        totalValue: 60000, // Default threshold is 50000
        maxDiscountPct: 5,
        minKatsayi: 1.2,
      });
      expect(result).toBe(true);
    });

    it('returns true when discount exceeds threshold', () => {
      const result = needsApproval({
        totalValue: 5000,
        maxDiscountPct: 25, // Default threshold is 20%
        minKatsayi: 1.2,
      });
      expect(result).toBe(true);
    });

    it('returns true when katsayi is below threshold', () => {
      const result = needsApproval({
        totalValue: 5000,
        maxDiscountPct: 10,
        minKatsayi: 0.8, // Default threshold is 0.9
      });
      expect(result).toBe(true);
    });

    it('returns true when multiple thresholds are exceeded', () => {
      const result = needsApproval({
        totalValue: 100000,
        maxDiscountPct: 30,
        minKatsayi: 0.7,
      });
      expect(result).toBe(true);
    });

    it('respects custom thresholds', () => {
      const customThresholds: ApprovalThresholds = {
        maxValueWithoutApproval: 100000,
        maxDiscountPctWithoutApproval: 30,
        minKatsayiWithoutApproval: 0.8,
      };

      // Under custom thresholds
      const result1 = needsApproval(
        {
          totalValue: 80000,
          maxDiscountPct: 25,
          minKatsayi: 0.85,
        },
        customThresholds
      );
      expect(result1).toBe(false);

      // Over custom thresholds
      const result2 = needsApproval(
        {
          totalValue: 150000,
          maxDiscountPct: 25,
          minKatsayi: 0.85,
        },
        customThresholds
      );
      expect(result2).toBe(true);
    });

    it('handles edge case at exact threshold value', () => {
      // At exactly the threshold should NOT need approval
      const result = needsApproval({
        totalValue: 50000, // Exactly at threshold
        maxDiscountPct: 20, // Exactly at threshold
        minKatsayi: 0.9, // Exactly at threshold
      });
      expect(result).toBe(false);
    });

    it('handles zero values', () => {
      const result = needsApproval({
        totalValue: 0,
        maxDiscountPct: 0,
        minKatsayi: 1.0,
      });
      expect(result).toBe(false);
    });
  });

  describe('getApprovalReasons', () => {
    it('returns empty array when no approval needed', () => {
      const reasons = getApprovalReasons({
        totalValue: 5000,
        maxDiscountPct: 10,
        minKatsayi: 1.0,
      });
      expect(reasons).toEqual([]);
    });

    it('returns HIGH_VALUE reason when value exceeds threshold', () => {
      const reasons = getApprovalReasons({
        totalValue: 60000,
        maxDiscountPct: 10,
        minKatsayi: 1.0,
      });
      expect(reasons).toContain('HIGH_VALUE');
      expect(reasons).toHaveLength(1);
    });

    it('returns HIGH_DISCOUNT reason when discount exceeds threshold', () => {
      const reasons = getApprovalReasons({
        totalValue: 5000,
        maxDiscountPct: 25,
        minKatsayi: 1.0,
      });
      expect(reasons).toContain('HIGH_DISCOUNT');
      expect(reasons).toHaveLength(1);
    });

    it('returns LOW_KATSAYI reason when katsayi is below threshold', () => {
      const reasons = getApprovalReasons({
        totalValue: 5000,
        maxDiscountPct: 10,
        minKatsayi: 0.8,
      });
      expect(reasons).toContain('LOW_KATSAYI');
      expect(reasons).toHaveLength(1);
    });

    it('returns multiple reasons when multiple thresholds exceeded', () => {
      const reasons = getApprovalReasons({
        totalValue: 100000,
        maxDiscountPct: 30,
        minKatsayi: 0.7,
      });
      expect(reasons).toContain('HIGH_VALUE');
      expect(reasons).toContain('HIGH_DISCOUNT');
      expect(reasons).toContain('LOW_KATSAYI');
      expect(reasons).toHaveLength(3);
    });

    it('respects custom thresholds', () => {
      const customThresholds: ApprovalThresholds = {
        maxValueWithoutApproval: 10000,
        maxDiscountPctWithoutApproval: 15,
        minKatsayiWithoutApproval: 1.0,
      };

      const reasons = getApprovalReasons(
        {
          totalValue: 15000,
          maxDiscountPct: 18,
          minKatsayi: 0.95,
        },
        customThresholds
      );
      expect(reasons).toContain('HIGH_VALUE');
      expect(reasons).toContain('HIGH_DISCOUNT');
      expect(reasons).toContain('LOW_KATSAYI');
    });
  });

  describe('DEFAULT_THRESHOLDS', () => {
    it('has sensible default values', () => {
      expect(DEFAULT_THRESHOLDS.maxValueWithoutApproval).toBe(50000);
      expect(DEFAULT_THRESHOLDS.maxDiscountPctWithoutApproval).toBe(20);
      expect(DEFAULT_THRESHOLDS.minKatsayiWithoutApproval).toBe(0.9);
    });
  });

  describe('ApprovalReason type', () => {
    it('includes all expected reason types', () => {
      const reasons: ApprovalReason[] = ['HIGH_VALUE', 'HIGH_DISCOUNT', 'LOW_KATSAYI'];
      expect(reasons).toHaveLength(3);
    });
  });
});
