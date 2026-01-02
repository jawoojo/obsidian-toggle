# Obsidian Toggle Plugin

A premium, Notion-style toggle plugin for Obsidian. Use custom syntax to create collapsible blocks with enhanced styling.

## Features

- **Notion-Style Toggles**: Use `|>` and `<|` to create toggle blocks.
- **Nested Toggles**: endless nesting with visually distinct levels (up to 8 levels).
- **Header Support**: `|> # Header` syntax supported. Triangle hides automatically for headers.
- **Code Block Toggles**: Support for ` ```> ` or ` ```python > ` syntax.
- **Reading Mode Support**: Fully functional and styled in Reading View.
- **Command Palette**: Insert toggles easily via commands.

## Usage

### Basic Toggle
```
|> Title
Content...
<|
```

### Header Toggle
```
|> # My Header
Content...
<|
```

### Code Block Toggle
```text
\`\`\`> 
console.log("Toggleable Code");
\`\`\`
```

## Installation

1. Search for "Toggle" in Obsidian Community Plugins (Coming Soon).
2. Or install manually by copying `main.js`, `manifest.json`, `styles.css` to your vault's `.obsidian/plugins/obsidian-toggle/` folder.

## License

MIT
