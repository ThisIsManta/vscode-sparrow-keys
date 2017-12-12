# Sparrow Keys

**Sparrow Keys** is a Visual Studio Code extension that provides useful keyboard shortcuts.

## Basic usage

As soon as **Sparrow Keys** is installed, the extension offers the following keybindings:

- `sparrowKeys.openRecent` - open the recently opened file. This command is quite like `workbench.action.openNextRecentlyUsedEditorInGroup`, but this does not distract you with any dialogs or pop-ups.

- `sparrowKeys.openSimilar` - open the files that share the same name and directory with the current active file. For example, this command will cycle through _MyComponent.js_, _MyComponent.test.js_, and _MyComponent.css_.

- `sparrowKeys.openPackage` - open the _package.json_ file in the root workspace.

- `sparrowKeys.focusFile` - trigger `workbench.files.action.focusFilesExplorer` and `workbench.files.action.showActiveFileInExplorer` commands respectively.

- `sparrowKeys.renameFile` - trigger `workbench.files.action.focusFilesExplorer`, `workbench.files.action.showActiveFileInExplorer`, and `renameFile` commands respectively.

- `sparrowKeys.duplicateFile` - trigger `filesExplorer.copy` and `filesExplorer.paste` commands respectively. This must be called while you are focusing on the files explorer only.

- `sparrowKeys.installPackages` - open an integrated terminal and run `npm install` command.

- `sparrowKeys.runDevelop` - open an integrated terminal and run `npm run dev` command.

- `sparrowKeys.runTest` - open an integrated terminal and run `npm run test` command.

- `sparrowKeys.runLint` - open an integrated terminal and run `npm run lint` command.
