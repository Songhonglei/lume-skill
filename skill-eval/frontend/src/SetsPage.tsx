import { Pagination, usePagination } from './Pagination'
import { routeHash } from './workspaceRoute'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { message, post } from './api'
import { Badge, Button, date, Dialog, Empty, Icon, useData, Loading, LoadError } from './ui'
import { CaseEditor } from './CaseEditor'
import { TaskDialog } from './TaskDialog'
import { SetImportDialog } from './SetImportDialog'
import { SkillSearch } from './SkillSearch'
import { setRows } from './setDirectory'
import type { Common, EditorView, EvalSet, Files, SetDetail, SetVersion, Skill, Selection } from './types'

export function SetsPage(common: Common) {
  const setId = common.selection.setId || ''
  const historyView = common.selection.setsView === 'history'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [createSkillId, setCreateSkillId] = useState('')
  const [importSkill, setImportSkill] = useState<Skill | null>(null)
  const [generateSkill, setGenerateSkill] = useState<Skill | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [defaultBusy, setDefaultBusy] = useState(false)
  const savedView = useRef<{ id: string; view?: EditorView; activationError?: string } | null>(null)
  const libraryScroll = useRef(0)
  const handledImport = useRef<Selection | null>(null)
  const lastVersion = useRef(new Map<string, string>())
  const search = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const allSets = useData<EvalSet[]>('/api/sets', [], common.revision)
  const detail = useData<SetDetail | undefined>(setId ? `/api/sets/${setId}` : null, undefined, common.revision)
  const item = detail.data?.id === setId ? detail.data : undefined
  const skill = common.skills.find(value => value.id === item?.skill_id)
  const versionMismatch = !!item && !!common.selection.setVersionId && !item.versions.some(value => value.id === common.selection.setVersionId)
  const versionId = common.selection.setVersionId || item?.versions.find(value => value.kind === 'DRAFT' && !value.archived)?.id || item?.active_version_id || item?.versions[0]?.id || ''
  const version = useData<(SetVersion & { files: Files }) | undefined>(item && !historyView && !versionMismatch && versionId ? `/api/set-versions/${versionId}` : null, undefined, common.revision)
  const updateEditorBusy = useCallback((value: boolean) => setEditorBusy(value), [])
  const updateImportBusy = useCallback((value: boolean) => setImportBusy(value), [])
  const updateDirty = useCallback((value: boolean) => common.setDirty(value), [common.setDirty])
  useEffect(() => { common.setEditingBusy(editorBusy || importBusy); return () => common.setEditingBusy(false) }, [editorBusy, importBusy, common.setEditingBusy])
  useEffect(() => {
    if (common.selection.action !== 'import' || handledImport.current === common.selection) return
    const target = common.skills.find(value => value.id === common.selection.skillId)
    if (target) { handledImport.current = common.selection; setImportSkill(target) }
  }, [common.selection, common.skills])
  useLayoutEffect(() => {
    if (!setId) { window.scrollTo({ top: libraryScroll.current, behavior: 'instant' }); search.current?.focus({ preventScroll: true }) }
    else { window.scrollTo({ top: 0, behavior: 'instant' }); heading.current?.focus({ preventScroll: true }) }
  }, [setId, historyView])
  useEffect(() => { if (setId && !historyView && version.data?.id === versionId) lastVersion.current.set(setId, versionId) }, [setId, historyView, version.data, versionId])
  const rows = setRows(common.skills, allSets.data, query, status)
  const paging = usePagination(common.skillsLoading || allSets.loading ? undefined : rows.length)
  const { page: currentPage, setPage, pageSize } = paging
  const visible = rows.slice(paging.start, paging.end)
  const historyPaging = usePagination(item?.versions.length)
  useEffect(() => { historyPaging.setPage(0) }, [setId])
  const openSet = (id: string, nextVersion?: string) => {
    if (!setId) libraryScroll.current = window.scrollY
    savedView.current = null
    common.navigate('sets', { setId: id, setVersionId: nextVersion })
  }
  const openVersion = (id: string, view?: EditorView, activationError?: string) => { savedView.current = { id, view, activationError }; common.navigate('sets', { setId, setVersionId: id }, { saved: true }) }
  const create = (id = '') => { setCreateSkillId(id); setCreating(true) }
  const selectedCreateSkill = common.skills.find(value => value.id === createSkillId)
  const listLoading = common.skillsLoading || allSets.loading
  const listError = common.skillsError || allSets.error
  return <>
    {!setId ? <>
      <div className="page-heading"><div><h1>评测集管理</h1></div><Button variant="primary" disabled={common.skillsLoading || !common.skills.length} onClick={() => create(common.selection.skillId)}><Icon name="plus" />添加评测集</Button></div>
      <section className="set-directory panel" aria-label="评测集目录">
        <div className="directory-search"><label htmlFor="set-library-search">查找 Skill 或评测集</label><div className="directory-search-box"><Icon name="search" /><input ref={search} id="set-library-search" type="search" value={query} maxLength={200} placeholder="搜索 Skill 名称、描述或评测集名称" onChange={event => { setQuery(event.target.value); setPage(0) }} />{query && <button className="close" aria-label="清除搜索" onClick={() => { setQuery(''); setPage(0); search.current?.focus() }}>×</button>}</div>
          <div className="directory-filter-row"><div className="filter-chips" aria-label="评测集状态">{[['all', '全部'], ['pending', '待准备'], ['drafts', '有草稿'], ['active', '已启用']].map(([value, label]) => <button key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setPage(0) }}>{label}</button>)}</div><span className="muted directory-count" role="status">{listLoading ? '正在读取…' : listError ? `上次读取 · ${rows.length} 条结果` : `${rows.length} 条结果 · ${new Set(rows.map(row => row.skill.id)).size} 个 Skill`}</span></div>
        </div>
        {listError && visible.length > 0 && <div className="notice error" role="alert"><span>当前保留上次读取的目录。{listError}</span><Button variant="link" onClick={common.refresh}>重试</Button></div>}
        {listLoading ? <Loading label="正在读取评测集目录…" /> : listError && !visible.length ? <LoadError message={listError} retry={common.refresh} /> : visible.length ? <div className="table-scroll"><table className="directory-table"><thead><tr><th>Skill</th><th>评测集</th><th>启用版本</th><th>草稿数</th><th /></tr></thead><tbody>{visible.map(({ key, skill: rowSkill, suite }) => <tr key={key}><td><strong title={rowSkill.name}>{rowSkill.name}</strong></td><td>{suite ? <a className="row-title" title={suite.name} target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId: suite.id })}>{suite.name}</a> : <span className="muted">尚未创建评测集</span>}</td><td>{suite?.active_version_id ? <span>版本 {suite.active_revision}</span> : <span className="muted">未启用</span>}</td><td><span className="draft-count">{Number(suite?.draft_count || 0)}</span></td><td className="align-right"><>{suite ? <a className="text-link" target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId: suite.id })} aria-label={`${rowSkill.name} · ${suite.name} 详情`}>详情</a> : <Button variant="link" onClick={() => create(rowSkill.id)} aria-label={`${rowSkill.name} 准备案例`}>准备案例</Button>}</></td></tr>)}</tbody></table></div> : <Empty title={query || status !== 'all' ? '没有匹配的评测集' : '先添加一个 Skill'} description={query || status !== 'all' ? '换个关键词，或清除筛选条件。' : '上传 Skill 后，就可以在这里准备案例。'}><Button variant="link" onClick={() => { if (query || status !== 'all') { setQuery(''); setStatus('all'); setPage(0) } else common.navigate('skills') }}>{query || status !== 'all' ? '清除筛选' : '添加 Skill'}</Button></Empty>}
        <Pagination label="评测集分页" total={listLoading ? undefined : rows.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={paging.setPageSize} disabled={listLoading} />
      </section>
    </> : <>
      <nav className="detail-breadcrumb" aria-label="评测集位置"><button onClick={() => common.navigate('sets')}>评测集管理</button><span aria-hidden="true">/</span><span>{item?.name || '评测集详情'}</span>{historyView && <><span aria-hidden="true">/</span><span>版本记录</span></>}</nav>
      <div className="page-heading set-detail-heading"><div><span className="eyebrow">{item?.skill_name || '读取中'}</span><h1 ref={heading} tabIndex={-1}>{historyView ? '版本记录' : item?.name || '评测集详情'}</h1></div><div className="actions wrap">{historyView ? <Button variant="link" onClick={() => openSet(setId, lastVersion.current.get(setId))}>返回案例</Button> : <Button variant="link" disabled={editorBusy} onClick={() => common.navigate('sets', { setId, setsView: 'history' })}>版本记录</Button>}{item && <button className="text-button" onClick={() => setShowInfo(true)}>信息</button>}</div></div>
      {detail.error && item && <div className="notice error" role="alert"><span>当前保留上次读取的详情。{detail.error}</span><Button variant="link" onClick={common.refresh}>重试</Button></div>}
      {version.error && version.data && <div className="notice error" role="alert"><span>案例暂时无法更新，当前内容已保留。{version.error}</span><Button variant="link" onClick={common.refresh}>重试</Button></div>}
      {detail.loading ? <section className="panel"><Loading label="正在读取评测集详情…" /></section> : detail.error && !item ? <section className="panel"><LoadError message={detail.error} retry={common.refresh} /><div className="padded"><Button variant="link" onClick={() => common.navigate('sets')}>返回目录</Button></div></section> : item && historyView ? <section className="panel"><div className="panel-head"><h2>版本列表</h2><span className="muted">{item.versions.length} 条</span></div><div className="table-scroll"><table className="versions-table"><thead><tr><th>版本</th><th>状态</th><th>案例</th><th>来源 Skill</th><th>创建时间</th><th /></tr></thead><tbody>{item.versions.slice(historyPaging.start, historyPaging.end).map(value => <tr key={value.id}><td><strong>{value.kind === 'DRAFT' ? '草稿' : '版本'} {value.revision}</strong></td><td>{value.id === item.active_version_id ? <Badge value="ENABLED" /> : value.archived ? <Badge value="ARCHIVED" /> : <Badge value={value.kind} />}</td><td>{value.validation.valid === false ? '待修复' : value.validation.cases?.length ?? '待校验'}</td><td className="muted">修订 {value.source_skill_revision}</td><td className="muted">{date(value.created_at)}</td><td className="align-right"><a className="text-link" target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId, setVersionId: value.id })}>{value.kind === 'DRAFT' && !value.archived ? '维护' : '查看'}</a></td></tr>)}</tbody></table></div><Pagination label="版本分页" total={item.versions.length} page={historyPaging.page} pageSize={historyPaging.pageSize} onPage={historyPaging.setPage} onPageSize={historyPaging.setPageSize} /></section> : item && versionMismatch ? <section className="panel"><Empty title="这个版本不属于当前评测集" description="请从当前评测集的版本记录中选择。"><Button variant="link" onClick={() => common.navigate('sets', { setId, setsView: 'history' })}>版本记录</Button></Empty></section> : item && <section className="panel set-workspace focused-editor" aria-label="评测集详情">{version.data?.id === versionId && version.data.set_id === setId ? <CaseEditor key={versionId} version={version.data} common={common} onVersion={openVersion} initialView={savedView.current?.id === versionId ? savedView.current.view : undefined} initialActivationError={savedView.current?.id === versionId ? savedView.current.activationError : undefined} active={item.active_version_id === versionId} onBusy={updateEditorBusy} onDirty={updateDirty} /> : version.error ? <LoadError message={version.error} retry={common.refresh} /> : <Loading label="正在读取案例…" />}</section>}
    </>}
    {showInfo && item && <Dialog drawer="regular" title="评测集信息" onClose={() => setShowInfo(false)}><dl className="set-info-list"><dt>评测集</dt><dd>{item.name}</dd><dt>所属 Skill</dt><dd>{item.skill_name}</dd><dt>Skill 说明</dt><dd>{skill ? skill.description || '暂无说明' : '暂未读取'}</dd><dt>默认评测集</dt><dd>{skill ? skill.default_set_id === setId ? '是' : '否' : '暂未读取'}</dd><dt>启用版本</dt><dd>{item.active_version_id ? `版本 ${item.versions.find(value => value.id === item.active_version_id)?.revision}` : '尚未启用'}</dd><dt>启用案例数</dt><dd>{item.active_version_id ? item.versions.find(value => value.id === item.active_version_id)?.validation.cases?.length ?? '待校验' : '尚未启用'}</dd><dt>草稿数</dt><dd>{item.versions.filter(value => value.kind === 'DRAFT' && !value.archived).length}</dd></dl><div className="dialog-actions">{skill && skill.default_set_id !== setId && <Button variant="link" busy={defaultBusy} onClick={async () => { setDefaultBusy(true); try { await post(`/api/skills/${skill.id}/default-set`, { set_id: setId }); common.refresh(); common.notify('默认评测集已更新。') } catch (error) { common.notify(message(error), true) } finally { setDefaultBusy(false) } }}>设为默认</Button>}<Button variant="link" data-initial-focus="true" onClick={() => setShowInfo(false)}>关闭</Button></div></Dialog>}
    {creating && <Dialog title="添加评测集" onClose={() => setCreating(false)}><p className="muted">选择 Skill，导入案例或生成草稿。</p><SkillSearch skills={common.skills} value={createSkillId} onChange={setCreateSkillId} /><div className="create-set-methods"><Button variant="primary" disabled={!selectedCreateSkill} onClick={() => { setCreating(false); setImportSkill(selectedCreateSkill || null) }}><Icon name="upload" />导入案例</Button><Button disabled={!selectedCreateSkill} onClick={() => { setCreating(false); setGenerateSkill(selectedCreateSkill || null) }}>生成草稿</Button></div><p className="small-note">生成草稿会调用模型；导入不会。</p></Dialog>}
    {importSkill && <SetImportDialog common={common} skill={importSkill} sets={allSets.data.filter(value => value.skill_id === importSkill.id)} onClose={() => setImportSkill(null)} onBusy={updateImportBusy} onImported={(target, nextVersion) => { libraryScroll.current = window.scrollY; savedView.current = null; setImportSkill(null); common.navigate('sets', { setId: target, setVersionId: nextVersion }, { saved: true }) }} />}
    {generateSkill && <TaskDialog common={common} skill={generateSkill} versionId={generateSkill.latest_version_id} revision={generateSkill.latest_revision} kind="generate" generationSets={allSets.data.filter(value => value.skill_id === generateSkill.id)} onClose={() => setGenerateSkill(null)} />}
  </>
}
