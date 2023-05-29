import * as fp from 'path'
import * as vscode from 'vscode'
import * as ts from 'typescript'
import uniqWith from 'lodash/uniqWith'
import sortBy from 'lodash/sortBy'

export default async function duplicateLine(editor: vscode.TextEditor) {
	const { document } = editor

	for (const cursor of sortBy(editor.selections, selection => -document.offsetAt(selection.active))) {
		if (cursor.isEmpty && document.lineAt(cursor.active.line).isEmptyOrWhitespace) {
			await vscode.commands.executeCommand('editor.action.copyLinesDownAction')
			continue
		}

		if (!cursor.isEmpty && document.getText(cursor).trim().length === 0) {
			await vscode.commands.executeCommand('editor.action.duplicateSelection')
			continue
		}

		if (/^((java|type)script(react)?|jsonc?)$/.test(document.languageId)) {
			let selectionRange = cursor.isReversed
				? new vscode.Range(cursor.active, cursor.anchor)
				: cursor

			if (selectionRange.isEmpty) {
				const line = document.lineAt(selectionRange.start.line)
				const left = line.text.substring(0, selectionRange.start.character)
				const right = line.text.substring(selectionRange.start.character)
				if (/,$/.test(left) && (right.length === 0 || /^\s+/.test(right))) {
					// Snap to the left before a comma
					const position = selectionRange.start.translate(0, -1)
					selectionRange = new vscode.Range(position, position)
				} else if (/^\s+/.test(right)) {
					// Snap to the right before a non-whitespace character
					const position = selectionRange.start.translate(0, right.match(/^\s+/)![0].length)
					selectionRange = new vscode.Range(position, position)
				}
			}

			const rootNode = parseTypeScript(document)
			if (rootNode) {
				const matchingNodes = findMatchingNodes(rootNode, [document.offsetAt(selectionRange.start), document.offsetAt(selectionRange.end)])

				if (matchingNodes.length === 0 && selectionRange.isEmpty === false) {
					await vscode.commands.executeCommand('editor.action.duplicateSelection')
					continue
				}

				const edits = uniqWith(matchingNodes.flatMap(node => createEdit(node, document)), (first, second) => first.offset === second.offset && first.insert === second.insert)
				if (edits.length > 0) {
					await editor.edit(editBuilder => {
						for (const edit of sortBy(edits, ({ offset }) => -offset)) {
							editBuilder.insert(document.positionAt(edit.offset), edit.insert)
						}
					}, { undoStopBefore: false, undoStopAfter: false })

					await vscode.commands.executeCommand('editor.action.formatSelection')

					continue
				}
			}
		}

		await vscode.commands.executeCommand('editor.action.copyLinesDownAction')
	}
}

function findMatchingNodes(node: ts.Node, range: readonly [number, number]): Array<ts.Node> {
	if (range[0] === range[1]) {
		return node.forEachChild(childNode => {
			if (childNode.getStart() <= range[0] && range[0] <= childNode.getEnd()) {
				const [smallerNode] = findMatchingNodes(childNode, range)
				return [smallerNode ?? childNode]
			}
		}) || []
	}

	const matchingNodes: Array<ts.Node> = []
	node.forEachChild(childNode => {
		if (range[0] <= childNode.getStart() && childNode.getEnd() <= range[1]) {
			matchingNodes.push(childNode)
		} else {
			matchingNodes.push(...findMatchingNodes(childNode, range))
		}
	})
	return matchingNodes
}

