import type { EditorFile, Files } from './types.ts'

export async function browserFile(file: File): Promise<EditorFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    // Keep a leading BOM so exporting an unedited attachment preserves its bytes.
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (content.includes('\0')) throw new Error('Binary content')
    return { encoding: 'utf-8', content, mode: 0o644 }
  } catch {
    const chunks: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
    }
    return { encoding: 'base64', content: btoa(chunks.join('')), mode: 0o644 }
  }
}
export function conflictingAttachmentNames(selected: Pick<File, 'name'>[], existing: Files): string[] {
  const seen = new Set(Object.keys(existing))
  const conflicts = new Set<string>()
  for (const file of selected) {
    const path = `evals/fixtures/${file.name}`
    if (seen.has(path)) conflicts.add(file.name)
    seen.add(path)
  }
  return [...conflicts]
}
