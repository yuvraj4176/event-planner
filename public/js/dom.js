// Minimal element builder. Text is always attached as text nodes or through
// textContent, never parsed as HTML, so plan content cannot inject markup.

const PROPERTY_NAMES = new Set(['checked', 'value', 'disabled', 'hidden', 'open', 'selected']);

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'on') {
      for (const [type, listener] of Object.entries(value)) node.addEventListener(type, listener);
    } else if (PROPERTY_NAMES.has(name)) node[name] = value;
    else node.setAttribute(name, value === true ? '' : String(value));
  }

  const content = children.flat().filter((child) => child !== null && child !== undefined && child !== false);
  if (content.length > 0) node.append(...content);
  return node;
}
