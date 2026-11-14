import { drizzleImports, type FieldSpec } from "./fields";
import type { ResourceNames } from "./names";

export function schemaFile(names: ResourceNames, fields: FieldSpec[]): string {
	const imports = drizzleImports(fields).sort();
	const cols = [
		`  id: integer("id").primaryKey({ autoIncrement: true }),`,
		...fields.map((f) => `  ${f.drizzle},`),
		`  createdAt: integer("created_at", { mode: "timestamp_ms" })`,
		`    .notNull()`,
		`    .$defaultFn(() => new Date()),`,
		`  updatedAt: integer("updated_at", { mode: "timestamp_ms" })`,
		`    .notNull()`,
		`    .$defaultFn(() => new Date()),`,
	];
	return `import { ${imports.join(", ")} } from "drizzle-orm/sqlite-core"

export const ${names.pluralCamel} = sqliteTable("${names.table}", {
${cols.join("\n")}
})

export type ${names.singularPascal}Row = typeof ${names.pluralCamel}.$inferSelect
export type New${names.singularPascal}Row = typeof ${names.pluralCamel}.$inferInsert
`;
}

export function typeboxFile(names: ResourceNames, fields: FieldSpec[]): string {
	const createFields = fields.map((f) => `  ${f.camel}: ${f.typebox},`).join("\n");
	const outputFields = [
		`  id: t.Number(),`,
		...fields.map((f) => `  ${f.camel}: ${outputTypebox(f.kind)},`),
		`  createdAt: t.Date(),`,
		`  updatedAt: t.Date(),`,
	].join("\n");
	return `import { t } from "elysia"
import type { Static } from "typebox"

export const ${names.singularPascal}Create = t.Object({
${createFields}
})
export type ${names.singularPascal}Create = Static<typeof ${names.singularPascal}Create>

export const ${names.singularPascal}Update = t.Partial(${names.singularPascal}Create)
export type ${names.singularPascal}Update = Static<typeof ${names.singularPascal}Update>

export const ${names.singularPascal}Params = t.Object({
  id: t.Number(),
})
export type ${names.singularPascal}Params = Static<typeof ${names.singularPascal}Params>

export const ${names.singularPascal} = t.Object({
${outputFields}
})
export type ${names.singularPascal} = Static<typeof ${names.singularPascal}>
`;
}

export function modelFile(names: ResourceNames): string {
	const T = names.singularPascal;
	const table = names.pluralCamel;
	return `import { desc, eq } from "drizzle-orm"
import { getDb } from "../context"
import { ${table}, type ${T}Row } from "../../db/schema/${names.pluralKebab}"
import type { ${T}Create, ${T}Update } from "../schemas/${names.singularKebab}"

export const ${T} = {
  all(): ${T}Row[] {
    return getDb()
      .select()
      .from(${table})
      .orderBy(desc(${table}.createdAt))
      .all()
  },

  find(id: number): ${T}Row | undefined {
    return getDb().select().from(${table}).where(eq(${table}.id, id)).get()
  },

  create(input: ${T}Create): ${T}Row {
    return getDb().insert(${table}).values(input).returning().get()
  },

  update(id: number, input: ${T}Update): ${T}Row | undefined {
    return getDb()
      .update(${table})
      .set({ ...input, updatedAt: new Date() })
      .where(eq(${table}.id, id))
      .returning()
      .get()
  },

  destroy(id: number): ${T}Row | undefined {
    return getDb()
      .delete(${table})
      .where(eq(${table}.id, id))
      .returning()
      .get()
  },
}
`;
}

export function modelTestFile(names: ResourceNames, fields: FieldSpec[]): string {
	const T = names.singularPascal;
	const first = fields[0]!;
	const createArg = `{ ${fields.map((f) => `${f.camel}: ${sampleValue(f, "create")}`).join(", ")} }`;
	return `import { afterEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../../config/database"
import { ${T} } from "./${names.singularKebab}"

afterEach(() => {
  db.run(sql\`DELETE FROM ${names.table}\`)
})

describe("${T}", () => {
  test("create then all", () => {
    const row = ${T}.create(${createArg})
    expect(row.${first.camel}).toBe(${sampleValue(first, "create")})
    expect(${T}.all().map((row) => row.id)).toContain(row.id)
  })
})
`;
}

