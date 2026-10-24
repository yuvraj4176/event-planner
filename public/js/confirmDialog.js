// Opens the native confirmation dialog, or falls back to window.confirm in
// browsers without <dialog> support. The dialog's own confirm button is wired
// separately; `onConfirm` is only used by the fallback.
export function openConfirm(dialog, message, onConfirm) {
  if (typeof dialog.showModal === 'function') {
    dialog.returnValue = '';
    dialog.showModal();
  } else if (window.confirm(message)) {
    onConfirm();
  }
}
