import * as fp from 'path'
import * as vscode from 'vscode'
import * as _ from 'lodash'

export function activate(context: vscode.ExtensionContext) {
    const recentEditors: Array<{ document: vscode.TextDocument, viewColumn: vscode.ViewColumn | undefined }> = []

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
            const recentEditor = recentEditors.find(editor => editor.document.fileName !== vscode.window.activeTextEditor?.document.fileName && editor.viewColumn === vscode.window.activeTextEditor?.viewColumn)
            if (recentEditor) {
                vscode.window.showTextDocument(recentEditor.document, recentEditor.viewColumn)
                return null
            }
        }

        const recentEditor = recentEditors.find(editor => editor.document.fileName !== vscode.window.activeTextEditor?.document.fileName)
        if (recentEditor !== undefined) {
            vscode.window.showTextDocument(recentEditor.document, recentEditor.viewColumn)
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openPackage', async () => {
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

        showFiles('**/package.json')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('sparrowKeys.openReadme', async () => {
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

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

    _.forEach([
        { command: 'sparrowKeys.transformToCamelCase', transformer: _.camelCase },
        { command: 'sparrowKeys.transformToPascalCase', transformer: (text) => _.upperFirst(_.camelCase(text)) },
        { command: 'sparrowKeys.transformToSnakeCase', transformer: _.snakeCase },
        { command: 'sparrowKeys.transformToDashCase', transformer: _.kebabCase },
    ], ({ command, transformer }) => {
        context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
            await transformText(transformer)
        }))
    })
}

async function transformText(f: (text: string) => string) {
    const editor = vscode.window.activeTextEditor
    if (editor) {
        await editor.edit(edit => {
            for (const selection of editor.selections) {
                const text = editor.document.getText(selection)
                edit.replace(selection, f(text))
            }
        })
    }
}

function getLongestCommonPath(pathList: Array<string>) {
    const workingList = pathList.map(path => path.split(fp.sep))
    const shortestPathCount = _.minBy(workingList, list => list.length)?.length ?? 0
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
    const workspaces = vscode.workspace.workspaceFolders
    if (!workspaces) {
        return
    }

    const linkList = await vscode.workspace.findFiles(query)
    if (linkList.length === 0) {
        return
    }

    if (linkList.length === 1) {
        vscode.window.showTextDocument(linkList[0])
        return
    }

    const sortingDirectives = _.compact([
        (link: vscode.Uri) => workspaces.findIndex(workspace => link.fsPath.startsWith(workspace.uri.fsPath)),
        (link: vscode.Uri) => fp.dirname(link.fsPath),
    ])

    if (vscode.window.activeTextEditor) {
        const currentDirectoryPath = fp.dirname(vscode.window.activeTextEditor.document.fileName)
        const longestCommonLink = _.maxBy(linkList, link => getLongestCommonPath([fp.dirname(link.fsPath), currentDirectoryPath]).split(fp.sep).length)!
        sortingDirectives.unshift((link: vscode.Uri) => link.fsPath === longestCommonLink.fsPath ? 1 : 2)
    }

    const workspacePathList = workspaces.map(item => item.uri.fsPath)
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
