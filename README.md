**Sparrow Keys** is a Visual Studio Code extension that provides useful keyboard shortcuts.

## Basic usage

As soon as **Sparrow Keys** is installed, the extension offers the following keybindings and commands:

|Keybinding|Command|Description|
|---|---|---|
|_f1_ in the quick open|`sparrowKeys.openRecent`|Open the recently opened file. This command is quite like `workbench.action.openNextRecentlyUsedEditorInGroup`, but this does not distract you with any dialogs or pop-ups.|
|-|`sparrowKeys.openSimilar`|Open the files that share the same name and directory with the current active file. For example, this command will cycle through _MyComponent.js_, _MyComponent.test.js_, and _MyComponent.css_.|
|_f3_ in the quick open|`sparrowKeys.openReadme`|Open a `README.md` file in the opening workspace(s).|
|_f4_ in the quick open|`sparrowKeys.openPackage`|Open a `package.json` file in the opening workspace(s).|
|_shift+f2_|`sparrowKeys.renameFile`|Trigger `workbench.files.action.focusFilesExplorer`, `workbench.files.action.showActiveFileInExplorer`, and `renameFile` commands respectively.|
|_ctrl+d_|`sparrowKeys.duplicateFile`|Trigger `filesExplorer.copy` and `filesExplorer.paste` commands respectively. This must be called when you focus on the files explorer only.