export function factoryFile(names: ResourceNames, fields: FieldSpec[]): string {
	const T = names.singularPascal;
	const defaults = fields.map((f) => `      ${f.camel}: ${f.factoryValue},`).join("\n");
	return `import { getDb } from "../../app/context"
import { ${names.pluralCamel}, type New${T}Row, type ${T}Row } from "../schema/${names.pluralKebab}"

export function ${names.factory}(
  overrides: Partial<New${T}Row> = {},
): ${T}Row {
  return getDb()
    .insert(${names.pluralCamel})
    .values({
${defaults}
      ...overrides,
    })
    .returning()
    .get()
}
`;
}

export function routeFile(names: ResourceNames): string {
	const T = names.singularPascal;
	const plugin = names.plugin;
	return `import { Elysia, t } from "elysia"
import { ${T} } from "../../app/models/${names.singularKebab}"
import { ${names.notFoundClass} } from "../../app/errors"
import {
  ${T} as ${T}Schema,
  ${T}Create,
  ${T}Params,
  ${T}Update,
} from "../../app/schemas/${names.singularKebab}"

export const ${plugin} = new Elysia({ prefix: "/${names.pluralKebab}" })
  .get("/", { response: t.Array(${T}Schema) }, () => ${T}.all())
  .post("/", { body: ${T}Create, response: ${T}Schema }, ({ body }) =>
    ${T}.create(body),
  )
  .get("/:id", { params: ${T}Params, response: ${T}Schema }, ({ params }) => {
    const row = ${T}.find(params.id)
    if (!row) return new ${names.notFoundClass}(params.id)
    return row
  })
  .patch(
    "/:id",
    { params: ${T}Params, body: ${T}Update, response: ${T}Schema },
    ({ params, body }) => {
      const row = ${T}.update(params.id, body)
      if (!row) return new ${names.notFoundClass}(params.id)
      return row
    },
  )
  .delete("/:id", { params: ${T}Params, response: ${T}Schema }, ({ params }) => {
    const row = ${T}.destroy(params.id)
    if (!row) return new ${names.notFoundClass}(params.id)
    return row
  })
`;
}

export function routeTestFile(names: ResourceNames, fields: FieldSpec[]): string {
	const T = names.singularPascal;
	const first = fields[0]!;
	const createArg = `{ ${fields.map((f) => `${f.camel}: ${sampleValue(f, "create")}`).join(", ")} }`;
	const emptyArg = `{ ${fields.map((f) => `${f.camel}: ${emptyValue(f)}`).join(", ")} }`;
	const invalid = fields.find((f) => f.kind === "string" || f.kind === "text");
	const invalidTest = invalid
		? `
  test("rejects empty ${invalid.camel}", async () => {
    const { error } = await withApp(() =>
      api.api.${names.pluralCamel}.post(${emptyArg}),
    )
    expect(error?.status).toBe(422)
  })
`
		: "";
	return `import { afterEach, describe, expect, test } from "bun:test"
import { treaty } from "@elysia/eden"
import { sql } from "drizzle-orm"
import { db } from "../../config/database"
import { runWithContext } from "../../app/context"
import { ${names.factory} } from "../../db/factories/${names.singularKebab}"
import { backend } from "../app"

const api = treaty(backend)

afterEach(() => {
  db.run(sql\`DELETE FROM ${names.table}\`)
})

function withApp<T>(fn: () => T): T {
  return runWithContext({ db, txDepth: 0, backend }, fn)
}

describe("GET /api/${names.pluralKebab}", () => {
  test("empty list", async () => {
    const { data, error } = await withApp(() => api.api.${names.pluralCamel}.get())
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test("lists a factory row", async () => {
    const row = ${names.factory}()
    const { data, error } = await withApp(() => api.api.${names.pluralCamel}.get())
    expect(error).toBeNull()
    expect(data?.map((item) => item.id)).toContain(row.id)
  })
})

describe("POST /api/${names.pluralKebab}", () => {
  test("creates", async () => {
    const { data, error } = await withApp(() =>
      api.api.${names.pluralCamel}.post(${createArg}),
    )
    expect(error).toBeNull()
    expect(data?.${first.camel}).toBe(${sampleValue(first, "create")})
  })
${invalidTest}})

describe("GET /api/${names.pluralKebab}/:id", () => {
  test("404 is ${names.errorCode}", async () => {
    const { error } = await withApp(() =>
      api.api.${names.pluralCamel}({ id: 999 }).get(),
    )
    expect(error?.status).toBe(404)
    expect(error?.value).toMatchObject({ code: "${names.errorCode}" })
  })
})
`;
}

