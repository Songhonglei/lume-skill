import { useEffect, useId, useRef, useState } from 'react'
import type { Skill } from './types'

export function SkillSearch({ skills, value, onChange }: { skills: Skill[]; value: string; onChange: (id: string) => void }) {
  const selected = skills.find(skill => skill.id === value)
  const [query, setQuery] = useState(selected?.name || '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => { if (selected) setQuery(selected.name) }, [selected?.id, selected?.name])
  const matches = skills.filter(skill => `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const visible = matches.slice(0, 30)
  const choose = (skill: Skill) => { onChange(skill.id); setQuery(skill.name); setOpen(false); input.current?.focus() }
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])
  return <div className="skill-search"><label htmlFor={id}>所属 Skill</label><div className="skill-search-input"><input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${id}-${active}` : undefined}
    autoComplete="off" placeholder="输入 Skill 名称或描述" value={query} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={event => { setQuery(event.target.value); onChange(''); setActive(0); setOpen(true) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
      if (event.key === 'Enter' && open) { event.preventDefault(); if (visible[active]) choose(visible[active]) }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
    }} />{value && <button type="button" className="close" aria-label="清除所选 Skill" onClick={() => { onChange(''); setQuery(''); setActive(0); input.current?.focus() }}>×</button>}</div>
    {open && <div className="skill-search-results" ref={list} role="listbox" id={`${id}-results`} aria-label="匹配的 Skills">{visible.length ? visible.map((skill, index) => <div role="option" key={skill.id} id={`${id}-${index}`} aria-selected={index === active} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(skill)}><strong>{skill.name}</strong><small>{skill.description || '暂无描述'}</small></div>) : <p className="padded muted">没有匹配的 Skill，换个关键词试试。</p>}{matches.length > visible.length && <p className="search-limit">还有 {matches.length - visible.length} 个匹配，继续输入可缩小范围。</p>}</div>}
    <small className="muted">{selected ? `已选择 ${selected.name}` : '输入名称，用方向键和 Enter 选择。'}</small>
  </div>
}
