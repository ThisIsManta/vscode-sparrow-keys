import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'
import * as _ from 'lodash'

export function activate(context: vscode.ExtensionContext) {
    const recentEditors: Array<{ document: vscode.TextDocument, viewColumn: vscode.ViewColumn }> = []

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(activeEditor => {
        if (activeEditor === undefined) {
            return null
        }

        const editor = recentEditors.find(editor => editor.document.fileName === activeEditor.document.fileName)
        if (editor !== undefined) {
            recentEditors.splice(recentEditors.indexOf(editor), 1)
        }

        recentEditors.unshift({ document: activeEditor.document, viewColumn: activeEditor.viewColumn })

        for (let column = 1; column <= 3; column++) {
            const recentEditorsInColumn = recentEditors.filter(editor => editor.viewColumn === column)
            const antiqueEditors = recentEditorsInColumn.slice(3)
            for (const editor of antiqueEditors) {
                recentEditorsInColumn.splice(recentEditorsInColumn.indexOf(editor), 1)
            }
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openRecent', () => {
        if (vscode.window.activeTextEditor === undefined) {
            vscode.window.showTextDocument(recentEditors[0].document, vscode.ViewColumn.Active)
            return null
        }

        if (vscode.window.visibleTextEditors.length > 1) {
            const recentEditor = recentEditors.find(editor => editor.document.fileName !== vscode.window.activeTextEditor.document.fileName && editor.viewColumn === vscode.window.activeTextEditor.viewColumn)
            if (recentEditor) {
                vscode.window.showTextDocument(recentEditor.document, recentEditor.viewColumn)
                return null
            }
        }

        const recentEditor = recentEditors.find(editor => editor.document.fileName !== vscode.window.activeTextEditor.document.fileName)
        if (recentEditor !== undefined) {
            vscode.window.showTextDocument(recentEditor.document, recentEditor.viewColumn)
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openSimilar', async () => {
        if (!vscode.window.activeTextEditor) {
            return null
        }

        const fileLink = vscode.window.activeTextEditor.document.uri
        const rootLink = vscode.workspace.getWorkspaceFolder(fileLink)
        if (!rootLink) {
            return null
        }

        const filePath = vscode.window.activeTextEditor.document.uri.fsPath
        const fileName = fp.basename(filePath)
        if (fileName.startsWith('.') || fileName.includes('.') === false) {
            return null
        }

        const relaPath = filePath.substring(rootLink.uri.fsPath.length)
        const dirxPath = fp.dirname(relaPath)
        const lazyName = fileName.replace(/\..+/, '')
        const lazyPath = (dirxPath + '/' + lazyName).replace(/\\/g, '/').replace(/^\//, '')

        const fileList = await vscode.workspace.findFiles(lazyPath + '.*')
        if (fileList.length <= 1) {
            return null
        }

        const fileRank = fileList.findIndex(nextLink => nextLink.fsPath === fileLink.fsPath)
        if (fileList.length === 2) {
            if (fileRank >= 0) {
                const nextLink = fileList.concat(fileList)[fileRank + 1]
                vscode.window.showTextDocument(nextLink)
            }

        } else {
            const pickList = _.sortBy(fileList, item => fileList.indexOf(item) >= fileRank ? 0 : 1).map(item => fp.basename(item.fsPath))
            const pickItem = await vscode.window.showQuickPick(pickList)
            if (pickItem) {
                const nextLink = vscode.Uri.file(fp.resolve(filePath, '..', pickItem))
                vscode.window.showTextDocument(nextLink)
            }
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openPackage', async () => {
        const rootLink = await getRootFolder()
        if (!rootLink) {
            return null
        }
        const rootPath = rootLink.uri.fsPath

        const packageJsonPathList: Array<string> = []
        let packageJsonPath = vscode.window.activeTextEditor.document.fileName
        do {
            const pathChunks = packageJsonPath.split(fp.sep)
            pathChunks.pop()
            packageJsonPath = pathChunks.join(fp.sep)

            if (fs.existsSync(fp.join(packageJsonPath, 'package.json'))) {
                packageJsonPathList.push(fp.join(packageJsonPath, 'package.json'))
            }
        } while (packageJsonPath !== rootPath)

        if (packageJsonPathList.length === 1) {
            vscode.window.showTextDocument(vscode.Uri.file(packageJsonPath))
        } else if (packageJsonPathList.length > 1) {
            const pickList = packageJsonPathList.map(path => path.substring(rootPath.length + 1))
            const pickItem = await vscode.window.showQuickPick(pickList)
            if (pickItem) {
                vscode.window.showTextDocument(vscode.Uri.file(fp.join(rootPath, pickItem)))
            }
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.focusFile', async () => {
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer')
        await vscode.commands.executeCommand('workbench.files.action.showActiveFileInExplorer')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.renameFile', async () => {
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer')
        await vscode.commands.executeCommand('workbench.files.action.showActiveFileInExplorer')
        await vscode.commands.executeCommand('renameFile')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.duplicateFile', async () => {
        await vscode.commands.executeCommand('filesExplorer.copy')
        await vscode.commands.executeCommand('filesExplorer.paste')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.installPackages', async () => {
        const rootLink = await getRootFolder()
        if (!rootLink) {
            return null
        }

        let exec = 'npm install'
        if (fs.existsSync(fp.join(rootLink.uri.fsPath, 'yarn.lock'))) {
            exec = 'yarn'
        }

        const term = vscode.window.createTerminal('install')
        term.sendText(changeDirectory(rootLink))
        term.show(true)
        term.sendText(exec)
    }))

    let devlTerm: vscode.Terminal
    context.subscriptions.push(vscode.window.onDidCloseTerminal((term) => {
        if (term === devlTerm) {
            devlTerm = null
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.runDevelop', async () => {
        const rootLink = await getRootFolder()
        if (!rootLink) {
            return null
        }

        if (!devlTerm) {
            devlTerm = vscode.window.createTerminal('dev')
            devlTerm.sendText(changeDirectory(rootLink))
        }

        devlTerm.show(true)
        devlTerm.sendText('npm run dev')
    }))

    let testTerm: vscode.Terminal
    context.subscriptions.push(vscode.window.onDidCloseTerminal((term) => {
        if (term === testTerm) {
            testTerm = null
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.runTest', async () => {
        const rootLink = await getRootFolder()
        if (!rootLink) {
            return null
        }

        if (!testTerm) {
            testTerm = vscode.window.createTerminal('test')
            testTerm.sendText(changeDirectory(rootLink))
        }

        testTerm.show(true)
        testTerm.sendText('npm run test')
    }))

    let lintTerm: vscode.Terminal
    context.subscriptions.push(vscode.window.onDidCloseTerminal((term) => {
        if (term === lintTerm) {
            lintTerm = null
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.runLint', async () => {
        const rootLink = await getRootFolder()
        if (!rootLink) {
            return null
        }

        if (!lintTerm) {
            lintTerm = vscode.window.createTerminal('lint')
            lintTerm.sendText(changeDirectory(rootLink))
        }

        lintTerm.show(true)
        lintTerm.sendText('npm run lint')
    }))
}

async function getRootFolder() {
    if (!vscode.workspace.workspaceFolders) {
        return null
    }

    const rootList = vscode.workspace.workspaceFolders.filter(item => fs.existsSync(fp.join(item.uri.fsPath, 'package.json')))

    if (rootList.length === 0) {
        vscode.window.showErrorMessage('Sparrow Keys: package.json file could not be found.')
        return null
    }

    if (rootList.length === 1) {
        return rootList[0]
    }

    const pickItem = await vscode.window.showQuickPick(rootList.map(item => item.name))
    if (!pickItem) {
        return null
    }

    return vscode.workspace.workspaceFolders.find(item => pickItem === item.name)
}

function changeDirectory(rootLink: vscode.WorkspaceFolder) {
    return 'cd "' + rootLink.uri.fsPath.split(fp.sep).join(fp.posix.sep) + '"'
}