function outputTypebox(kind: FieldSpec["kind"]): string {
	switch (kind) {
		case "string":
		case "text":
			return "t.String()";
		case "integer":
		case "real":
			return "t.Number()";
		case "boolean":
			return "t.Boolean()";
		case "timestamp":
			return "t.Date()";
	}
}

function sampleValue(field: FieldSpec, kind: "create"): string {
	void kind;
	switch (field.kind) {
		case "string":
			return field.camel === "title" ? '"Hi"' : `"${field.camel}"`;
		case "text":
			return '"there"';
		case "integer":
		case "real":
			return "1";
		case "boolean":
			return "true";
		case "timestamp":
			return "new Date()";
	}
}

function emptyValue(field: FieldSpec): string {
	switch (field.kind) {
		case "string":
		case "text":
			return '""';
		case "integer":
		case "real":
			return "0";
		case "boolean":
			return "false";
		case "timestamp":
			return "new Date()";
	}
}

export function indexPage(names: ResourceNames, fields: FieldSpec[]): string {
	const label = fields[0]?.camel ?? "id";
	return `import { Link, createFileRoute } from "@tanstack/react-router"
import { api } from "../../lib/api"

export const Route = createFileRoute("/${names.pluralKebab}/")({
  loader: async () => {
    const { data, error } = await api().api.${names.pluralCamel}.get()
    if (error) throw error
    return data
  },
  component: ${names.pluralPascal}Index,
})

function ${names.pluralPascal}Index() {
  const rows = Route.useLoaderData()
  return (
    <main>
      <h1>${names.pluralPascal}</h1>
      <p>
        <Link to="/${names.pluralKebab}/new">New ${names.singularPascal}</Link>
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to="/${names.pluralKebab}/$id"
              params={{ id: String(row.id) }}
            >
              {String(row.${label})}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
`;
}

export function showPage(names: ResourceNames, fields: FieldSpec[]): string {
	const dts = fields
		.map(
			(f) => `        <dt>${f.camel}</dt>
        <dd>{String(row.${f.camel})}</dd>`,
		)
		.join("\n");
	return `import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { api } from "../../lib/api"

export const Route = createFileRoute("/${names.pluralKebab}/$id")({
  loader: async ({ params }) => {
    const { data, error } = await api().api.${names.pluralCamel}({
      id: Number(params.id),
    }).get()
    if (error?.status === 404) throw notFound()
    if (error) throw error
    return data
  },
  component: ${names.singularPascal}Show,
})

function ${names.singularPascal}Show() {
  const row = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <main>
      <p>
        <Link to="/${names.pluralKebab}">← ${names.pluralPascal}</Link>
      </p>
      <h1>{String(row.${fields[0]?.camel ?? "id"})}</h1>
      <dl>
${dts}
      </dl>
      <p>
        <Link
          to="/${names.pluralKebab}/$id/edit"
          params={{ id: String(row.id) }}
        >
          Edit
        </Link>
        {" "}
        <button
          type="button"
          onClick={async () => {
            const { error } = await api().api.${names.pluralCamel}({ id: row.id }).delete()
            if (error) throw error
            await navigate({ to: "/${names.pluralKebab}" })
          }}
        >
          Delete
        </button>
      </p>
    </main>
  )
}
`;
}

export function newPage(names: ResourceNames, fields: FieldSpec[]): string {
	const defaults = fields.map((f) => `    ${f.camel}: ${f.formDefault},`).join("\n");
	const inputs = fields.map((f) => formInput(f)).join("\n");
	const payload = payloadExpr(fields);
	return `import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "../../lib/api"

export const Route = createFileRoute("/${names.pluralKebab}/new")({
  component: ${names.singularPascal}New,
})

function ${names.singularPascal}New() {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState({
${defaults}
  })

  return (
    <main>
      <p>
        <Link to="/${names.pluralKebab}">← ${names.pluralPascal}</Link>
      </p>
      <h1>New ${names.singularPascal}</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setPending(true)
          try {
            const { data, error } = await api().api.${names.pluralCamel}.post(${payload})
            if (error) throw error
            await navigate({
              to: "/${names.pluralKebab}/$id",
              params: { id: String(data.id) },
            })
          } finally {
            setPending(false)
          }
        }}
      >
${inputs}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create"}
        </button>
      </form>
    </main>
  )
}
`;
}

