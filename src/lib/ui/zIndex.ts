/**
 * One z-index scale for the whole app.
 *
 * Overlays used to pick their own numbers (z-40…z-[120]), so a menu could end
 * up above a dialog and a sheet could cover the settings modal. Everything
 * that stacks should use one of these layers instead.
 */
export const Z = {
  /** In-flow decorations (badges, sticky toolbars). */
  CHAT_UI: 10,
  /** Rail / list panels inside a screen. */
  PANEL: 20,
  /** Invisible click-catchers behind dropdown menus. */
  MENU_BACKDROP: 40,
  /** Dropdown menus and tooltips anchored to controls. */
  MENU: 50,
  /** Full-screen readers (stories, comments) and transient notices. */
  SHEET: 70,
  /** Top-level dialogs: settings, invite prompt, onboarding wizard. */
  MODAL: 80,
  /** Dialogs opened from inside a MODAL (checkout, legal, backup). */
  MODAL_NESTED: 90,
  /** Toasts and anything that must never be covered. */
  TOAST: 120,
} as const;

/** Tailwind class helper for arbitrary z values. */
export function zClass(layer: number): string {
  return `z-[${layer}]`;
}
