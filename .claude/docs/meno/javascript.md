## JavaScript in Components (CRITICAL)

**Always put component JS in a sibling \`.js\` file** (e.g. \`Button.json\` + \`Button.js\`). Do **NOT** write JS into the JSON \`component.javascript\` field unless the user explicitly asks for inline JS — the sibling file is the canonical pattern and is how every example component in the project is structured.

**\`defineVars\` is automatic** - When you create a \`.js\` file for a component, \`defineVars: true\` is set automatically. The inline \`component.javascript\` field exists as a legacy fallback and requires setting \`defineVars\` manually; only use it when the user explicitly asks for inline JS.

### How defineVars Works

When a component has a \`.js\` file (e.g., \`Button.js\` for \`Button.json\`), your JS file automatically receives:
- \`el\` - The component's root DOM element
- \`props\` - Object containing all props from interface

\`\`\`json
{
  "component": {
    "interface": {
      "title": { "type": "string", "default": "Click me" }
    },
    "structure": { ... }
  }
}
\`\`\`

\`\`\`javascript
// ComponentName.js - el and props are automatically available (defineVars is auto-enabled)
const button = el.querySelector('[data-action="submit"]');
// title is already in scope - see "Props are destructured into scope" below
button?.addEventListener('click', () => {
  console.log('Clicked:', title);
});
\`\`\`

### Props are destructured into scope automatically

Every prop from \`interface\` is destructured into scope automatically — e.g. a component with props \`question\` and \`answer\` compiles to:

\`\`\`javascript
var { question, answer } = props;
// ...your code here...
\`\`\`

**Do not declare local variables with the same name as any prop.** Redeclaring a prop name with \`const\`/\`let\` is a SyntaxError that breaks the entire bundle (not just your component — nothing on the page initializes). Common trap: a prop called \`answer\` or \`title\` colliding with a local \`const answer = el.querySelector(...)\`. Rename the local (e.g. \`answerEl\`) when a prop already owns the name.

### Why NOT to use DOMContentLoaded

**NEVER use \`document.addEventListener('DOMContentLoaded', ...)\`** - It breaks in the editor!

- In static build: DOMContentLoaded fires after HTML loads ✓
- In editor: DOMContentLoaded already fired when React loaded, your callback never runs ✗

\`\`\`javascript
// WRONG - breaks in editor
document.addEventListener('DOMContentLoaded', function() {
  // This never runs in the editor!
});

// CORRECT - use defineVars instead
// With defineVars: true, your JS runs at the right time automatically
\`\`\`

### Data Attribute Patterns

Use data attributes to query child elements:

\`\`\`json
// In component structure:
{
  "type": "node",
  "tag": "button",
  "attributes": { "data-action": "submit" }
}
\`\`\`

\`\`\`javascript
// In JS file (with defineVars: true):
const button = el.querySelector('[data-action="submit"]');
const menu = el.querySelector('[data-el="menu"]');
\`\`\`

Common patterns:
- \`[data-el="menu"]\` - Named child elements
- \`[data-action="submit"]\` - Clickable actions
- \`[data-toggle="dropdown"]\` - Toggle triggers

### Component Communication

For cross-component interaction, use CustomEvent:

\`\`\`javascript
// ComponentA.js (Trigger)
el.addEventListener('click', () => {
  const modal = document.querySelector('[data-component="Modal"]');
  if (modal) {
    modal.dispatchEvent(new CustomEvent('open-modal', {
      detail: { url: 'https://...' },
      bubbles: true
    }));
  }
});

// Modal.js
el.addEventListener('open-modal', (e) => {
  el.classList.add('is-open');
  console.log(e.detail.url);
});
\`\`\`

### Rules Summary

1. **Create a sibling .js file** - canonical pattern; defineVars is automatic when .js file exists. Do NOT write JS into the JSON \`component.javascript\` field unless the user explicitly asks for inline JS.
2. **Never use DOMContentLoaded** - Breaks in editor
3. **Never use React** - No JSX, hooks, or React imports
4. Use \`el.querySelector()\` to find child elements
5. Use \`data-el\` attributes for reliable element selection
6. Use CustomEvent for cross-component communication
7. **NEVER manually add data-component attribute** - The system adds it automatically
8. **For scroll-position-driven effects** (e.g. nav color changing per section), use a rAF-throttled \`window\` scroll listener with \`getBoundingClientRect()\` reads — NOT an \`IntersectionObserver\` with a thin \`rootMargin\` scan band. The IO pattern is fragile inside the editor iframe (stale \`window.innerHeight\`, layout differences) and produces flickery / inconsistent updates; the scroll approach is robust and behaves the same in browser and editor.

### CRITICAL: Don't Add data-component Manually

When a component has a \`.js\` file, the system **automatically** adds:
- \`data-component="ComponentName"\` - Component identifier
- \`data-props='{"prop": "value"}'\` - Props for JS access

**WRONG** - manually adding data-component breaks the editor:
\`\`\`json
{
  "type": "node",
  "tag": "div",
  "attributes": {
    "data-component": "Modal"
  }
}
\`\`\`

**CORRECT** - just create the component and its .js file:
\`\`\`json
{
  "component": {
    "structure": {
      "type": "node",
      "tag": "div"
    }
  }
}
\`\`\`

If you manually add \`data-component\`, the system won't add \`data-props\`, and your JS won't receive props correctly. This causes components to work in static build but break in the editor.

### Global Template Variables
These variables are available in all template expressions without passing as props:
- \`{{isEditorMode}}\` - \`true\` in the editor, \`false\` in production/static build

**Use case**: Disable autoplay, animations, or other behaviors that interfere with editing:
\`\`\`json
{
  "type": "node",
  "tag": "video",
  "attributes": {
    "autoPlay": "{{autoPlay && !isEditorMode}}"
  }
}
\`\`\`