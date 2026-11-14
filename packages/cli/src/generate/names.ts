import { CliError } from "../errors";

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;

export type ResourceNames = {
	raw: string;
	singularKebab: string;
	pluralKebab: string;
	singularPascal: string;
	pluralPascal: string;
	singularCamel: string;
	pluralCamel: string;
	plugin: string;
	table: string;
	errorCode: string;
	notFoundClass: string;
	factory: string;
};

export function kebabCase(input: string): string {
	return input
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

export function pascalCase(kebab: string): string {
	return kebab
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

export function camelCase(kebab: string): string {
	const pascal = pascalCase(kebab);
	return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : pascal;
}

export function snakeCase(kebab: string): string {
	return kebab.replace(/-/g, "_");
}

export function parseResourceName(raw: string, pluralOverride?: string): ResourceNames {
	if (!raw || raw.startsWith("-")) {
		throw new CliError(
			"typeway.generate.missing_name",
			"Usage: typeway generate model|resource <Name> [field:type ...]",
		);
	}

	const singularKebab = kebabCase(raw);
	if (!KEBAB_RE.test(singularKebab)) {
		throw new CliError(
			"typeway.generate.invalid_name",
			`Invalid name "${raw}". Use PascalCase or kebab-case matching /^[a-z][a-z0-9-]*$/.`,
		);
	}

	let pluralKebab: string;
	if (pluralOverride !== undefined) {
		pluralKebab = kebabCase(pluralOverride);
		if (!KEBAB_RE.test(pluralKebab)) {
			throw new CliError(
				"typeway.generate.invalid_name",
				`Invalid --plural "${pluralOverride}". Use kebab-case matching /^[a-z][a-z0-9-]*$/.`,
			);
		}
	} else {
		pluralKebab = `${singularKebab}s`;
	}

	const singularPascal = pascalCase(singularKebab);
	const pluralPascal = pascalCase(pluralKebab);
	const singularCamel = camelCase(singularKebab);
	const pluralCamel = camelCase(pluralKebab);

	return {
		raw,
		singularKebab,
		pluralKebab,
		singularPascal,
		pluralPascal,
		singularCamel,
		pluralCamel,
		plugin: `${pluralCamel}Api`,
		table: snakeCase(pluralKebab),
		errorCode: `${snakeCase(singularKebab)}.not_found`,
		notFoundClass: `${singularPascal}NotFound`,
		factory: `${singularCamel}Factory`,
	};
}
