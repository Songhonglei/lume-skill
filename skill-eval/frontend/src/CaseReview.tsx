export function CaseReview({ saved = false }: { saved?: boolean }) {
  return <details className="case-review" open={!saved}>
    <summary>启用前审查 · 输入、断言与附件</summary>
    <p className="muted">结构校验只检查格式和引用，不确认案例是否明确、预期是否正确。请逐个检查；以下提示不会修改案例或判分条件。</p>
    <ul>
      <li><strong>输入完整：</strong>明确目标 Skill 名称，包含实际数据，并区分指令与数据。空字符串、缺失输入、空格和换行分别说明。</li>
      <li><strong>预期有依据：</strong>按当前 Skill 的约定判分；未定义的行为先澄清，不自行假定。</li>
      <li><strong>断言足够：</strong>核对完整关键结果和失败条件，避免只查固定前缀或“有回复”；保留大小写、标点和空白要求。</li>
      <li><strong>附件自包含：</strong>引用的文件已提供，脚本可判对错；答案和判分依据不放入被测会话可见的附件。</li>
    </ul>
    <details><summary>示例：把空输入写清楚</summary>
      <p>含糊：<q>为以下文本加标签：</q>（未给出文本，可能被理解为需要追问）</p>
      <p>明确：<q>实际输入是零长度字符串（长度 0），不是缺少输入。请按 Skill 的空字符串约定处理，不要请求补充文本。</q></p>
      <p className="muted">先确认 Skill 确实定义了空字符串行为；只澄清输入，不放宽原断言。保存并启用后，再手动发起评测。</p>
    </details>
  </details>
}
