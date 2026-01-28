/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusChangeDropdown } from './StatusChangeDropdown';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('StatusChangeDropdown', () => {
  const mockOnStatusChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial render', () => {
    it('renders with current status', () => {
      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('Taslak')).toBeInTheDocument();
    });

    it('renders dropdown button', () => {
      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('dropdown interaction', () => {
    it('fetches transitions when dropdown is opened', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'TASLAK', label: 'Taslak' },
          allowedTransitions: [
            { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
            { value: 'IPTAL', label: 'İptal' },
          ],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/quotes/quote-123/status');
      });
    });

    it('displays available transitions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'TASLAK', label: 'Taslak' },
          allowedTransitions: [
            { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
            { value: 'IPTAL', label: 'İptal' },
          ],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();
        expect(screen.getByText('İptal')).toBeInTheDocument();
      });
    });
  });

  describe('status change', () => {
    it('calls PUT endpoint when transition is selected', async () => {
      // First call - GET transitions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'TASLAK', label: 'Taslak' },
          allowedTransitions: [
            { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
          ],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      // Second call - PUT status change
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quote: { id: 'quote-123', status: 'ONAY_BEKLIYOR' },
          message: 'Teklif durumu güncellendi',
        }),
      });

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Onay Bekliyor'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/quotes/quote-123/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ONAY_BEKLIYOR' }),
        });
      });
    });

    it('calls onStatusChange callback after successful update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'TASLAK', label: 'Taslak' },
          allowedTransitions: [
            { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
          ],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quote: { id: 'quote-123', status: 'ONAY_BEKLIYOR' },
          message: 'Teklif durumu güncellendi',
        }),
      });

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Onay Bekliyor'));

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalled();
      });
    });
  });

  describe('loading state', () => {
    it('shows loading indicator while fetching transitions', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            currentStatus: { value: 'TASLAK', label: 'Taslak' },
            allowedTransitions: [],
            approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
          }),
        }), 100))
      );

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
    });

    it('disables button during status update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'TASLAK', label: 'Taslak' },
          allowedTransitions: [
            { value: 'ONAY_BEKLIYOR', label: 'Onay Bekliyor' },
          ],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            quote: { id: 'quote-123', status: 'ONAY_BEKLIYOR' },
            message: 'Teklif durumu güncellendi',
          }),
        }), 100))
      );

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="TASLAK"
          currentStatusLabel="Taslak"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Onay Bekliyor'));

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeDisabled();
      });
    });
  });

  describe('empty transitions', () => {
    it('shows message when no transitions available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          currentStatus: { value: 'KAZANILDI', label: 'Kazanıldı' },
          allowedTransitions: [],
          approvalCheck: { needsApproval: false, reasons: [], reasonLabels: [], metrics: {} },
        }),
      });

      render(
        <StatusChangeDropdown
          quoteId="quote-123"
          currentStatus="KAZANILDI"
          currentStatusLabel="Kazanıldı"
          onStatusChange={mockOnStatusChange}
        />
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText(/geçiş yok/i)).toBeInTheDocument();
      });
    });
  });
});
