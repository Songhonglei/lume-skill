import type { TaskDetail } from './types'

type Tone = 'good' | 'bad' | 'warm' | 'info' | 'muted'
const states: Record<string, [string, Tone]> = {
  QUEUED: ['等待执行', 'warm'], RUNNING: ['执行中', 'info'], ACTIVE: ['执行中', 'info'],
  CANCEL_REQUESTED: ['停止中', 'warm'], CANCELLED: ['已停止', 'muted'],
  SUCCEEDED: ['已完成', 'good'], COMPLETED: ['已结束', 'muted'],
  INTERRUPTED: ['已中断', 'bad'], EXPIRED: ['已中断', 'bad'],
  PASSED: ['全部通过', 'good'], FAILED: ['未通过', 'bad'], INCOMPLETE: ['未完成', 'warm'],
  DRAFT: ['草稿', 'warm'], SAVED: ['已保存', 'muted'], ENABLED: ['已启用', 'good'], ARCHIVED: ['已归档', 'muted'],
  ONLINE: ['在线', 'good'], OFFLINE: ['离线', 'muted'], REVOKED: ['已撤销', 'muted'],
  NOT_PREPARED: ['待准备', 'muted'], PENDING: ['未开始', 'muted'], WAITING_RESULT: ['等待结果', 'info'],
  PROBE_PENDING: ['检查中', 'info'], PROBE_PASSED: ['检查通过', 'good'], PROBE_FAILED: ['检查失败', 'bad'], UNCHECKED: ['未检查', 'muted'],
}
export function statusOf(value?: string, context?: 'execution') {
  const [label, tone] = states[value || ''] || [value || '—', 'muted']
  return { label: value === 'FAILED' && context === 'execution' ? '执行失败' : label, tone }
}
export const taskStates = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED', 'CANCEL_REQUESTED', 'CANCELLED']
export const isRunning = (state: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(state)

// After a retry the current attempt is deliberately empty. Never substitute its predecessor.
export function taskView(task: TaskDetail, attemptId: string) {
  const selected = task.attempts.find(item => item.id === attemptId)
  const current = !selected || selected.id === task.current_attempt_id
  const attempt = selected || task.attempts.find(item => item.id === task.current_attempt_id)
  const state = current ? task.state : attempt?.state || task.state
  const summary = attempt?.summary || (current ? task.summary : undefined)
  return { attempt, current, state, summary, artifacts: task.artifacts.filter(item => item.attempt_id === attempt?.id) }
}
export function missingResult(state: string) {
  if (state === 'QUEUED') return { status: 'PENDING', text: '等待执行。' }
  if (state === 'CANCEL_REQUESTED') return { status: 'CANCEL_REQUESTED', text: '正在停止，已收到的结果会保留。' }
  if (isRunning(state)) return { status: 'WAITING_RESULT', text: '等待结果。' }
  if (state === 'CANCELLED') return { status: 'INCOMPLETE', text: '任务已停止，未收到完整结果。' }
  return { status: 'INCOMPLETE', text: '本次执行已结束，未收到完整结果。' }
}
export function cancelNotice(state: string) {
  if (state === 'CANCELLED') return '任务已停止。'
  if (state === 'CANCEL_REQUESTED') return '正在停止，已有记录会保留。'
  return `任务${statusOf(state, 'execution').label}。`
}
