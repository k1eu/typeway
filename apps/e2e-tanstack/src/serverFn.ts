import { createServerFn } from '@tanstack/react-start'

export type EchoInput = { name: string; count: number }

/**
 * Feature: JSON server function RPC.
 * POST with a seroval-encoded payload; echoes the validated input back.
 */
export const echoFn = createServerFn({ method: 'POST' })
  .validator((input: EchoInput) => {
    if (typeof input?.name !== 'string') {
      throw new Error('name must be a string')
    }
    if (typeof input.count !== 'number') {
      throw new Error('count must be a number')
    }
    return input
  })
  .handler(({ data }) => ({
    echoed: data.name,
    doubled: data.count * 2,
    marker: 'ECHO_OK',
  }))

/**
 * Feature: multipart form upload.
 * Reads a text field plus an uploaded file and reports the file's byte length.
 * Guards raw request-body streaming through the bridge — this fails if the
 * body is eagerly parsed (e.g. as JSON) before middleware sees it.
 */
export const uploadFn = createServerFn({ method: 'POST' })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error('expected FormData')
    return data
  })
  .handler(async ({ data }) => {
    const label = data.get('label')
    const file = data.get('file')
    const bytes = file instanceof File ? (await file.arrayBuffer()).byteLength : -1

    return {
      label: typeof label === 'string' ? label : null,
      fileName: file instanceof File ? file.name : null,
      byteLength: bytes,
      marker: 'UPLOAD_OK',
    }
  })
