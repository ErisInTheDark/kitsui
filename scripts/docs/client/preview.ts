function isWhitespace (character: string | undefined): boolean {
	return character !== undefined && /\s/u.test(character);
}

function isIdentifierCharacter (character: string | undefined): boolean {
	return character !== undefined && /[A-Za-z0-9_$]/u.test(character);
}

function readPreviousWord (source: string, index: number): string {
	let end = index + 1;
	while (end > 0 && !isIdentifierCharacter(source[end - 1])) {
		end--;
	}

	let start = end;
	while (start > 0 && isIdentifierCharacter(source[start - 1])) {
		start--;
	}

	return source.slice(start, end);
}

function findStringEnd (source: string, start: number, quote: string): number {
	let index = start + 1;
	while (index < source.length) {
		const character = source[index];
		if (character === "\\") {
			index += 2;
			continue;
		}

		if (character === quote) {
			return index;
		}

		index++;
	}

	return source.length - 1;
}

function findBlockCommentEnd (source: string, start: number): number {
	const end = source.indexOf("*/", start + 2);
	return end >= 0 ? end + 1 : source.length - 1;
}

function findLineCommentEnd (source: string, start: number): number {
	const end = source.indexOf("\n", start + 2);
	return end >= 0 ? end - 1 : source.length - 1;
}

function previousSignificantIndex (source: string, index: number): number {
	let result = index;
	while (result >= 0 && isWhitespace(source[result])) {
		result--;
	}

	return result;
}

function isRegexLiteralStart (source: string, start: number): boolean {
	if (source[start] !== "/" || source[start + 1] === "/" || source[start + 1] === "*") {
		return false;
	}

	const previousIndex = previousSignificantIndex(source, start - 1);
	if (previousIndex < 0) {
		return true;
	}

	const previousCharacter = source[previousIndex];
	if ("({[=,:;!?&|^~<>+-*".includes(previousCharacter)) {
		return true;
	}

	const previousWord = readPreviousWord(source, previousIndex);
	return previousWord === "return"
		|| previousWord === "case"
		|| previousWord === "delete"
		|| previousWord === "in"
		|| previousWord === "instanceof"
		|| previousWord === "new"
		|| previousWord === "throw"
		|| previousWord === "typeof"
		|| previousWord === "void";
}

function findRegexLiteralEnd (source: string, start: number): number {
	let index = start + 1;
	let inCharacterClass = false;

	while (index < source.length) {
		const character = source[index];
		if (character === "\\") {
			index += 2;
			continue;
		}

		if (character === "[") {
			inCharacterClass = true;
			index++;
			continue;
		}

		if (character === "]") {
			inCharacterClass = false;
			index++;
			continue;
		}

		if (character === "/" && !inCharacterClass) {
			index++;
			while (index < source.length && /[A-Za-z]/u.test(source[index])) {
				index++;
			}

			return index - 1;
		}

		index++;
	}

	return source.length - 1;
}

function findTemplateExpressionEnd (source: string, start: number): number {
	let depth = 1;
	let index = start;

	while (index < source.length && depth > 0) {
		const character = source[index];
		const nextCharacter = source[index + 1];

		if (character === "\"" || character === "'") {
			index = findStringEnd(source, index, character) + 1;
			continue;
		}

		if (character === "`") {
			index = findTemplateEnd(source, index) + 1;
			continue;
		}

		if (character === "/" && nextCharacter === "/") {
			index = findLineCommentEnd(source, index) + 1;
			continue;
		}

		if (character === "/" && nextCharacter === "*") {
			index = findBlockCommentEnd(source, index) + 1;
			continue;
		}

		if (character === "{") {
			depth++;
		} else if (character === "}") {
			depth--;
		}

		index++;
	}

	return index;
}

function findTemplateEnd (source: string, start: number): number {
	let index = start + 1;
	while (index < source.length) {
		const character = source[index];

		if (character === "\\") {
			index += 2;
			continue;
		}

		if (character === "`") {
			return index;
		}

		if (character === "$" && source[index + 1] === "{") {
			index = findTemplateExpressionEnd(source, index + 2);
			continue;
		}

		index++;
	}

	return source.length - 1;
}

function isImportSpecifierContext (source: string, quoteStart: number): boolean {
	let index = quoteStart - 1;
	while (index >= 0 && isWhitespace(source[index])) {
		index--;
	}

	if (index >= 0 && source[index] === "(") {
		index--;
		while (index >= 0 && isWhitespace(source[index])) {
			index--;
		}

		const previousWord = readPreviousWord(source, index);
		return previousWord === "import" || previousWord === "require";
	}

	const previousWord = readPreviousWord(source, index);
	return previousWord === "from" || previousWord === "import";
}

export function rewritePreviewModuleImports (source: string, moduleUrl: string): string {
	const moduleSpecifier = JSON.stringify(moduleUrl);
	let result = "";
	let index = 0;

	while (index < source.length) {
		const character = source[index];
		const nextCharacter = source[index + 1];

		if (character === "\"" || character === "'") {
			const end = findStringEnd(source, index, character);
			const literal = source.slice(index + 1, end);
			if (literal === "kitsui" && isImportSpecifierContext(source, index)) {
				result += moduleSpecifier;
			} else {
				result += source.slice(index, end + 1);
			}

			index = end + 1;
			continue;
		}

		if (character === "`") {
			const end = findTemplateEnd(source, index);
			result += source.slice(index, end + 1);
			index = end + 1;
			continue;
		}

		if (character === "/" && isRegexLiteralStart(source, index)) {
			const end = findRegexLiteralEnd(source, index);
			result += source.slice(index, end + 1);
			index = end + 1;
			continue;
		}

		if (character === "/" && nextCharacter === "/") {
			const end = findLineCommentEnd(source, index);
			result += source.slice(index, end + 1);
			index = end + 1;
			continue;
		}

		if (character === "/" && nextCharacter === "*") {
			const end = findBlockCommentEnd(source, index);
			result += source.slice(index, end + 1);
			index = end + 1;
			continue;
		}

		result += character;
		index++;
	}

	return result;
}