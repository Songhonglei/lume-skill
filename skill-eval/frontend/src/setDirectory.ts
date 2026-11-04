import type { EvalSet, Skill } from './types.ts'
export type SetRow = { key: string; skill: Skill; suite?: EvalSet }
export function setRows(skills: Skill[], sets: EvalSet[], query: string, status: string): SetRow[] {
  const bySkill = new Map<string, EvalSet[]>()
  for (const suite of sets) { const bucket = bySkill.get(suite.skill_id); if (bucket) bucket.push(suite); else bySkill.set(suite.skill_id, [suite]) }
  const term = query.trim().toLocaleLowerCase()
  return skills.flatMap(skill => {
    const suites = bySkill.get(skill.id)
    return (suites?.length ? suites : [undefined]).map(suite => ({ key: suite?.id || skill.id, skill, suite }))
  }).filter(({ skill, suite }) => `${skill.name} ${skill.description} ${suite?.name || ''}`.toLocaleLowerCase().includes(term) &&
    (status === 'all' || (status === 'pending' && !suite?.active_version_id) || (status === 'active' && !!suite?.active_version_id) || (status === 'drafts' && Number(suite?.draft_count) > 0)))
}
