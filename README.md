# Obsidian Toggle Plugin

A premium, **Notion-style toggle plugin** for Obsidian. 
The `|>` syntax is automatically rendered as a **clickable triangle icon (▶)**, allowing you to fold and unfold content with a single click.

---

## 🚀 What's New in v1.1.3 (vs v1.0.5)

Here are the 7 major upgrades and enhancements introduced since early versions (v1.0.5):

1. **Smooth 90° Triangle Rotation Animation**: Clicking the triangle (`▶`) smoothly rotates 90° with a refined Notion/Apple-style animation curve (`cubic-bezier`), completely replacing the old abrupt character replacement.
2. **Smart Hover Copy Button (1st & 2nd Line)**: For standard and header toggles, the copy button remains cleanly hidden by default and gracefully fades in when hovering over either the 1st (title) or 2nd line—functioning reliably even while actively editing.
3. **Compact Centering on Fold**: When collapsed, the copy button automatically shrinks into a compact 20px button and aligns to the exact vertical center (`top: 50%`), eliminating awkward overflow outside the single-line capsule.
4. **Native Code Block Synchronization**: Code block toggles (` ```> `) now feature the exact same square hover box effect as Obsidian's native code blocks, and automatically hide while editing code inside.
5. **Full 4-Corner Capsule Rounding**: Collapsing any toggle (standard, header, or code block) smoothly rounds both the top and bottom corners, presenting a unified, beautiful capsule/card appearance.
6. **Accidental Click Protection (Anti-Ghosting)**: Clicking right beside the triangle icon or opening code fence tag no longer abruptly flashes raw markdown syntax (`|>`, ` ```> `) unless explicitly cursor-focused inside.
7. **Clean UI & Duplicate Marker Elimination**: Duplicate native Obsidian fold arrows (`>`) and ellipsis indicators (`...`) are stripped away, keeping only the clean, interactive toggle triangle.

---

### Preview

### 1. Expanded
![Toggle Expanded](https://raw.githubusercontent.com/jawoojo/obsidian-toggle/main/image/unfolded.png)

### 2. Folded
![Toggle Folded](https://raw.githubusercontent.com/jawoojo/obsidian-toggle/main/image/folded.png)

## Features

- **Notion-Style Toggles**: Use `|>` and `<|` to create toggle blocks.
- **Scoped Folding**: Headers placed *inside* a toggle will fold content only within that toggle block. This keeps your document clean without breaking the global outline hierarchy.
- **Code Block Toggles**: Use ` ```> ` syntax to make code blocks collapsible.
- **Copy**: Hover over the title line to reveal a "Copy" button for quick sharing.
- **Native Integration**: Built on top of Obsidian's core folding engine, ensuring native performance and compatibility.

## Usage

### Basic Toggle
```
|> Title
Content...
<|
```

### Header Toggle
You can use a standard Markdown header as the title of your toggle. 
It functions exactly like a normal toggle but applies the header's styling (font size, weight, etc.) to the title line.
```
|> # My Styled Header
This content is folded inside the toggle.
The header creates a visual section but remains part of the toggle logic.
<|
```

### Code Block Toggle
Add a `>` after the opening code fence to create a collapsible code block.

````text
```> 
// or 
```python>
````
*(Ends with ```` ``` ```` as usual)*

---

## Support
If you find this plugin helpful, consider buying me a coffee!

<a href="https://www.buymeacoffee.com/jawoojo" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important;width: 145px !important;" ></a>

## License

MIT
