import { afterEach, describe, expect, test } from "bun:test"
import { db as rootDb, resetNotesTable } from "../config/database"
import { getDb, runWithContext } from "./context"
import { Note } from "./models/note"
import { transaction } from "./transaction"

afterEach(() => {
  resetNotesTable()
})

describe("AsyncLocalStorage context", () => {
  test("getDb() returns the pool outside a request", () => {
    expect(getDb()).toBe(rootDb)
  })

  test("runWithContext swaps the active db handle", () => {
    const sentinel = {} as typeof rootDb
    runWithContext({ db: sentinel, txDepth: 0 }, () => {
      expect(getDb()).toBe(sentinel)
    })
    expect(getDb()).toBe(rootDb)
  })
})

describe("transaction()", () => {
  test("nested transaction() joins the outer tx — getDb() stays on tx inside", async () => {
    await transaction(async () => {
      const outerDb = getDb()
      await transaction(async () => {
        expect(getDb()).toBe(outerDb)
        Note.create("inside nested tx")
      })
      const rows = Note.all()
      expect(rows.some((row) => row.body === "inside nested tx")).toBe(true)
    })
  })

  test("createWithAudit persists through getDb() inside the tx", async () => {
    const note = await Note.createWithAudit("audited")
    expect(note.body).toBe("audited")
    expect(Note.all().some((row) => row.id === note.id)).toBe(true)
  })
})