export function editPage(names: ResourceNames, fields: FieldSpec[]): string {
	const init = fields.map((f) => `    ${f.camel}: ${formInit(f)},`).join("\n");
	const inputs = fields.map((f) => formInput(f)).join("\n");
	const payload = payloadExpr(fields);
	return `import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "../../lib/api"

export const Route = createFileRoute("/${names.pluralKebab}/$id/edit")({
  loader: async ({ params }) => {
    const { data, error } = await api().api.${names.pluralCamel}({
      id: Number(params.id),
    }).get()
    if (error?.status === 404) throw notFound()
    if (error) throw error
    return data
  },
  component: ${names.singularPascal}Edit,
})

function ${names.singularPascal}Edit() {
  const row = Route.useLoaderData()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState({
${init}
  })

  return (
    <main>
      <p>
        <Link
          to="/${names.pluralKebab}/$id"
          params={{ id: String(row.id) }}
        >
          ← {String(row.${fields[0]?.camel ?? "id"})}
        </Link>
      </p>
      <h1>Edit ${names.singularPascal}</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setPending(true)
          try {
            const { error } = await api().api.${names.pluralCamel}({ id: row.id }).patch(${payload})
            if (error) throw error
            await navigate({
              to: "/${names.pluralKebab}/$id",
              params: { id: String(row.id) },
            })
          } finally {
            setPending(false)
          }
        }}
      >
${inputs}
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  )
}
`;
}

function formInit(field: FieldSpec): string {
	switch (field.kind) {
		case "boolean":
			return `Boolean(row.${field.camel})`;
		case "integer":
		case "real":
			return `Number(row.${field.camel})`;
		default:
			return `String(row.${field.camel} ?? "")`;
	}
}

function formInput(field: FieldSpec): string {
	if (field.kind === "text") {
		return `        <label>
          ${field.camel}
          <textarea
            name="${field.camel}"
            value={form.${field.camel}}
            onChange={(event) =>
              setForm((current) => ({ ...current, ${field.camel}: event.target.value }))
            }
          />
        </label>`;
	}
	if (field.kind === "boolean") {
		return `        <label>
          <input
            type="checkbox"
            name="${field.camel}"
            checked={Boolean(form.${field.camel})}
            onChange={(event) =>
              setForm((current) => ({ ...current, ${field.camel}: event.target.checked }))
            }
          />
          ${field.camel}
        </label>`;
	}
	if (field.kind === "integer" || field.kind === "real") {
		return `        <label>
          ${field.camel}
          <input
            type="number"
            name="${field.camel}"
            value={form.${field.camel}}
            onChange={(event) =>
              setForm((current) => ({ ...current, ${field.camel}: Number(event.target.value) }))
            }
          />
        </label>`;
	}
	return `        <label>
          ${field.camel}
          <input
            name="${field.camel}"
            value={String(form.${field.camel})}
            onChange={(event) =>
              setForm((current) => ({ ...current, ${field.camel}: event.target.value }))
            }
          />
        </label>`;
}

function payloadExpr(fields: FieldSpec[]): string {
	if (fields.length === 0) return "{}";
	return `{ ${fields.map((f) => `${f.camel}: form.${f.camel}`).join(", ")} }`;
}

export function docsPage(
	names: ResourceNames,
	fields: FieldSpec[],
	kind: "model" | "resource",
): string {
	const cols = ["id", ...fields.map((f) => f.snake), "created_at", "updated_at"].join(", ");
	const http =
		kind === "resource"
			? `
## HTTP

| Method | Path |
| --- | --- |
| GET | /api/${names.pluralKebab} |
| POST | /api/${names.pluralKebab} |
| GET | /api/${names.pluralKebab}/:id |
| PATCH | /api/${names.pluralKebab}/:id |
| DELETE | /api/${names.pluralKebab}/:id |

Pages: \`/${names.pluralKebab}\`, \`/${names.pluralKebab}/new\`, \`/${names.pluralKebab}/$id\`, \`/${names.pluralKebab}/$id/edit\`.

Loaders call \`api().api.${names.pluralCamel}.*\` (Eden). Do not import the model from a page.
`
			: `
Run \`typeway generate resource ${names.raw}\` to add the five-action JSON API and pages.
`;
	return `# ${names.pluralPascal}

Generated by \`typeway generate ${kind} ${names.raw}\`.

- Table: \`${names.table}\` (\`db/schema/${names.pluralKebab}.ts\`)
- Model: \`${names.singularPascal}\` (\`app/models/${names.singularKebab}.ts\`)
- Schema: \`app/schemas/${names.singularKebab}.ts\`
- Factory: \`${names.factory}\`

Columns: ${cols}
${http}`;
}
