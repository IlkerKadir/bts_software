/**
 * Quote Approval Check
 * Combines quote metrics extraction with approval rules
 * to determine if a quote needs manager approval
 */

import {
  needsApproval,
  getApprovalReasons,
  ApprovalReason,
  ApprovalThresholds,
  DEFAULT_THRESHOLDS,
  approvalReasonLabels,
  approvalReasonLabelsEn,
  QuoteApprovalInput,
} from './approval-rules';
import { extractApprovalMetrics, QuoteItemForMetrics } from './quote-metrics';

// Re-export for convenience
export type QuoteItemForApproval = QuoteItemForMetrics;
export type { ApprovalThresholds };

export interface ApprovalCheckResult {
  /** Whether the quote needs manager approval */
  needsApproval: boolean;
  /** Reasons for needing approval (empty if no approval needed) */
  reasons: ApprovalReason[];
  /** Human-readable labels for the reasons */
  reasonLabels: string[];
  /** The calculated metrics used for the check */
  metrics: QuoteApprovalInput;
}

/**
 * Check if a quote needs approval based on its items
 * This is the main function to use for approval checking
 *
 * @param items - Array of quote items
 * @param thresholds - Optional custom approval thresholds
 * @param locale - Optional locale for reason labels ('tr' or 'en', defaults to 'tr')
 * @returns Approval check result with reasons and metrics
 */
export function checkQuoteApproval(
  items: QuoteItemForApproval[],
  thresholds: ApprovalThresholds = DEFAULT_THRESHOLDS,
  locale: 'tr' | 'en' = 'tr'
): ApprovalCheckResult {
  // Extract metrics from items
  const metrics = extractApprovalMetrics(items);

  // Check if approval is needed
  const requires = needsApproval(metrics, thresholds);

  // Get reasons if approval is needed
  const reasons = requires ? getApprovalReasons(metrics, thresholds) : [];

  // Get localized labels
  const labels = locale === 'en' ? approvalReasonLabelsEn : approvalReasonLabels;
  const reasonLabels = reasons.map((reason) => labels[reason]);

  return {
    needsApproval: requires,
    reasons,
    reasonLabels,
    metrics,
  };
}
