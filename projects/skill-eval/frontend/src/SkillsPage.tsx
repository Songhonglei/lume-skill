import { useEffect, useRef, useState } from 'react'
import { ApiError, api, message } from './api'
import { Badge, Button, Empty, Icon, Dialog, useData } from './ui'
import { TaskDialog } from './TaskDialog'
import type { Common, Skill, SkillDetail, SkillVersion } from './types'

type Upload = { files: File[]; directory: boolean; skillId?: string }
type UploadResult = { skill: Skill; version: SkillVersion; deduplicated: boolean; imported_draft?: unknown }

export function SkillsPage(common: Common) {
  const [selected, setSelected] = useState(common.selection.skillId || '')
  const [suiteId, setSuiteId] = useState('')
  const [versionId, setVersionId] = useState(common.selection.versionId || '')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<string | undefined>()
  const [collision, setCollision] = useState<{ upload: Upload; matches: { id: string; name: string }[] } | null>(null)
  const [collisionTarget, setCollisionTarget] = useState('')
  const [start, setStart] = useState<{ skill: Skill; versionId: string; revision: number; kind: 'evaluate' | 'generate' } | null>(null)
  const zip = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement>(null)
  useEffect(() => { if (common.selection.skillId) setSelected(common.selection.skillId) }, [common.selection.skillId])
  useEffect(() => { if (!selected && common.skills.length) setSelected(common.skills[0].id) }, [common.skills, selected])
  const detail = useData<SkillDetail | undefined>(selected ? `/api/skills/${selected}` : null, undefined, common.revision)
  const current = common.skills.find(skill => skill.id === selected)
  const versions = detail.data?.id === selected ? detail.data.versions : []
  useEffect(() => {
    if (!versions.some(version => version.id === versionId)) setVersionId(versions.find(version => version.id === common.selection.versionId)?.id || versions[0]?.id || '')
  }, [detail.data, selected, common.selection.versionId, versionId])
  const chosen = versions.find(version => version.id === versionId)
  const suites = detail.data?.id === selected ? detail.data.sets : []
  const suite = suites.find(item => item.id === suiteId) || suites.find(item => item.id === current?.default_set_id)
  const selectedSkill: Skill | undefined = current && suite ? { ...current, default_set_id: suite.id, default_set_name: suite.name, active_version_id: suite.active_version_id, active_validation: suite.active_validation } : current

  const upload = async (value: Upload, independent = false) => {
    setBusy(true)
    const form = new FormData()
    if (value.directory) {
      value.files.forEach(file => form.append('files', file))
      form.append('paths', JSON.stringify(value.files.map(file => file.webkitRelativePath || file.name)))
    } else form.append('file', value.files[0])
    if (value.skillId) form.append('skill_id', value.skillId)
    if (independent) form.append('independent', 'true')
    try {
      const result = await api<UploadResult>(`/api/skills/import${value.directory ? '-directory' : ''}`, { method: 'POST', body: form })
      setSelected(result.skill.id); setVersionId(result.version.id); setCollision(null); common.refresh()
      common.notify(result.deduplicated ? '这个版本已在本地库中，已为你选中。' : result.imported_draft ? 'Skill 已保存，随附案例已加入草稿。' : 'Skill 已保存。')
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail as { matches?: { id: string; name: string }[] } : null
      if (detail?.matches?.length) { setCollision({ upload: value, matches: detail.matches }); setCollisionTarget(detail.matches[0].id) }
      else common.notify(message(error), true)
    } finally { setBusy(false); if (zip.current) zip.current.value = ''; if (directory.current) directory.current.value = '' }
  }
  const begin = (skill: Skill) => {
    const selectedVersion = skill.id === selected && chosen ? chosen : { id: skill.latest_version_id, revision: skill.latest_revision }
    if (!skill.active_version_id && (Number(skill.set_count) || Number(skill.draft_count))) {
      common.navigate('sets', { skillId: skill.id, setId: skill.default_set_id }); return
    }
    setStart({ skill, versionId: selectedVersion.id, revision: selectedVersion.revision, kind: skill.active_version_id ? 'evaluate' : 'generate' })
  }
  const visible = common.skills.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()))
  const ready = common.workers.some(worker => worker.online && !worker.revoked && worker.capabilities.login_configured && worker.capabilities.connection_fingerprint === common.settings?.model?.connection_fingerprint)
  return <><div className="page-heading"><div><h1>Skills</h1><p>上传 Skill，维护案例，完成真实评测。</p></div><div className="actions"><Button disabled={busy} onClick={() => { setUploadTarget(undefined); directory.current?.click() }}>上传目录</Button><Button variant="primary" busy={busy} onClick={() => { setUploadTarget(undefined); zip.current?.click() }}><Icon name="upload" />上传 Skill</Button></div></div>
    <input className="hidden" type="file" accept=".zip" ref={zip} onChange={event => { if (event.target.files?.length) void upload({ files: Array.from(event.target.files), directory: false, skillId: uploadTarget }) }} />
    <input className="hidden" type="file" multiple ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={event => { if (event.target.files?.length) void upload({ files: Array.from(event.target.files), directory: true, skillId: uploadTarget }) }} />
    <div className={`execution-strip ${ready ? '' : 'waiting'}`}><div><span className={`signal ${ready ? 'online' : ''}`} /><strong>{ready ? '执行环境已就绪' : !common.settings?.model ? '先连接 Worker 和模型' : '等待可用 Worker'}</strong><small>{common.settings?.model?.name || '资源和案例管理可先使用'}</small></div><div className="inline"><span className="subtle-chip">标准评测</span><span className="subtle-chip">全部案例</span><button className="text-button" onClick={() => common.navigate('settings')}>{ready ? '查看配置' : '去配置'} →</button></div></div>
    <section className="panel library-panel"><div className="panel-head"><div className="inline"><h2>本地 Skill 库</h2><span className="count">{common.skills.length}</span></div><input className="search" aria-label="搜索 Skill" placeholder="搜索名称或描述" value={query} onChange={event => setQuery(event.target.value)} /></div>
      {visible.length ? <div className="table-scroll"><table><thead><tr><th>Skill</th><th>最新版本</th><th>评测案例</th><th className="align-right">操作</th></tr></thead><tbody>{visible.map(skill => <tr key={skill.id} className={selected === skill.id ? 'selected' : ''} onClick={() => setSelected(skill.id)}><td><button className="row-title" onClick={() => setSelected(skill.id)}>{skill.name}</button><small className="description">{skill.description || '暂无描述'}</small></td><td><strong>{skill.declared_version || `修订 ${skill.latest_revision}`}</strong><small className="muted">修订 {skill.latest_revision}</small></td><td>{skill.active_version_id ? <><span>{skill.active_validation?.cases?.length || 0} 个案例</span><small className="muted">{skill.default_set_name}</small></> : Number(skill.set_count) ? <Badge value="DRAFT">待启用 · {skill.draft_count || 0} 个草稿</Badge> : <span className="muted">尚无案例</span>}</td><td className="align-right"><Button variant="small" onClick={event => { event.stopPropagation(); begin(skill) }}>{skill.active_version_id ? '开始评测' : Number(skill.set_count) ? '处理案例' : '准备案例'}</Button></td></tr>)}</tbody></table></div> : <Empty title={query ? '没有找到匹配的 Skill' : '添加第一个 Skill'} description={query ? '换个关键词试试。' : '上传包含 SKILL.md 的 ZIP 或目录，也可以先体验合成示例。'}>{!query && <Button busy={busy} onClick={async () => {
        try { const response = await fetch('/api/examples/label-text.zip'); if (!response.ok) throw new Error('示例暂时无法读取'); await upload({ files: [new File([await response.blob()], 'label-text.zip')], directory: false }) } catch (error) { common.notify(message(error), true) }
      }}>添加合成示例</Button>}</Empty>}
    </section>
    {current && <section className="panel skill-detail"><div className="panel-head"><div><h2>{current.name}</h2><p className="muted">选择要评测的 Skill 版本</p></div><Button onClick={() => { setUploadTarget(current.id); zip.current?.click() }}>新增版本</Button></div>
      <div className="skill-detail-grid"><div><label className="field"><span>Skill 版本</span><select value={versionId} onChange={event => setVersionId(event.target.value)}>{versions.map(version => <option value={version.id} key={version.id}>{version.declared_version || '本地版本'} · 修订 {version.revision}</option>)}</select></label>{chosen && <a className="text-link" href={`/api/skill-versions/${chosen.id}/download`}>下载这个版本</a>}</div>
        <div className="suite-summary"><label className="field"><span>本次评测集</span>{suites.length ? <select aria-label="本次评测集" value={suite?.id || ''} onChange={event => setSuiteId(event.target.value)}>{suites.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === current.default_set_id ? ' · 默认' : ''}{item.active_version_id ? '' : ' · 待启用'}</option>)}</select> : <strong>尚未准备案例</strong>}</label><p className="muted">{current.active_version_id ? `${selectedSkill?.active_validation?.cases?.length || 0} 个启用案例，逐一执行。` : Number(current.set_count) ? '已有草稿或保存版本，启用后即可评测。' : '先生成案例草稿，或上传已有评测集。'}</p>{current.active_source_skill_version_id && chosen && current.active_source_skill_version_id !== chosen.id && <p className="small-note">当前案例基于较早的 Skill 版本，可以继续复用。</p>}</div>
        <div className="detail-actions"><Button variant="primary" disabled={!chosen} onClick={() => begin(selectedSkill || current)}><Icon name="play" />{current.active_version_id ? '开始评测' : Number(current.set_count) ? '处理已有案例' : '准备评测案例'}</Button><Button onClick={() => common.navigate('sets', { skillId: current.id, setId: current.default_set_id })}>管理案例</Button></div></div>
    </section>}
    {collision && <Dialog title="发现同名 Skill" onClose={() => setCollision(null)}><p>为已有 Skill 新增版本，或创建独立 Skill。</p><label className="field"><span>已有 Skill</span><select value={collisionTarget} onChange={event => setCollisionTarget(event.target.value)}>{collision.matches.map(item => <option value={item.id} key={item.id}>{item.name} · {item.id.slice(0, 8)}</option>)}</select></label><div className="dialog-actions"><Button busy={busy} onClick={() => upload({ ...collision.upload, skillId: undefined }, true)}>独立创建</Button><Button variant="primary" busy={busy} onClick={() => upload({ ...collision.upload, skillId: collisionTarget })}>新增版本</Button></div></Dialog>}
    {start && <TaskDialog common={common} {...start} onClose={() => setStart(null)} onImport={start.kind === 'generate' ? () => { setStart(null); common.navigate('sets', { skillId: start.skill.id, action: 'import' }) } : undefined} />}
  </>
}
