import { planFromRequest } from '../../src/planner/plan.js';

export const TODAY = '2026-10-23';

export function validInput(overrides = {}) {
  return {
    eventType: 'wedding',
    eventName: 'Asha and Ravi',
    eventDate: '2027-10-23',
    guestCount: 120,
    totalBudget: 2_500_000,
    currency: 'INR',
    location: 'Pune',
    theme: 'garden',
    interests: 'live music, flowers',
    priorities: ['photography'],
    ...overrides,
  };
}

export function buildTestPlan(overrides = {}, today = TODAY) {
  const result = planFromRequest(validInput(overrides), today);
  if (!result.ok) throw new Error(`Fixture is invalid: ${JSON.stringify(result.errors)}`);
  return result.plan;
}
