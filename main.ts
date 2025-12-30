import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { toggleRangeField, foldStateField, toggleViewPlugin } from './togglePlugin';

export default class NotionTogglePlugin extends Plugin {
    async onload() {
        console.log('Loading Notion Style Toggle Plugin');
        this.registerEditorExtension([toggleRangeField, foldStateField, toggleViewPlugin]);
    }

    onunload() {
        console.log('Unloading Notion Style Toggle Plugin');
    }
}