function createEdit(node: ts.Node, document: vscode.TextDocument): Array<{ offset: number, insert: string }> {
	if (!node || ts.isSourceFile(node)) {
		return []
	}

	// Add a pair of parenthesis around the single arrow function parameter
	if (
		ts.isParameter(node) &&
		ts.isArrowFunction(node.parent) &&
		node.parent.parameters.length === 1 &&
		document.getText(new vscode.Range(
			document.positionAt(node.getEnd()),
			document.positionAt(node.parent.equalsGreaterThanToken.getFullStart())
		)).trim().startsWith(')') === false
	) {
		return [
			{ offset: node.getStart(), insert: '(' + node.getText() + ', ' },
			{ offset: node.getEnd(), insert: ')' },
		]
	}

	if (
		ts.isParameter(node) ||
		ts.isArrayLiteralExpression(node.parent) ||
		(ts.isExpression(node) && ts.isCallExpression(node.parent) && node.parent.arguments.includes(node)) ||
		ts.isPropertyAssignment(node) ||
		(ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent) && node.parent.declarations.length > 1)
	) {
		const leadingSpaces = getLeadingSpaces(node, document)
		const space = leadingSpaces.length === 0 ? ' ' : ''
		return [{ offset: node.getFullStart(), insert: node.getFullText() + ',' + space }]
	}

	if (
		ts.isBinaryExpression(node.parent) &&
		[ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.BarToken, ts.SyntaxKind.CaretToken, ts.SyntaxKind.LessThanLessThanToken, ts.SyntaxKind.GreaterThanGreaterThanToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(node.parent.operatorToken.kind)
	) {
		const leadingSpaces = getLeadingSpaces(node, document)
		const space = leadingSpaces.length === 0 ? ' ' : ''
		if (node.parent.left === node || node.parent.right === node) {
			return [{ offset: node.getFullStart(), insert: node.getFullText() + ' ' + node.parent.operatorToken.getText() + space }]
		}

		return [{ offset: node.parent.right.getFullStart(), insert: node.parent.right.getFullText() + ' ' + node.parent.operatorToken.getText() + space }]
	}

	if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
		const functionCallText = ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent
			? '(' + node.parent.parent.arguments.map(item => item.getFullText()).join(',') + ')'
			: ''

		return [{ offset: node.getStart(), insert: node.getText() + functionCallText + '.' }]
	}

	if (ts.isIfStatement(node.parent)) {
		if (node.parent.expression === node) {
			return [{ offset: node.getStart(), insert: node.getText() + ' && ' }]
		}

		if (node.parent.elseStatement === node) {
			return [{ offset: node.getStart(), insert: 'if () ' + node.getText() + ' else ' }]

		} else {
			return createEdit(node.parent, document)
		}
	}

	if (ts.isIfStatement(node)) {
		return [{ offset: node.getStart(), insert: 'if (' + node.expression.getText() + ') ' + node.thenStatement.getText() + ' else ' }]
	}

	// Do not duplicate a block if it is a part of `if-then-else` or a loop
	if (ts.isBlock(node) && ts.isBlock(node.parent) === false) {
		return createEdit(node.parent, document)
	}

	if (ts.isStatement(node)) {
		const startLine = document.lineAt(document.positionAt(node.getStart()))
		const endLine = document.lineAt(document.positionAt(node.getEnd()))

		const delimiter = (() => {
			if (ts.isBlock(node.parent) || ts.isModuleBlock(node.parent) || ts.isSourceFile(node.parent) || ts.isCaseOrDefaultClause(node.parent)) {
				const index = node.parent.statements.indexOf(node)
				const prevNode = node.parent.statements[index - 1]
				const nextNode = node.parent.statements[index + 1]
				if (
					prevNode && startLine.lineNumber === document.positionAt(prevNode.getEnd()).line ||
					nextNode && endLine.lineNumber === document.positionAt(nextNode.getStart()).line
				) {
					return node.getLastToken()?.getText() === ';' ? ' ' : '; '
				}
			}

			const indentation = startLine.text.substring(0, startLine.firstNonWhitespaceCharacterIndex)
			return '\n' + indentation
		})()

		return [{ offset: node.getStart(), insert: node.getText() + delimiter }]
	}

	return createEdit(node.parent, document)
}

function parseTypeScript(document: vscode.TextDocument) {
	if (/^jsonc?$/.test(document.languageId)) {
		const rootNode = ts.parseJsonText(fp.basename(document.fileName), document.getText())

		// Monkey-patch the broken getStart/getEnd/getText methods as `parent` field are all undefined
		function patch(node: ts.Node) {
			node.forEachChild(childNode => {
				(childNode.parent as any) = node
				if ('getSourceFile' in childNode) {
					childNode.getSourceFile = () => rootNode
				}

				patch(childNode)
			})
		}
		patch(rootNode)

		return rootNode
	}

	if (/^javascript(react)?$/.test(document.languageId)) {
		return ts.createSourceFile(fp.basename(document.fileName), document.getText(), ts.ScriptTarget.ESNext, true, document.languageId.endsWith('react') ? ts.ScriptKind.JSX : ts.ScriptKind.JS)
	}

	if (/^typescript(react)?$/.test(document.languageId)) {
		return ts.createSourceFile(fp.basename(document.fileName), document.getText(), ts.ScriptTarget.ESNext, true, document.languageId.endsWith('react') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
	}
}

function getLeadingSpaces(node: ts.Node, document: vscode.TextDocument) {
	return document.getText(new vscode.Range(
		document.positionAt(node.getFullStart()),
		document.positionAt(node.getStart()),
	)).match(/( |\t)+$/)?.[0] || ''
}
