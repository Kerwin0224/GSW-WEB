# Thinking Guides

> Purpose: expand thinking before coding so product, reuse, and cross-layer risks are noticed early.

---

## Why Thinking Guides?

Most bugs and tech debt come from missed framing, not from missing syntax knowledge.

Common misses:

- Not noticing a cross-layer consequence
- Reinventing a pattern that already exists
- Forgetting edge cases around state and ownership
- Borrowing the wrong external shell for the product

These guides exist to force the right questions before implementation.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify internal and external reuse opportunities without losing product identity | When you notice repeated patterns or are tempted to invent a module from scratch |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, service, component, database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where some logic belongs

Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] You're modifying any constant or config
- [ ] You're creating a new utility or helper function
- [ ] You're about to invent a complex UI module from scratch
- [ ] A strong open-source panel or screen already exists for the same job

Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

---

## Pre-Modification Rule

Before changing any value, search first.

```bash
grep -r "value_to_change" .
```

That single habit prevents many "updated one path but missed another" failures.

---

## How To Use This Directory

1. Before coding: skim the relevant guide.
2. During coding: if something feels repetitive, leaky, or overcomplicated, stop and re-check the guide.
3. After bugs: add the lesson back into the guide.

---

## Contributing

If a new "didn't think of that" moment shows up, add it to the relevant guide instead of leaving the lesson implicit.

---

Core principle: 30 minutes of thinking can save hours of debugging and redesign.
