/**
 * Approval rules for quotes
 * Determines when a quote requires manager approval before being sent
 */

export type ApprovalReason = 'HIGH_VALUE' | 'HIGH_DISCOUNT' | 'LOW_KATSAYI';

export interface ApprovalThresholds {
  /** Maximum quote value that doesn't require approval */
  maxValueWithoutApproval: number;
  /** Maximum discount percentage that doesn't require approval */
  maxDiscountPctWithoutApproval: number;
  /** Minimum katsayi coefficient that doesn't require approval */
  minKatsayiWithoutApproval: number;
}

export interface QuoteApprovalInput {
  /** Total value of the quote */
  totalValue: number;
  /** Maximum discount percentage applied to any item */
  maxDiscountPct: number;
  /** Minimum katsayi coefficient used in any item */
  minKatsayi: number;
}

/**
 * Default thresholds for approval rules
 * These can be overridden per company or globally in settings
 */
export const DEFAULT_THRESHOLDS: ApprovalThresholds = {
  maxValueWithoutApproval: 50000,
  maxDiscountPctWithoutApproval: 20,
  minKatsayiWithoutApproval: 0.9,
};

/**
 * Check if a quote needs manager approval
 * @param input - Quote metrics to check
 * @param thresholds - Optional custom thresholds (uses defaults if not provided)
 * @returns true if approval is needed
 */
export function needsApproval(
  input: QuoteApprovalInput,
  thresholds: ApprovalThresholds = DEFAULT_THRESHOLDS
): boolean {
  return getApprovalReasons(input, thresholds).length > 0;
}

/**
 * Get the reasons why a quote needs approval
 * @param input - Quote metrics to check
 * @param thresholds - Optional custom thresholds (uses defaults if not provided)
 * @returns Array of approval reasons (empty if no approval needed)
 */
export function getApprovalReasons(
  input: QuoteApprovalInput,
  thresholds: ApprovalThresholds = DEFAULT_THRESHOLDS
): ApprovalReason[] {
  const reasons: ApprovalReason[] = [];

  // Check if value exceeds threshold
  if (input.totalValue > thresholds.maxValueWithoutApproval) {
    reasons.push('HIGH_VALUE');
  }

  // Check if discount exceeds threshold
  if (input.maxDiscountPct > thresholds.maxDiscountPctWithoutApproval) {
    reasons.push('HIGH_DISCOUNT');
  }

  // Check if katsayi is below threshold (guard against Infinity/NaN)
  if (isFinite(input.minKatsayi) && input.minKatsayi < thresholds.minKatsayiWithoutApproval) {
    reasons.push('LOW_KATSAYI');
  }

  return reasons;
}

/**
 * Get human-readable descriptions for approval reasons
 */
export const approvalReasonLabels: Record<ApprovalReason, string> = {
  HIGH_VALUE: 'Teklif tutarı onay limitini aşıyor',
  HIGH_DISCOUNT: 'İskonto oranı onay limitini aşıyor',
  LOW_KATSAYI: 'Katsayı minimum değerin altında',
};

/**
 * Get English descriptions for approval reasons
 */
export const approvalReasonLabelsEn: Record<ApprovalReason, string> = {
  HIGH_VALUE: 'Quote value exceeds approval threshold',
  HIGH_DISCOUNT: 'Discount percentage exceeds approval threshold',
  LOW_KATSAYI: 'Katsayi coefficient below minimum threshold',
};
