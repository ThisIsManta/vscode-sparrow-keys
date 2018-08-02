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
        vscode.commands.executeCommand('workbench.action.closeQuickOpen')

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
        vscode.commands.executeCommand('workbench.action.closeQuickOpen')

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

        const fileRank = fileList.findIndex(link => link.fsPath === fileLink.fsPath)
        if (fileList.length === 2) {
            if (fileRank >= 0) {
                const nextLink = fileList.concat(fileList)[fileRank + 1]
                vscode.window.showTextDocument(nextLink)
            }

        } else {
            const pickList = _.chain(fileList)
                .map((link, rank) => ({ name: fp.basename(link.fsPath), rank: rank <= fileRank ? rank + fileList.length : rank }))
                .sortBy(item => item.rank)
                .map(item => item.name)
                .value()
            const pickItem = await vscode.window.showQuickPick(pickList)
            if (pickItem) {
                const nextLink = vscode.Uri.file(fp.resolve(filePath, '..', pickItem))
                vscode.window.showTextDocument(nextLink)
            }
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openPackage', async () => {
        vscode.commands.executeCommand('workbench.action.closeQuickOpen')

        showFiles('**/package.json')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openReadme', async () => {
        vscode.commands.executeCommand('workbench.action.closeQuickOpen')

        showFiles('**/README.md')
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

function getLongestCommonPath(pathList: Array<string>) {
    const workingList = pathList.map(path => path.split(fp.sep))
    const shortestPathCount = _.minBy(workingList, 'length').length
    const commonPathList: Array<string> = []
    for (let index = 0; index <= shortestPathCount; index++) {
        if (workingList.every(items => items[index] === workingList[0][index])) {
            commonPathList.push(workingList[0][index])
        } else {
            break
        }
    }
    return commonPathList.join(fp.sep)
}

async function showFiles(query: string) {
    const linkList = await vscode.workspace.findFiles(query)
    if (linkList.length === 1) {
        vscode.window.showTextDocument(linkList[0])

    } else if (linkList.length > 1) {

        const sortingDirectives = _.compact([
            (link: vscode.Uri) => vscode.workspace.workspaceFolders.findIndex(workspace => link.fsPath.startsWith(workspace.uri.fsPath)),
            (link: vscode.Uri) => fp.dirname(link.fsPath),
        ])

        if (vscode.window.activeTextEditor) {
            const currentDirectoryPath = fp.dirname(vscode.window.activeTextEditor.document.fileName)
            const longestCommonLink = _.maxBy(linkList, link => getLongestCommonPath([fp.dirname(link.fsPath), currentDirectoryPath]).split(fp.sep).length)
            sortingDirectives.unshift((link: vscode.Uri) => link.fsPath === longestCommonLink.fsPath ? 1 : 2)
        }

        const workspacePathList = vscode.workspace.workspaceFolders.map(item => item.uri.fsPath)
        const workspaceCommonPath = getLongestCommonPath(workspacePathList)

        const pickList = _.chain(linkList)
            .sortBy(...sortingDirectives)
            .map(link => ({
                label: fp.basename(link.fsPath),
                description: fp.dirname(link.fsPath).substring(workspaceCommonPath.length),
                link,
            }))
            .value()
        const pickItem = await vscode.window.showQuickPick(pickList, { matchOnDescription: true })
        if (pickItem) {
            vscode.window.showTextDocument(pickItem.link)
        }
    }
}
