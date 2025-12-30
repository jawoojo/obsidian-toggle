import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { togglePlugin, foldState } from './togglePlugin';

export default class NotionTogglePlugin extends Plugin {
    async onload() {
        console.log('Loading Notion Style Toggle Plugin');
        this.registerEditorExtension([foldState, togglePlugin]);
    }

    onunload() {
        console.log('Unloading Notion Style Toggle Plugin');
    }
}
