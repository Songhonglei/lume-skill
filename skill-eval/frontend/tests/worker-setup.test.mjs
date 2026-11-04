import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { canConnectCenter, centerNotice, connectionPrompt, installationPrompt, localCenter } from '../src/workerSetup.ts'
const lock = JSON.parse(readFileSync(new URL('../../deploy/toolchain.json', import.meta.url)))
const versions = { codex: lock.codex.version, skill_up: lock.skill_up.version }
const blocks = text => [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1])
test('installation uses the real private installer and ships its evaluation assets without an enrollment secret', () => {
  const prompt = installationPrompt(versions)
  assert.equal(blocks(prompt).length, 1)
  const commands = blocks(prompt)[0]
  execFileSync('bash', ['-n'], { input: commands })
  assert.match(commands, /cd "\$LUMA_SOURCE_DIR\/lume-skill\/skill-eval"/)
  assert.match(commands, /python3 deploy\/install_worker.py --directory "\$LUMA_APP_DIR" --install-codex/)
  assert.match(commands, /start-worker" --help/)
  assert.match(prompt, new RegExp(versions.codex.replaceAll('.', '\\.')))
  assert.match(prompt, new RegExp(versions.skill_up.replaceAll('.', '\\.')))
  assert.match(prompt, /vendor\/skill-upper/)
  assert.doesNotMatch(prompt, /ose1\.|pip install --user|npm install -g|--dangerously-bypass/)
})
test('connection keeps the credential out of shell arguments and distinguishes same-host from remote setup', () => {
  const sample = 'ose1.synthetic-fixture-not-a-real-credential'
  for (const url of ['http://127.0.0.1:8765', 'http://localhost:8765', 'http://[::1]:8765']) {
    assert.equal(localCenter(url), true)
    assert.match(connectionPrompt(url, sample, versions), /跨主机必须先/)
  }
  const remote = connectionPrompt('https://eval.example.org', sample, versions)
  assert.equal(localCenter('https://eval.example.org'), false)
  assert.equal(localCenter('not a URL'), false)
  assert.ok(remote.includes('https://eval.example.org'))
  assert.equal(remote.split(sample).length - 1, 1)
  assert.doesNotMatch(blocks(remote)[0], /ose1\./)
  execFileSync('bash', ['-n'], { input: blocks(remote)[0] })
  assert.match(remote, /--state-dir "STATE_DIR" --codex-home "CODEX_DIR"/)
  assert.match(remote, /自动领取匹配的排队任务/)
})

test('remote HTTP is flagged before a worker can reject the enrollment address', () => {
  assert.match(centerNotice('http://192.168.1.2:8765'), /HTTPS/)
  assert.equal(canConnectCenter('http://192.168.1.2:8765'), false)
  assert.equal(canConnectCenter('http://localhost:8765'), true)
  assert.equal(canConnectCenter('https://eval.example.org'), true)
  assert.equal(canConnectCenter('not a URL'), false)
  assert.match(connectionPrompt('http://192.168.1.2:8765', 'sample-code', versions), /远程接入需要 HTTPS/)
  assert.equal(centerNotice('https://eval.example.org'), '')
  assert.match(centerNotice('not a URL'), /地址无效/)
})
