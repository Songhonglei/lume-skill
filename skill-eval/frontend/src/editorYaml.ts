import { isMap, parseDocument } from 'yaml'

export const mapping = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}

export function formDocument(content: string) {
  const document = parseDocument(content)
  try {
    const value = document.toJS({ maxAliasCount: 50 })
    return { value: mapping(value), editable: !document.errors.length && isMap(document.contents) }
  } catch {
    return { value: {}, editable: false }
  }
}

export function canEditCase(entry: ReturnType<typeof formDocument>, item: ReturnType<typeof formDocument>) {
  if (!entry.editable || !item.editable) return false
  const objectField = (value: Record<string, any>, key: string) => !(key in value) || value[key] === mapping(value[key])
  if (!['cases', 'judge'].every(key => objectField(entry.value, key)) ||
      !['input', 'expect', 'judge'].every(key => objectField(item.value, key))) return false
  const judge = { ...mapping(entry.value.judge), ...mapping(item.value.judge) }
  return ['success', 'failure'].every(key => !(key in judge) ||
    (Array.isArray(judge[key]) && judge[key].every((rule: unknown) => rule === mapping(rule))))
}
