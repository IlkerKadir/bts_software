/**
 * App-wide "the quote editor has unsaved changes" flag (client 10.2026).
 * Deletes in the editor are now saved on Kaydet like every other edit, so
 * leaving without saving discards them. Client-side navigations that don't
 * go through a link (header search, notifications, logout) consult this
 * flag and ask for confirmation, like the editor's own leave guards.
 */
let unsaved = false;

export const LEAVE_CONFIRM_MESSAGE =
  'Kaydedilmemiş değişiklikler var. Kaydetmeden çıkmak istediğinize emin misiniz?';

export function setUnsavedChanges(value: boolean): void {
  unsaved = value;
}

/** True when it's OK to leave (nothing unsaved, or the user confirmed). */
export function confirmLeaveIfUnsaved(): boolean {
  if (!unsaved) return true;
  return typeof window === 'undefined' ? true : window.confirm(LEAVE_CONFIRM_MESSAGE);
}
