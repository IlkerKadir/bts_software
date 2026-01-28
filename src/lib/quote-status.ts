/**
 * Quote status state machine
 * Defines valid transitions between quote statuses
 */

export type QuoteStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'ONAYLANDI'
  | 'GONDERILDI'
  | 'TAKIPTE'
  | 'REVIZYON'
  | 'KAZANILDI'
  | 'KAYBEDILDI'
  | 'IPTAL';

/**
 * Status transition map
 * Key: current status, Value: array of valid next statuses
 */
const statusTransitions: Record<QuoteStatus, QuoteStatus[]> = {
  TASLAK: ['ONAY_BEKLIYOR', 'IPTAL'],
  ONAY_BEKLIYOR: ['ONAYLANDI', 'REVIZYON', 'IPTAL'],
  ONAYLANDI: ['GONDERILDI', 'IPTAL'],
  GONDERILDI: ['TAKIPTE', 'KAZANILDI', 'KAYBEDILDI', 'REVIZYON'],
  TAKIPTE: ['KAZANILDI', 'KAYBEDILDI', 'REVIZYON'],
  REVIZYON: ['ONAY_BEKLIYOR', 'IPTAL'],
  KAZANILDI: [], // Terminal state
  KAYBEDILDI: [], // Terminal state
  IPTAL: [], // Terminal state
};

/**
 * Terminal statuses that cannot transition to any other status
 */
const terminalStatuses: QuoteStatus[] = ['KAZANILDI', 'KAYBEDILDI', 'IPTAL'];

/**
 * Check if a transition from one status to another is valid
 */
export function canTransitionTo(
  currentStatus: QuoteStatus,
  targetStatus: QuoteStatus
): boolean {
  if (currentStatus === targetStatus) return false;

  const validTransitions = statusTransitions[currentStatus];
  return validTransitions.includes(targetStatus);
}

/**
 * Get all available transitions from a given status
 */
export function getAvailableTransitions(currentStatus: QuoteStatus): QuoteStatus[] {
  return statusTransitions[currentStatus] || [];
}

/**
 * Check if a status is terminal (no further transitions possible)
 */
export function isTerminalStatus(status: QuoteStatus): boolean {
  return terminalStatuses.includes(status);
}

/**
 * Check if a status requires approval action
 */
export function requiresApproval(status: QuoteStatus): boolean {
  return status === 'ONAY_BEKLIYOR';
}

/**
 * Status labels in Turkish
 */
export const statusLabels: Record<QuoteStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

/**
 * Status colors for UI badges
 */
export const statusColors: Record<QuoteStatus, string> = {
  TASLAK: 'default',
  ONAY_BEKLIYOR: 'warning',
  ONAYLANDI: 'info',
  GONDERILDI: 'info',
  TAKIPTE: 'warning',
  REVIZYON: 'warning',
  KAZANILDI: 'success',
  KAYBEDILDI: 'error',
  IPTAL: 'error',
};
