import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'
import * as _ from 'lodash'

export function activate(context: vscode.ExtensionContext) {
    let openingEditors: Array<vscode.TextEditor> = []

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(activeEditor => {
        if (openingEditors.indexOf(activeEditor) >= 0) {
            openingEditors.splice(openingEditors.indexOf(activeEditor), 1)
        }
        openingEditors.unshift(activeEditor)
        if (openingEditors.length > 10) {
            openingEditors = _.take(openingEditors, 10)
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openRecent', () => {
        const recentEditor = _.last(openingEditors.slice(0, 2))
        if (recentEditor) {
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
        if (!vscode.workspace.workspaceFolders) {
            return null
        }

        const rootList = vscode.workspace.workspaceFolders.filter(item => fs.existsSync(fp.join(item.uri.fsPath, 'package.json')))

        if (rootList.length === 0) {
            vscode.window.showErrorMessage('Sparrow Keys: package.json file could not be found.')
            return null
        }

        if (rootList.length === 1) {
            return openPackageJSON(rootList[0])
        }

        const pickItem = await vscode.window.showQuickPick(rootList.map(item => item.name + '/package.json'))
        if (!pickItem) {
            return null
        }

        const pickLink = vscode.workspace.workspaceFolders.find(item => pickItem === (item.name + '/package.json'))
        return openPackageJSON(pickLink)
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
}

function openPackageJSON(link: vscode.WorkspaceFolder) {
    return vscode.window.showTextDocument(vscode.Uri.file(fp.join(link.uri.fsPath, 'package.json')))
}
