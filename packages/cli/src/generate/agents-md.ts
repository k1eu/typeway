import type { GenerateManifest } from "./manifest";

export const CONVENTIONS_START = "<!-- typeway:conventions:start -->";
export const CONVENTIONS_END = "<!-- typeway:conventions:end -->";

export function managedAgentsBlock(manifest: GenerateManifest): string {
	const inventory = inventoryLines(manifest);
	const inventorySection =
		inventory.length > 0
			? `\n## Inventory\n\n${inventory.join("\n")}\n`
			: "\n## Inventory\n\n(none yet — run typeway generate model|resource)\n";

	return `${CONVENTIONS_START}
## Layout

app/           domain logic. models, context, use cases.
config/        typed configuration. env is validated at boot.
db/            schema and migrations. one table per file.
server/        http. elysia routes, the \`backend\` instance.
src/           frontend. src/server.ts is the SSR entry — do not rename it.
tests/         process-level integration. unit tests live beside sources.

## Rules

- Models are \`app/models/<singular>.ts\` and export queries, never a bare table.
  The table lives in \`db/schema/\`.
- Database access goes through \`getDb()\`. Never import the connection directly.
- Validation is TypeBox (\`import { t } from "elysia"\`,
  \`import type { Static } from "typebox"\`). Do not add a second
  validation library. Infer with \`Static<typeof schema>\`, not \`.static\`.
- Domain data goes through Elysia \`/api\` routes. Pages call them with Eden
  (\`src/lib/api.ts\`). Do not call models from loaders. Do not put CRUD in
  \`createServerFn\`.
- Routes are registered on \`backend\`; anything unmatched is the frontend.
  Do not add a catch-all route.
- Errors are \`HTTPError.id("<code>", status)\`. Return them from handlers.

## Commands

  bun run dev          api + ssr + hmr, one process
  bun run build        client, ssr, and \`dist/app\`
  bun test             unit and integration
  typeway routes --json
  typeway models --json
  typeway generate     scaffolds code and this section
${inventorySection}${CONVENTIONS_END}`;
}

export function inventoryLines(manifest: GenerateManifest): string[] {
	const byName = new Map<string, { model?: GenerateManifest["models"][number]; resource?: GenerateManifest["resources"][number] }>();
	for (const model of manifest.models) {
		const slot = byName.get(model.name) ?? {};
		slot.model = model;
		byName.set(model.name, slot);
	}
	for (const resource of manifest.resources) {
		const slot = byName.get(resource.name) ?? {};
		slot.resource = resource;
		byName.set(resource.name, slot);
	}
	return [...byName.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, slot]) => {
			const parts: string[] = [];
			if (slot.model) {
				parts.push(slot.model.file, slot.model.schema);
			}
			if (slot.resource) {
				parts.push("GET/POST/PATCH/DELETE /api/" + slot.resource.plural);
				parts.push(`pages /${slot.resource.plural}`);
			}
			return `- ${name} → ${parts.join(", ")}`;
		});
}

export function llmsInventory(manifest: GenerateManifest): string {
	const lines = inventoryLines(manifest);
	if (lines.length === 0) {
		return "Generated inventory: (none yet)\n";
	}
	return `Generated inventory:\n${lines.join("\n")}\n`;
}
