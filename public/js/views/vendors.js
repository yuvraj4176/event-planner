import { h } from '../dom.js';
import { formatDate, formatMoney, pluralize } from '../format.js';
import { vendorStats } from '../progress.js';

export function createVendorsView({ plan, progress, locale, onToggleStep }) {
  const money = (amount) => formatMoney(amount, plan.budget.currency, locale);
  let current = progress;

  function createVendor(vendor) {
    const count = h('span', { class: 'vendor-progress' });

    function paint() {
      const stats = vendorStats(vendor, current);
      count.textContent = `${stats.done} of ${pluralize(stats.total, 'step')} done`;
    }

    const steps = vendor.checklist.map((step) => {
      const checkbox = h('input', { type: 'checkbox', checked: current.steps[step.id] === true });
      checkbox.addEventListener('change', () => {
        const updated = { ...current.steps };
        if (checkbox.checked) updated[step.id] = true;
        else delete updated[step.id];
        current = { ...current, steps: updated };
        paint();
        onToggleStep(step.id, checkbox.checked);
      });
      return h('li', {}, h('label', { class: 'check-label' }, checkbox, h('span', { text: step.text })));
    });

    paint();

    return h(
      'details',
      { class: 'vendor' },
      h(
        'summary',
        {},
        h('span', { class: 'vendor-name', text: vendor.label }),
        vendor.essential ? h('span', { class: 'badge', text: 'Essential' }) : null,
        vendor.priority ? h('span', { class: 'badge badge-accent', text: 'Priority' }) : null,
        h('span', { class: 'vendor-meta', text: `Budget ${money(vendor.budget)} - book by ${formatDate(vendor.bookBy, locale)}` }),
        count,
      ),
      h(
        'div',
        { class: 'vendor-body' },
        h('h4', { text: 'Checklist' }),
        h('ul', { class: 'plain-list' }, steps),
        h('h4', { text: 'Questions to ask' }),
        h('ul', { class: 'bullet-list' }, vendor.questions.map((question) => h('li', { text: question }))),
      ),
    );
  }

  const element = h(
    'div',
    { class: 'vendors-view' },
    h('h3', { text: 'Vendor checklist' }),
    h('p', {
      class: 'section-intro',
      text: 'Vendors are ordered by how early they usually need to be booked. Open a vendor to see its steps and questions.',
    }),
    plan.vendors.map(createVendor),
  );

  return { element };
}
