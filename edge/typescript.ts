import * as fp from 'path'
import * as vscode from 'vscode'
import ts from 'typescript'
import sortBy from 'lodash/sortBy'

export async function insertLog(editor: vscode.TextEditor) {
	const { document } = editor

	const rootNode = parseTypeScript(document)
	if (!rootNode) {
		return
	}

	const copiedText = (await vscode.env.clipboard.readText()).trim()

	const bottomFirstCursors = sortBy(editor.selections, cursor =>
		-Math.min(document.offsetAt(cursor.active), document.offsetAt(cursor.anchor))
	)

	let edited = false

	for (const cursor of bottomFirstCursors) {
		if (
			cursor.isEmpty
				? document.lineAt(cursor.active.line).isEmptyOrWhitespace
				: document.getText(cursor).trim().length === 0
		) {
			if (copiedText.length > 0) {
				const captionText = getCaption(copiedText)
				const snippet = new vscode.SnippetString(`console.debug('*** `)
				snippet.appendVariable('1', getCaption(copiedText))
				snippet.appendText(` »', `)
				snippet.appendVariable(captionText === copiedText ? '1' : '2', copiedText)
				snippet.appendText(')')
				snippet.appendTabstop(0)
				await editor.insertSnippet(snippet, cursor, { undoStopBefore: false, undoStopAfter: false })
				edited = true
				continue

			} else {
				const snippet = new vscode.SnippetString(`console.debug('*** $1 »', $1)`)
				snippet.appendTabstop(0)
				await editor.insertSnippet(snippet, cursor, { undoStopBefore: false, undoStopAfter: false })
				edited = true
				continue
			}
		}

		const selectionRange: [number, number] = cursor.isReversed
			? [document.offsetAt(cursor.active), document.offsetAt(cursor.anchor)]
			: [document.offsetAt(cursor.anchor), document.offsetAt(cursor.active)]

		const smallestSelectNode = findSmallestNode(rootNode, selectionRange)
		if (!smallestSelectNode) {
			continue
		}

		const expressionNode = findExpressionNode(smallestSelectNode)
		if (!expressionNode) {
			continue
		}

		const [captionText, expressionText] = (() => {
			if (expressionNode.parent && ts.isPropertyAssignment(expressionNode.parent) && !ts.isComputedPropertyName(expressionNode.parent.name)) {
				return [getCaption(expressionNode.parent.name), expressionNode.parent.initializer.getText()]
			}

			return [getCaption(expressionNode), expressionNode.getText()]
		})()

		const debuggingText = `console.debug('*** ${captionText} »', ${expressionText})`

		const edit = createEdit(expressionNode)?.(debuggingText, document)
		if (!edit) {
			continue
		}

		const [positionOrRange, text] = edit
		const formattedText = format(text, positionOrRange, editor)

		await editor.edit(edit => {
			if (positionOrRange instanceof vscode.Range) {
				edit.replace(positionOrRange, formattedText)
			} else {
				edit.insert(positionOrRange, formattedText)
			}
		}, { undoStopBefore: false, undoStopAfter: false })
		edited = true
	}

	if (edited) {
		await vscode.commands.executeCommand('editor.action.formatDocument')
	}
}

function findSmallestNode(node: ts.Node, selectionRange: readonly [number, number]): ts.Node | undefined {
	return node.forEachChild(childNode => {
		if (childNode.getStart() <= selectionRange[0] && selectionRange[1] <= childNode.getEnd()) {
			const smallerNode = findSmallestNode(childNode, selectionRange)
			return smallerNode ?? childNode
		}
	})
}

function findExpressionNode(node: ts.Node): ts.Node | null {
	if (!node || ts.isSourceFile(node)) {
		return null
	}

	// Expand `0` to `array[0]`
	if (ts.isLiteralExpression(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) {
		return node.parent
	}

	if (ts.isExpression(node)) {
		// Expand `field` to `object.field`
		if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
			return findExpressionNode(node.parent)
		}

		// Expand `delegate` to `delegate(...args)`
		if (ts.isCallLikeExpression(node.parent) && 'expression' in node.parent && node.parent.expression === node) {
			return node.parent
		}

		return node
	}

	if (ts.isParameter(node)) {
		return node
	}

	if (ts.isVariableDeclaration(node)) {
		return node.name
	}

	if (ts.isVariableDeclarationList(node)) {
		return node.declarations[0].name
	}

	if (ts.isReturnStatement(node)) {
		return node.expression || null
	}

	if (ts.isStatement(node)) {
		if (!ts.isExpressionStatement(node)) {
			// Do not work with iteration or condition statements
			return null
		}

		return node
	}

	return findExpressionNode(node.parent)
}

