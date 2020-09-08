**Sparrow Keys** is a Visual Studio Code extension that provides useful keyboard shortcuts.

## Basic usage

As soon as **Sparrow Keys** is installed, the extension offers the following keybindings and commands:

|Command/<br>Keybinding|Description|
|---|---|
|`sparrowKeys.openRecent`<br>(f1 in the quick open)|Open the recently opened file. This command is quite like `workbench.action.openNextRecentlyUsedEditorInGroup`, but this does not distract you with any dialogs or pop-ups.|
|`sparrowKeys.openSimilar`<br>(f2 in the quick open)|Open the files that share the same name and directory with the current active file. For example, this command will cycle through _MyComponent.js_, _MyComponent.test.js_, and _MyComponent.css_.|
|`sparrowKeys.openReadme`<br>(f3 in the quick open)|Open a _README.md_ file in the opening workspace(s).|
|`sparrowKeys.openPackage`<br>(f4 in the quick open)|Open a _package.json_ file in the opening workspace(s).|
|`sparrowKeys.renameFile`<br>(shift+f2)|Trigger `workbench.files.action.focusFilesExplorer`, `workbench.files.action.showActiveFileInExplorer`, and `renameFile` commands respectively.|
|`sparrowKeys.duplicateFile`<br>(ctrl+d)|Trigger `filesExplorer.copy` and `filesExplorer.paste` commands respectively. This must be called when you focus on the files explorer only.|
|`sparrowKeys.duplicateFile`<br>(ctrl+d)|Trigger `filesExplorer.copy` and `filesExplorer.paste` commands respectively. This must be called when you focus on the files explorer only.|
|`editor.action.transformToUppercase`<br>(alt+c u)|Convert the selected text to all upper case.|
|`editor.action.transformToLowercase`<br>(alt+c l)|Convert the selected text to all lower case.|
|`editor.action.transformToTitlecase`<br>(alt+c f)|Convert the selected text to capitalized-each word.|
|`sparrowKeys.transformToCamelCase`<br>(alt+c c)|Convert the selected text to all camel case, for example `camelCase`.|
|`sparrowKeys.transformToPascalCase`<br>(alt+c p)|Convert the selected text to all Pascal case, for example `PascalCase`.|
|`sparrowKeys.transformToSnakeCase`<br>(alt+c s)|Convert the selected text to all snake case, for example `snake_case`.|
|`sparrowKeys.transformToDashCase`<br>(alt+c d)|Convert the selected text to all dash case, for example `dash-case`.|