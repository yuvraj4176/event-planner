// Supported currencies. `usdRate` is a rough conversion used only to place a
// budget in a tier (essential, balanced, premium); it is never shown to users
// and is not used for any money calculation.

export const CURRENCIES = Object.freeze({
  INR: { label: 'Indian Rupee', usdRate: 0.012 },
  USD: { label: 'US Dollar', usdRate: 1 },
  EUR: { label: 'Euro', usdRate: 1.08 },
  GBP: { label: 'British Pound', usdRate: 1.27 },
  AUD: { label: 'Australian Dollar', usdRate: 0.66 },
  CAD: { label: 'Canadian Dollar', usdRate: 0.73 },
});
