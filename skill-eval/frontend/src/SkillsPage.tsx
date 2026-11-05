import { Pagination, usePagination } from './Pagination'
import { routeHash } from './workspaceRoute'
import { ChoiceSelect } from './ChoiceSelect'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api, message } from './api'
import { Badge, Button, Empty, Icon, Dialog, useData, Loading, LoadError } from './ui'
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
  const viewSkill = (id: string) => { setSelected(id); setSuiteId('') }
  const zip = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement>(null)
  useEffect(() => { if (common.selection.skillId) setSelected(common.selection.skillId) }, [common.selection.skillId])
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
      common.notify(result.deduplicated ? '版本已存在，已选中。' : result.imported_draft ? 'Skill 已保存，随附案例已加入草稿。' : 'Skill 已保存。')
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail as { matches?: { id: string; name: string }[] } : null
      if (detail?.matches?.length) { setCollision({ upload: value, matches: detail.matches }); setCollisionTarget(detail.matches[0].id) }
      else common.notify(message(error), true)
    } finally { setBusy(false); if (zip.current) zip.current.value = ''; if (directory.current) directory.current.value = '' }
  }
  const begin = (skill: Skill) => {
    const selectedVersion = skill.id === selected && chosen ? chosen : { id: skill.latest_version_id, revision: skill.latest_revision }
    if (!skill.active_version_id && (Number(skill.set_count) || Number(skill.draft_count))) {
      window.open(routeHash('sets', { setId: skill.default_set_id }), '_blank', 'noopener,noreferrer'); return
    }
    setStart({ skill, versionId: selectedVersion.id, revision: selectedVersion.revision, kind: skill.active_version_id ? 'evaluate' : 'generate' })
  }
  const visible = common.skills.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()))
  const paging = usePagination(common.skillsLoading ? undefined : visible.length)
  const { page: currentPage, setPage, pageSize } = paging
  const ready = common.workers.some(worker => worker.online && !worker.revoked && worker.capabilities.login_configured && worker.capabilities.connection_fingerprint === common.settings?.model?.connection_fingerprint)
  return <><div className="page-heading"><div><h1>Skills</h1></div><div className="actions"><Button disabled={busy} onClick={() => { setUploadTarget(undefined); directory.current?.click() }}>上传目录</Button><Button variant="primary" busy={busy} onClick={() => { setUploadTarget(undefined); zip.current?.click() }}><Icon name="upload" />上传 Skill</Button></div></div>
    <input className="hidden" type="file" accept=".zip" ref={zip} onChange={event => { if (event.target.files?.length) void upload({ files: Array.from(event.target.files), directory: false, skillId: uploadTarget }) }} />
    <input className="hidden" type="file" multiple ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={event => { if (event.target.files?.length) void upload({ files: Array.from(event.target.files), directory: true, skillId: uploadTarget }) }} />
    <div className="workspace-summary" aria-label="资源概况"><div><span>本地 Skills</span><strong>{common.skillsLoading || (common.skillsError && !common.skills.length) ? '—' : common.skills.length}</strong></div><div><span>已备好案例</span><strong>{common.skillsLoading || (common.skillsError && !common.skills.length) ? '—' : common.skills.filter(item => item.active_version_id).length}<small> 个 Skill</small></strong></div><div><span>待处理草稿</span><strong>{common.skillsLoading || (common.skillsError && !common.skills.length) ? '—' : common.skills.reduce((sum, item) => sum + Number(item.draft_count || 0), 0)}<small> 份</small></strong></div></div>
    <div className={`execution-strip ${ready ? '' : 'waiting'}`}><div><span className={`signal ${ready ? 'online' : ''}`} /><strong>{common.settingsLoading || common.workersLoading ? '正在检查执行环境…' : common.executionError ? '执行状态暂时无法确认' : ready ? 'Worker 在线' : !common.settings?.model ? '尚未配置模型' : 'Worker 未就绪，可先排队'}</strong><small>{common.settings?.model ? `${common.settings.model.name} · 在线不代表实测通过` : '可上传 Skill、维护案例'}</small></div><div className="inline"><span className="subtle-chip">标准评测</span><button className="text-button" onClick={() => common.navigate('settings')}>配置</button></div></div>
    <section className="panel library-panel"><div className="panel-head"><div className="inline"><h2>Skill 列表</h2><span className="count">{common.skills.length}</span></div><input className="search" aria-label="搜索 Skill" placeholder="搜索名称或描述" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></div>
      {common.skillsLoading ? <Loading label="正在读取 Skill 库…" /> : common.skillsError && !common.skills.length ? <LoadError message={common.skillsError} retry={common.refresh} /> : visible.length ? <div className="table-scroll"><table className="skills-table"><thead><tr><th>Skill</th><th>最新版本</th><th>启用案例</th><th>案例状态</th><th className="align-right">操作</th></tr></thead><tbody>{visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(skill => <tr key={skill.id} className={selected === skill.id ? 'selected' : ''} onClick={() => viewSkill(skill.id)}><td><button className="row-title" title={skill.name} onClick={() => viewSkill(skill.id)}>{skill.name}</button></td><td title={`修订 ${skill.latest_revision}`}>{skill.declared_version || `修订 ${skill.latest_revision}`}</td><td>{skill.active_version_id ? skill.active_validation?.cases?.length || 0 : '—'}</td><td><Badge value={skill.active_version_id ? 'ENABLED' : Number(skill.set_count) ? 'DRAFT' : 'NOT_PREPARED'} /></td><td className="align-right"><Button variant="link" aria-label={`${skill.name} 详情`} onClick={event => { event.stopPropagation(); viewSkill(skill.id) }}>详情</Button>{skill.default_set_id && skill.active_version_id && <a className="text-link" target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId: skill.default_set_id })} onClick={event => event.stopPropagation()}>案例</a>}<Button variant="link" onClick={event => { event.stopPropagation(); begin(skill) }}>{skill.active_version_id ? '评测' : Number(skill.set_count) ? '维护' : '准备案例'}</Button></td></tr>)}</tbody></table></div> : <Empty title={query ? '没有找到匹配的 Skill' : '添加第一个 Skill'} description={query ? '换个关键词试试。' : '上传包含 SKILL.md 的 ZIP 或目录，也可以先体验合成示例。'}>{query ? <Button variant="link" onClick={() => setQuery('')}>清除搜索</Button> : <Button busy={busy} onClick={async () => {
        try { const response = await fetch('/api/examples/label-text.zip'); if (!response.ok) throw new Error('示例暂时无法读取'); await upload({ files: [new File([await response.blob()], 'label-text.zip')], directory: false }) } catch (error) { common.notify(message(error), true) }
      }}>添加示例</Button>}</Empty>}
      <Pagination label="Skills 分页" total={common.skillsLoading ? undefined : visible.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={paging.setPageSize} disabled={common.skillsLoading} />
    </section>
    {current && <Dialog drawer="regular" title="Skill 详情" onClose={() => setSelected('')}><section className="skill-detail"><div className="panel-head"><div><h2>{current.name}</h2>{current.description && <p className="muted wrap-text">{current.description}</p>}</div><Button variant="link" onClick={() => { setUploadTarget(current.id); zip.current?.click() }}>新增版本</Button></div>
      {detail.loading ? <Loading label="正在读取版本与评测集…" /> : detail.error ? <LoadError message={detail.error} retry={common.refresh} /> : <div className="skill-detail-grid"><div><div className="field"><span>Skill 版本</span><ChoiceSelect aria-label="Skill 版本" value={versionId} onValueChange={value => setVersionId(value)}>{versions.map(version => <option value={version.id} key={version.id}>{version.declared_version || '本地版本'} · 修订 {version.revision}</option>)}</ChoiceSelect></div>{chosen && <a className="text-link" href={`/api/skill-versions/${chosen.id}/download`}>下载</a>}</div>
        <div className="suite-summary"><div className="field"><span>本次评测集</span>{suites.length ? <ChoiceSelect aria-label="本次评测集" value={suite?.id || ''} onValueChange={value => setSuiteId(value)}>{suites.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === current.default_set_id ? ' · 默认' : ''}{item.active_version_id ? '' : ' · 待启用'}</option>)}</ChoiceSelect> : <strong>尚未准备案例</strong>}</div><p className="muted">{selectedSkill?.active_version_id ? `${selectedSkill?.active_validation?.cases?.length || 0} 个启用案例，逐一执行。` : Number(current.set_count) ? '已有草稿或保存版本，启用后即可评测。' : '先生成案例草稿，或上传已有评测集。'}</p>{suite?.id === current.default_set_id && current.active_source_skill_version_id && chosen && current.active_source_skill_version_id !== chosen.id && <p className="small-note">当前案例基于较早的 Skill 版本，可以继续复用。</p>}</div>
        <div className="detail-actions"><Button variant="primary" disabled={!chosen || detail.loading} onClick={() => begin(selectedSkill || current)}><Icon name="play" />{selectedSkill?.active_version_id ? '开始评测' : Number(current.set_count) ? '维护案例' : '准备案例'}</Button>{selectedSkill?.active_version_id && <a className="text-link" target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId: suite?.id || current.default_set_id })}>案例</a>}</div></div>}
    </section></Dialog>}
    {collision && <Dialog title="发现同名 Skill" onClose={() => setCollision(null)}><p>为已有 Skill 新增版本，或创建独立 Skill。</p><div className="field"><span>已有 Skill</span><ChoiceSelect aria-label="已有 Skill" value={collisionTarget} onValueChange={value => setCollisionTarget(value)}>{collision.matches.map(item => <option value={item.id} key={item.id}>{item.name} · {item.id.slice(0, 8)}</option>)}</ChoiceSelect></div><div className="dialog-actions"><Button busy={busy} onClick={() => upload({ ...collision.upload, skillId: undefined }, true)}>独立创建</Button><Button variant="primary" busy={busy} onClick={() => upload({ ...collision.upload, skillId: collisionTarget })}>新增版本</Button></div></Dialog>}
    {start && <TaskDialog common={common} {...start} onClose={() => setStart(null)} onImport={start.kind === 'generate' ? () => { setStart(null); common.navigate('sets', { skillId: start.skill.id, action: 'import' }) } : undefined} />}
  </>
}
