# Obsidian Toggle Plugin

A premium, **Notion-style toggle plugin** for Obsidian. 
The `|>` syntax is automatically rendered as a **clickable triangle icon (▶)**, allowing you to fold and unfold content with a single click.

### 1. Expanded
![Toggle Expanded](https://raw.githubusercontent.com/jawoojo/obsidian-toggle/main/image/unfold.png)

### 2. Folded
![Toggle Folded](https://raw.githubusercontent.com/jawoojo/obsidian-toggle/main/image/fold.png)

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

---

## Release Notes

### [1.1.1]

- **Full 4-Corner Rounding on Fold**: When toggles (standard, header, or code block) are folded, the bottom corners are now smoothly rounded alongside the top corners for a complete capsule/card appearance.
- **Accidental Click Protection**: Clicking right next to the triangle icon (in both standard toggles `|>` and code block toggles ` ```> `) no longer reveals raw syntax. It stays intact unless explicitly focused inside.
- **Cleaner Fold UI**: Removed duplicate Obsidian fold arrows (`>`) and ellipsis placeholders (`...`) from standard and code block toggles, keeping only the clean triangle icon (`▶`/`▼`).
- **Native-Like Copy Button**: Matched the copy button UX with Obsidian's native code blocks: visible by default, highlights on hover, and automatically hides while editing inside the toggle.
- **Strict Trigger Precision**: Auto-completion and toggle rendering strictly require `|>` at the exact start of the line without preceding whitespaces.

