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

export function expandVariableAccessShorthand (styleValue: string | number): string {
	if (typeof styleValue === "number") {
		return String(styleValue);
	}

	const src = styleValue;

	let i = 0;
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

	let awaitingClosingBrace = 0;
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
		awaitingClosingBrace++;
		const fallbackValue = consumeStyleValue();
		consumeWhitespace();
		if (!consumeChar("}")) {
			i = restorePoint;
			return undefined;
		}

		return `var(${toCssPropertyName(`$${variableName}`)}, ${fallbackValue})`;
	}

	function consumeStyleValue (): string {
		let result = "";
		do {
			if (awaitingClosingBrace && src[i] === "}") {
				awaitingClosingBrace--;
				return result;
			}

			result += consumeWhitespace() || consumeVariableAccess() || src[i++];
		} while (i < src.length);
		return result;
	}

	return consumeStyleValue();
}