// A very small DOM used to test view code without a browser. It supports only
// what the views use: creating elements, attributes, children, classes and
// event listeners.

class FakeText {
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    this.parentNode = null;
  }

  get textContent() {
    return this.data;
  }
}

export class FakeElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.classes = new Set();
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.value = '';
    this.focused = false;
    this.styles = new Map();
    this.style = { setProperty: (name, value) => this.styles.set(name, value) };
  }

  get className() {
    return [...this.classes].join(' ');
  }

  set className(value) {
    this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : force;
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = value;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeText(node) : node;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  get textContent() {
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    if (value !== '') this.append(String(value));
  }

  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  dispatch(type, extra = {}) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    for (const listener of this.listeners[type] ?? []) listener(event);
    return event;
  }

  focus() {
    this.focused = true;
  }

  scrollIntoView(options) {
    this.scrolledTo = options;
  }

  // Supports compound selectors such as input[name="x"]:checked, #id and .class.
  matches(selector) {
    const parsed = /^([a-zA-Z][\w-]*)?((?:[#.][\w-]+|\[[^\]]+\]|:checked)*)$/.exec(selector);
    if (!parsed) throw new Error(`Unsupported selector: ${selector}`);
    const [, tag, rest] = parsed;
    if (tag && this.tagName !== tag.toUpperCase()) return false;

    for (const part of rest.match(/[#.][\w-]+|\[[^\]]+\]|:checked/g) ?? []) {
      if (part === ':checked') {
        if (!this.checked) return false;
      } else if (part[0] === '#') {
        if (this.getAttribute('id') !== part.slice(1)) return false;
      } else if (part[0] === '.') {
        if (!this.classes.has(part.slice(1))) return false;
      } else {
        const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
        // Radio and checkbox values reflect to the attribute in real browsers.
        const actual = this.getAttribute(name) ?? (name === 'value' && this.value !== '' ? String(this.value) : null);
        if (actual === null || (value !== undefined && actual !== value)) return false;
      }
    }
    return true;
  }

  querySelectorAll(selector) {
    return findAll(this, (node) => node !== this && node.matches(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export function installFakeDocument() {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (namespace, tag) => {
      const element = new FakeElement(tag);
      element.namespace = namespace;
      return element;
    },
  };
}

export function findAll(root, predicate, found = []) {
  if (root.nodeType === 1 && predicate(root)) found.push(root);
  for (const child of root.children ?? []) findAll(child, predicate, found);
  return found;
}

export const byTag = (root, tag) => findAll(root, (node) => node.tagName === tag.toUpperCase());
export const byClass = (root, name) => findAll(root, (node) => node.classes.has(name));
export const byRole = (root, role) => findAll(root, (node) => node.getAttribute('role') === role);
