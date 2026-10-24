import { h } from '../dom.js';
import { icon } from '../icons.js';

// Tabs following the WAI-ARIA tabs pattern: arrow keys move between tabs,
// Home and End jump to the ends, and only the selected tab is in the tab order.
export function createTabs({ label, tabs, initial = 0 }) {
  let selected = initial;

  const buttons = tabs.map((tab, index) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${tab.id}`,
        class: 'tab',
        'aria-controls': `panel-${tab.id}`,
        'aria-selected': String(index === initial),
        tabindex: index === initial ? '0' : '-1',
        on: { click: () => select(index) },
      },
      tab.icon ? icon(tab.icon) : null,
      h('span', { text: tab.label }),
    ),
  );

  const panels = tabs.map((tab, index) =>
    h(
      'div',
      {
        role: 'tabpanel',
        id: `panel-${tab.id}`,
        class: 'tab-panel',
        'aria-labelledby': `tab-${tab.id}`,
        tabindex: '0',
        hidden: index !== initial,
      },
      tab.content,
    ),
  );

  function select(index, { focus = false } = {}) {
    selected = index;
    buttons.forEach((button, position) => {
      const active = position === index;
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
      panels[position].hidden = !active;
    });
    if (focus) buttons[index].focus();
  }

  function handleKeydown(event) {
    const last = buttons.length - 1;
    const targets = {
      ArrowRight: selected === last ? 0 : selected + 1,
      ArrowLeft: selected === 0 ? last : selected - 1,
      Home: 0,
      End: last,
    };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    select(targets[event.key], { focus: true });
  }

  const tabList = h('div', { role: 'tablist', class: 'tab-list', 'aria-label': label, on: { keydown: handleKeydown } }, buttons);
  const element = h('div', { class: 'tabs' }, tabList, panels);

  return { element, select, handleKeydown };
}
