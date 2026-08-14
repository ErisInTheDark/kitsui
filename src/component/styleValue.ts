function isWordCharacter (character: string): boolean {
	const charCode = character.charCodeAt(0);
	return (false
		|| (charCode >= 48 && charCode <= 57)
		|| (charCode >= 65 && charCode <= 90)
		|| (charCode >= 97 && charCode <= 122)
		|| charCode === 45
		|| charCode === 95
	);
}

function isWhitespaceCharacter (character: string): boolean {
	const charCode = character.charCodeAt(0);
	return (false
		|| charCode === 32
		|| charCode === 9
		|| charCode === 10
		|| charCode === 13
	);
}

export function toCssPropertyName (propertyName: string): string {
	if (propertyName.startsWith("--")) {
		return propertyName;
	}

	if (propertyName.startsWith("$")) {
		propertyName = `--${propertyName.slice(1)}`;
	}

	return propertyName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function compileStyleValue (styleValue: string | number): string {
	if (typeof styleValue === "number") {
		return String(styleValue);
	}

	const src = styleValue;

	let i = 0;
	function peekPreviousNonWhitespaceChar (): string | undefined {
		for (let j = i - 1; j >= 0; j--) {
			if (!isWhitespaceCharacter(src[j])) {
				return src[j];
			}
		}

		return undefined;
	}

	function consumeChar (expected: string): boolean {
		if (src[i] === expected) {
			i++;
			return true;
		}

		return false;
	}

	function consumeWord (): string {
		const start = i;
		for (; i < src.length; i++) {
			if (!isWordCharacter(src[i])) {
				break;
			}
		}

		return src.slice(start, i);
	}

	function consumeWhitespace (): string {
		let result = "";
		while (i < src.length && isWhitespaceCharacter(src[i])) {
			result += src[i++];
		}
		return result;
	}

	function consumeVariableAccess (): string | undefined {
		const restorePoint = i;
		if (!consumeChar("$")) {
			return undefined;
		}

		if (!consumeChar("{")) {
			const variableName = consumeWord();
			if (!variableName) {
				i = restorePoint;
				return undefined;
			}

			return `var(${toCssPropertyName(`$${variableName}`)})`;
		}

		consumeWhitespace();
		const variableName = consumeWord();
		if (!variableName) {
			i = restorePoint;
			return undefined;
		}

		consumeWhitespace();
		if (!consumeChar(":")) {
			i = restorePoint;
			return undefined;
		}

		consumeWhitespace();
		const fallbackValue = consumeStyleValue("}");
		consumeWhitespace();
		if (!consumeChar("}")) {
			i = restorePoint;
			return undefined;
		}

		return `var(${toCssPropertyName(`$${variableName}`)}, ${fallbackValue})`;
	}

	function consumeNegativeVariableAccess (): string | undefined {
		const restorePoint = i;
		const previousChar = peekPreviousNonWhitespaceChar();
		if (previousChar && !"([,:*/%+-".includes(previousChar)) {
			return undefined;
		}

		if (!consumeChar("-")) {
			return undefined;
		}

		const variableAccess = consumeVariableAccess();
		if (!variableAccess) {
			i = restorePoint;
			return undefined;
		}

		return `calc(-1 * ${variableAccess})`;
	}

	function consumeEscapedSquareBrackets (): string | undefined {
		const restorePoint = i;
		if (src[i] !== "[" || src[i + 1] !== "[") {
			return undefined;
		}

		i += 2;
		const contentStart = i;
		const closingBrackets = src.indexOf("]]", i);
		if (closingBrackets < 0) {
			i = restorePoint;
			return undefined;
		}

		i = closingBrackets + 2;
		return `[${src.slice(contentStart, closingBrackets)}]`;
	}

	function consumeCalculation (): string | undefined {
		const restorePoint = i;
		if (!consumeChar("[")) {
			return undefined;
		}

		const expression = consumeStyleValue("]");
		if (!consumeChar("]") || !expression.trim()) {
			i = restorePoint;
			return undefined;
		}

		return `calc(${expression})`;
	}

	function consumeUnmatchedDoubleOpeningBracket (): string | undefined {
		if (src[i] !== "[" || src[i + 1] !== "[") {
			return undefined;
		}

		i += 2;
		return "[[";
	}

	function consumeStyleValue (closingCharacter?: "]" | "}"): string {
		let result = "";
		do {
			if (closingCharacter && src[i] === closingCharacter) {
				return result;
			}

			result += (false
				|| consumeWhitespace()
				|| consumeEscapedSquareBrackets()
				|| consumeCalculation()
				|| consumeUnmatchedDoubleOpeningBracket()
				|| consumeNegativeVariableAccess()
				|| consumeVariableAccess()
				|| src[i++]
			);
		} while (i < src.length);
		return result;
	}

	return consumeStyleValue();
}
