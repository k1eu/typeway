import { createServerFn } from '@tanstack/react-start'
import { Note } from '../../app/models/note'

export const createNote = createServerFn({ method: 'POST' })
  .validator((input: { body: string }) => {
    const body = input?.body?.trim()
    if (!body) throw new Error('body is required')
    return { body }
  })
  .handler(async ({ data }) => {
    return Note.createWithAudit(data.body)
  })