function createEdit(node: ts.Node): ReturnType<typeof createEditInternal> | null {
	if (!node || !node.parent) {
		return null
	}

	if (ts.isArrowFunction(node.parent) && node.parent.body === node) {
		return createEditInternal({ before: node.parent.body, prefix: 'return ' })
	}

	/* if (ts.isPropertyAssignment(node)) {
		return createEditInternal({ before: node.initializer, prefix: 'return ' })
	} */

	if (ts.isParameter(node) && (
		ts.isFunctionDeclaration(node.parent) ||
		ts.isFunctionExpression(node.parent) ||
		ts.isArrowFunction(node.parent) ||
		ts.isConstructorDeclaration(node.parent) ||
		ts.isMethodDeclaration(node.parent) ||
		ts.isAccessor(node.parent)
	) && node.parent.body) {
		if (ts.isExpression(node.parent.body)) {
			return createEditInternal({ before: node.parent.body, prefix: 'return ' })

		} else {
			return createEditInternal({ inside: node.parent.body })
		}
	}

	if (ts.isIfStatement(node.parent)) {
		if (node.parent.expression === node) {
			return createEditInternal({ before: node.parent })
		}
	}

	if (ts.isWhileStatement(node.parent) || ts.isDoStatement(node.parent)) {
		if (ts.isBlock(node.parent.statement)) {
			return createEditInternal({ inside: node.parent.statement })
		}

		return createEditInternal({ before: node.parent.statement })
	}

	if (ts.isForInStatement(node.parent) || ts.isForOfStatement(node.parent)) {
		if (node.parent.initializer === node) {
			if (isBlockLike(node.parent.statement)) {
				return createEditInternal({ inside: node.parent.statement })
			}

			return createEditInternal({ before: node.parent.statement })
		}

		if (node.parent.expression === node) {
			return createEditInternal({ before: node.parent })
		}
	}

	if (ts.isForStatement(node.parent)) {
		if (isBlockLike(node.parent.statement)) {
			return createEditInternal({ inside: node.parent.statement })

		} else {
			return createEditInternal({ before: node.parent.statement })
		}
	}

	if (ts.isReturnStatement(node)) {
		return createEditInternal({ before: node })
	}

	if (ts.isStatement(node)) {
		return createEditInternal({ after: node })
	}

	return createEdit(node.parent)
}

function createEditInternal(
	reference:
		| { before: ts.Statement | ts.Expression, prefix?: string }
		| { after: ts.Node }
		| { inside: ts.BlockLike },
): (text: string, document: vscode.TextDocument) => [vscode.Position | vscode.Range, string] {
	if ('inside' in reference) {
		if (reference.inside.statements.length > 0) {
			return createEditInternal({ before: reference.inside.statements[0] })
		}

		return createEditInternal({ after: reference.inside.getFirstToken()! })

	} else if ('before' in reference) {
		if (isBlockLike(reference.before.parent)) {
			return (text, document) =>
				[document.positionAt(reference.before.getStart()), text + '\n' + (reference.prefix || '')]
		}

		return (text, document) => {
			const range = new vscode.Range(
				document.positionAt(reference.before.getFullStart()),
				document.positionAt(reference.before.getEnd())
			)
			return [range, ' {\n' + text + '\n' + (reference.prefix || '') + reference.before.getText() + '\n}']
		}

	} else {
		if (isBlockLike(reference.after.parent)) {
			return (text, document) =>
				[document.positionAt(reference.after.getEnd()), '\n' + text]
		}

		return (text, document) => {
			const range = new vscode.Range(
				document.positionAt(reference.after.getFullStart()),
				document.positionAt(reference.after.getEnd())
			)
			return [range, ' {\n' + reference.after.getText() + '\n' + text + '\n}']
		}
	}
}

function format(text: string, cursor: vscode.Position | vscode.Range, editor: Pick<vscode.TextEditor, 'document' | 'options'>): string {
	const line = editor.document.lineAt(cursor instanceof vscode.Range ? cursor.start.line : cursor.line)

	const singleIndent = editor.options.insertSpaces === true && typeof editor.options.tabSize === 'number' ? ' '.repeat(editor.options.tabSize) : '\t'
	let indentLevel = line.firstNonWhitespaceCharacterIndex / singleIndent.length

	return text.split('\n').map((line, rank, lines) => {
		if (rank === 0) {
			return line
		}

		const prevLine = lines[rank - 1]
		if (prevLine.endsWith('{')) {
			indentLevel += 1
		}

		if (line.startsWith('}')) {
			indentLevel -= 1
		}

		if (indentLevel < 0) {
			indentLevel = 0
		}

		return singleIndent.repeat(indentLevel) + line
	}).join('\n')
}

function getCaption(input: string | ts.Node) {
	return truncate(
		(typeof input === 'string' ? input : input.getText())
			.replace(/\r?\n/g, '')
			.replace(/'/g, '"')
			.replace(/\s+/g, ' ')
	)
}

function truncate(input: string) {
	if (input.length <= 30) {
		return input
	}

	if (input.endsWith(')')) {
		let lonelyOpenParenthesisCount = 0
		for (const char of input.substring(0, 28)) {
			if (char === '(')
				lonelyOpenParenthesisCount += 1
			if (char === ')')
				lonelyOpenParenthesisCount -= 1
		}

		if (lonelyOpenParenthesisCount > 0) {
			return input.substring(0, 28) + '⋯)'
		}
	}

	return input.substring(0, 29) + '⋯'
}

function parseTypeScript(document: vscode.TextDocument) {
	if (/^javascript(react)?$/.test(document.languageId)) {
		return ts.createSourceFile(fp.basename(document.fileName), document.getText(), ts.ScriptTarget.ESNext, true, document.languageId.endsWith('react') ? ts.ScriptKind.JSX : ts.ScriptKind.JS)
	}

	if (/^typescript(react)?$/.test(document.languageId)) {
		return ts.createSourceFile(fp.basename(document.fileName), document.getText(), ts.ScriptTarget.ESNext, true, document.languageId.endsWith('react') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
	}
}

function isBlockLike(node: ts.Node): node is ts.BlockLike {
	return ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseOrDefaultClause(node)
}
