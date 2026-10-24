import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { toggleExtension } from "./editor_extension";
import { readingModeProcessor } from "./reading_mode_processor";

// [PRD 2.6.1] 설정 인터페이스 정의
interface NotionToggleSettings {
    toggleCommandName: string;
    codeBlockCommandName: string;
}

// [PRD 2.6.2] 기본 설정값
const DEFAULT_SETTINGS: NotionToggleSettings = {
    toggleCommandName: 'Insert Toggle',
    codeBlockCommandName: 'Insert Code Block Toggle'
}

export default class TogglePlugin extends Plugin {
    settings: NotionToggleSettings;

    async onload() {
        await this.loadSettings();

        this.registerEditorExtension(toggleExtension);
        this.registerMarkdownPostProcessor(async (el, ctx) => {
            try {
                await readingModeProcessor(el, ctx);
            } catch (error) {
                console.error("Toggle reading mode error:", error);
            }
        });

        // [PRD 2.6.1] 설정 탭 등록
        this.addSettingTab(new NotionToggleSettingsTab(this.app, this));

        // [PRD 2.6.2] 설정된 이름으로 명령어 등록
        this.addCommand({
            id: 'insert-toggle',
            name: this.settings.toggleCommandName, // 사용자 정의 이름 사용
            editorCallback: (editor) => {
                const selection = editor.getSelection();

                if (selection) {
                    // [PRD 2.5.3] 기존 선택 영역 감싸기
                    editor.replaceSelection(`|>\n${selection}\n<|`);
                } else {
                    // [PRD 2.5.3] 빈 토글 블록 삽입
                    const start = "|>";
                    const body = "\n\n";
                    const end = "<|";

                    const cursorBefore = editor.getCursor();
                    editor.replaceSelection(start + body + end);

                    // [PRD 2.5.3] 커서 위치 조정: 시작 줄, 2칸 뒤 ("|>" 직후)
                    editor.setCursor({
                        line: cursorBefore.line,
                        ch: cursorBefore.ch + 2
                    });
                }
            }
        });

        this.addCommand({
            id: 'insert-code-toggle',
            name: this.settings.codeBlockCommandName, // 사용자 정의 이름 사용
            editorCallback: (editor) => {
                const selection = editor.getSelection();

                if (selection) {
                    editor.replaceSelection(`\`\`\`> \n${selection}\n\`\`\``);
                } else {
                    const start = "```> ";
                    const body = "\n\n";
                    const end = "```";

                    const cursorBefore = editor.getCursor();
                    editor.replaceSelection(start + body + end);

                    // [PRD 2.5.3] 커서 위치 조정: 시작 줄, 5칸 뒤 ("```> " 직후)
                    editor.setCursor({
                        line: cursorBefore.line,
                        ch: cursorBefore.ch + 5
                    });
                }
            }
        });
    }

    onunload() {
        // Unloading
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// [PRD 2.6.1] 설정 탭 구현
class NotionToggleSettingsTab extends PluginSettingTab {
    plugin: TogglePlugin;

    constructor(app: App, plugin: TogglePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // [PRD 2.6.3] Donation Banner
        const bannerContainer = containerEl.createDiv();
        bannerContainer.style.marginBottom = "20px";
        bannerContainer.style.textAlign = "center"; // Center align for better look

        const link = bannerContainer.createEl('a', {
            href: 'https://www.buymeacoffee.com/jawoojo'
        });

        const img = link.createEl('img', {
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee'
            }
        });

        // "너무 크지 않게" -> 200px width
        img.style.width = "200px";
        img.style.height = "auto";

        containerEl.createEl('h2', { text: 'Notion Style Toggle Settings' });

        new Setting(containerEl)
            .setName('Insert Toggle Command Name')
            .setDesc('Custom name for the "Insert Toggle" command (Requires restart to apply)')
            .addText(text => text
                .setPlaceholder('Insert Toggle')
                .setValue(this.plugin.settings.toggleCommandName)
                .onChange(async (value) => {
                    this.plugin.settings.toggleCommandName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Insert Code Block Toggle Command Name')
            .setDesc('Custom name for the "Insert Code Block Toggle" command (Requires restart to apply)')
            .addText(text => text
                .setPlaceholder('Insert Code Block Toggle')
                .setValue(this.plugin.settings.codeBlockCommandName)
                .onChange(async (value) => {
                    this.plugin.settings.codeBlockCommandName = value;
                    await this.plugin.saveSettings();
                }));

        // [PRD 2.6.4] Usage Guide
        const guideHeader = containerEl.createEl('h3', { text: 'Usage Guide (Syntax)' });
        guideHeader.style.marginTop = '30px';

        const guideContainer = containerEl.createDiv();
        guideContainer.style.color = "var(--text-muted)";
        guideContainer.style.fontSize = "0.9em";

        // Helper to create a syntax block
        const createSyntaxBlock = (title: string, code: string, note?: string) => {
            const p = guideContainer.createEl('p', { text: title });
            p.style.fontWeight = 'bold';
            p.style.marginTop = '15px';
            p.style.marginBottom = '5px';

            const pre = guideContainer.createEl('pre', { text: code });
            pre.style.backgroundColor = "var(--background-secondary)";
            pre.style.padding = "10px";
            pre.style.borderRadius = "5px";
            pre.style.fontFamily = "var(--font-monospace)";
            pre.style.margin = "0";

            if (note) {
                const div = guideContainer.createEl('div', { text: note });
                div.style.marginTop = '4px';
                div.style.fontSize = '0.85em';
                div.style.color = 'var(--text-faint)';
            }
        };

        createSyntaxBlock(
            '1. Basic Toggle',
            '|>Toggle Title\n  ... content ... \n<|'
        );

        createSyntaxBlock(
            '2. Header Toggle (Foldable Headers)',
            '|># Header 1',
            '(Hides the triangle and uses native header folding)'
        );

        createSyntaxBlock(
            '3. Code Block Toggle',
            '```> \n// or \n```python>',
            '(Ends with ``` as usual)'
        );
    }
}