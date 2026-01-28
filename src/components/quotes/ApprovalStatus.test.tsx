/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApprovalStatus } from './ApprovalStatus';
import type { ApprovalCheckResult } from '@/lib/quote-approval';

describe('ApprovalStatus', () => {
  describe('when approval is not needed', () => {
    it('renders nothing', () => {
      const result: ApprovalCheckResult = {
        needsApproval: false,
        reasons: [],
        reasonLabels: [],
        metrics: {
          totalValue: 10000,
          maxDiscountPct: 10,
          minKatsayi: 1.0,
        },
      };

      const { container } = render(<ApprovalStatus result={result} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('when approval is needed', () => {
    it('renders warning badge with reason count', () => {
      const result: ApprovalCheckResult = {
        needsApproval: true,
        reasons: ['HIGH_VALUE'],
        reasonLabels: ['Teklif tutarı onay limitini aşıyor'],
        metrics: {
          totalValue: 75000,
          maxDiscountPct: 10,
          minKatsayi: 1.0,
        },
      };

      render(<ApprovalStatus result={result} />);
      expect(screen.getByText(/onay gerekiyor/i)).toBeInTheDocument();
    });

    it('displays all reason labels', () => {
      const result: ApprovalCheckResult = {
        needsApproval: true,
        reasons: ['HIGH_VALUE', 'HIGH_DISCOUNT'],
        reasonLabels: [
          'Teklif tutarı onay limitini aşıyor',
          'İskonto oranı onay limitini aşıyor',
        ],
        metrics: {
          totalValue: 75000,
          maxDiscountPct: 25,
          minKatsayi: 1.0,
        },
      };

      render(<ApprovalStatus result={result} />);
      expect(screen.getByText('Teklif tutarı onay limitini aşıyor')).toBeInTheDocument();
      expect(screen.getByText('İskonto oranı onay limitini aşıyor')).toBeInTheDocument();
    });

    it('displays metrics when showMetrics is true', () => {
      const result: ApprovalCheckResult = {
        needsApproval: true,
        reasons: ['HIGH_VALUE'],
        reasonLabels: ['Teklif tutarı onay limitini aşıyor'],
        metrics: {
          totalValue: 75000,
          maxDiscountPct: 15,
          minKatsayi: 0.85,
        },
      };

      render(<ApprovalStatus result={result} showMetrics />);
      expect(screen.getByText(/75[.,]000/)).toBeInTheDocument();
      expect(screen.getByText(/15%/)).toBeInTheDocument();
      expect(screen.getByText(/0[.,]85/)).toBeInTheDocument();
    });

    it('shows all three reasons when all thresholds exceeded', () => {
      const result: ApprovalCheckResult = {
        needsApproval: true,
        reasons: ['HIGH_VALUE', 'HIGH_DISCOUNT', 'LOW_KATSAYI'],
        reasonLabels: [
          'Teklif tutarı onay limitini aşıyor',
          'İskonto oranı onay limitini aşıyor',
          'Katsayı minimum değerin altında',
        ],
        metrics: {
          totalValue: 100000,
          maxDiscountPct: 30,
          minKatsayi: 0.7,
        },
      };

      render(<ApprovalStatus result={result} />);
      expect(screen.getByText('Teklif tutarı onay limitini aşıyor')).toBeInTheDocument();
      expect(screen.getByText('İskonto oranı onay limitini aşıyor')).toBeInTheDocument();
      expect(screen.getByText('Katsayı minimum değerin altında')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('shows only badge without reasons when compact is true', () => {
      const result: ApprovalCheckResult = {
        needsApproval: true,
        reasons: ['HIGH_VALUE', 'HIGH_DISCOUNT'],
        reasonLabels: [
          'Teklif tutarı onay limitini aşıyor',
          'İskonto oranı onay limitini aşıyor',
        ],
        metrics: {
          totalValue: 75000,
          maxDiscountPct: 25,
          minKatsayi: 1.0,
        },
      };

      render(<ApprovalStatus result={result} compact />);
      expect(screen.getByText(/onay gerekiyor/i)).toBeInTheDocument();
      // Reason labels should not be shown in compact mode
      expect(screen.queryByText('Teklif tutarı onay limitini aşıyor')).not.toBeInTheDocument();
    });
  });
});
