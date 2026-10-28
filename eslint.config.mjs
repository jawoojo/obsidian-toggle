import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["main.js", "*.mjs", "node_modules/**"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

