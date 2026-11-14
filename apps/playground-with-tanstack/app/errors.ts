import { HTTPError } from "elysia"

HTTPError.typeBase = "https://typeway.dev/errors"

export class NoteNotFound extends HTTPError.id("note.not_found", 404) {
  constructor(id: number) {
    super(`Note ${id} was not found`)
  }
}
