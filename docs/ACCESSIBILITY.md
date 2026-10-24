# Accessibility

The target is WCAG 2.1 level AA. This page lists what was done and how it is checked.

## Structure and navigation

- The page declares `lang="en"`, has a descriptive title and one `h1`, and uses `header`, `main` and `footer` landmarks. Headings do not skip levels.
- A skip link is the first focusable element and moves focus to the main region.
- Results are shown in tabs that follow the WAI-ARIA tabs pattern: `tablist`, `tab` and `tabpanel` roles, `aria-selected`, `aria-controls`, roving `tabindex`, and Left, Right, Home and End keys.
- Vendor details use native `details` and `summary`, which are keyboard operable without extra scripting.
- The confirmation before clearing a plan uses the native `dialog` element, which traps focus and closes with Escape.

## Forms

- Every control has a visible, programmatically associated label. Required fields say "(required)" in text.
- Related controls are grouped with `fieldset` and `legend`.
- Hints are linked with `aria-describedby`.
- Validation errors appear in a summary that receives focus, with links to each field, and next to each field with `aria-invalid` set. Messages say what is wrong and how to fix it.
- Choosing priorities is limited to three; once the limit is reached the other options are disabled and the hint explains the limit.
- Number and date inputs use native types with sensible `inputmode` values.

## Visual design

- Colour contrast is at least 4.5:1 for text and 3:1 for control borders and focus rings, in both the light and dark themes. `tests/quality/contrast.test.js` computes this from the stylesheet tokens.
- Information is never conveyed by colour alone: overdue, due today and done are written in words; over-budget amounts say "Over by"; priority and essential markers are text badges.
- Animations (entrance fades, hover lifts, drifting background shapes, confetti) are decorative only. With the reduced motion setting they are shortened to nothing, and the confetti is never created. Confetti is hidden from assistive technology and ignores the pointer.
- Focus is always visible with a three pixel outline, and focused elements are scrolled clear of the sticky header and the chat button.
- Visitors who ask for more contrast (`prefers-contrast: more`) get stronger borders and hint text in the full text colour.
- Interactive targets are at least 44 pixels tall.
- Text uses relative units, the layout reflows to a single column without horizontal page scrolling, and the budget table scrolls inside a labelled, focusable region on narrow screens.
- The page follows the system light or dark setting, reduced motion preference and forced colours mode, and has a print layout that shows every section.

## Chat assistant

- The launcher is a real button with visible text ("Ask AI") plus an icon, `aria-expanded` and `aria-controls`.
- The chat is a labelled, non-modal dialog. It opens with focus in the message box, closes with the close button or Escape, and returns focus to the launcher.
- The conversation is a `role="log"` live region, so new replies are announced. The typing indicator has a text alternative and the animated dots are hidden.
- Every control has an accessible name, touch targets are at least 44 pixels, and on small screens the panel fills the width of the screen.
- Pulse, wave and message animations are removed for reduced motion.

## Dynamic content

- A polite live region announces plan creation, restoration, download and clearing.
- After a plan is created, focus moves to the results heading.
- AI idea generation and answers are announced through live regions, and the busy state is exposed with `aria-busy`.
- All text from the server or the AI is inserted as text, so assistive technology reads exactly what is shown.

## Verification

`tests/quality/accessibility.test.js` checks the markup and stylesheet: language, title, landmarks, heading order, unique ids, valid id references, labels on every control, required text, fieldsets, error slots, button names, viewport zoom, focus styles, reduced motion, touch target sizes and relative font sizes. `tests/client/views.test.js` checks the generated markup for tabs, tables, checkboxes and live regions.

Manual checks worth repeating before a release: operate the whole flow with only a keyboard, use a screen reader (NVDA, VoiceOver) through form entry, error handling and the tabs, zoom to 200 percent and 400 percent, and test in forced colours mode.
