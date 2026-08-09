// 结构化 Prompt 框架数据：六种主流框架、场景推荐映射、LLM 消息构建与输出解析。
// 内容参考 prompt.html 知识教学页提炼。

export type FrameworkId = 'rtf' | 'icio' | 'crispe' | 'costar' | 'tiddec' | 'broke'

export interface FrameworkField {
  key: string
  name: string
  cn: string
  desc: string
  hint: string
  core?: boolean
}

export interface Framework {
  id: FrameworkId
  abbr: string
  fullName: string
  tagline: string
  complexity: string
  bestFor: string
  coreFeature: string
  fields: FrameworkField[]
  example: string
}

export const FRAMEWORKS: Framework[] = [
  {
    id: 'rtf',
    abbr: 'RTF',
    fullName: 'Role–Task–Format',
    tagline: '极简通用',
    complexity: '低',
    bestFor: '通用任务、简单任务',
    coreFeature: '三要素极简结构',
    fields: [
      { key: 'role', name: 'Role', cn: '角色', desc: '定义模型的身份或专业背景。', hint: '例如：你是一名资深市场分析师，擅长行业趋势洞察与数据解读', core: true },
      { key: 'task', name: 'Task', cn: '任务', desc: '说明模型要完成的具体目标。', hint: '例如：分析当前中国新能源汽车市场的发展趋势', core: true },
      { key: 'format', name: 'Format', cn: '格式', desc: '指定输出的格式、风格或语气。', hint: '例如：以 Markdown 表格输出，包含趋势、原因、预测增长率三列' },
    ],
    example: `# Role
你是一名资深市场分析师。

# Task
请分析当前中国新能源汽车市场的发展趋势，指出未来三年的主要增长点。

# Format
请以 Markdown 表格形式输出，包含"趋势"、"原因"、"预测增长率"三列。`,
  },
  {
    id: 'icio',
    abbr: 'ICIO',
    fullName: 'Instruction–Context–Input–Output',
    tagline: '指令与数据分离',
    complexity: '中',
    bestFor: '需要上下文理解或多阶段推理、有具体待处理数据',
    coreFeature: '指令与输入数据分离',
    fields: [
      { key: 'instruction', name: 'Instruction', cn: '指令', desc: '核心任务说明。', hint: '例如：请为指定产品生成一段简短、有吸引力的营销文案', core: true },
      { key: 'context', name: 'Context', cn: '上下文', desc: '背景与辅助信息。', hint: '例如：目标受众是年轻、注重品质的都市白领' },
      { key: 'input', name: 'Input', cn: '输入', desc: '具体需要处理的文本或数据。', hint: '例如：产品名称与特点' },
      { key: 'output', name: 'Output', cn: '输出', desc: '结果格式或表达要求。', hint: '例如：不超过 100 字，语言简洁有节奏感' },
    ],
    example: `# Instruction
请为指定产品生成一段简短、有吸引力的营销文案。

# Context
你是一名资深品牌营销文案策划，擅长为电商产品撰写高转化率的广告语。
目标受众是年轻、注重品质的都市白领。

# Input
产品名称：AI健康监测手环
产品特点：实时监测、可测量血压血氧、监测睡眠和呼吸暂停、外观时尚简约

# Output
请输出一段不超过100字的营销文案，请使用markdown格式，
语言简洁、有节奏感，突出健康的生活方式。`,
  },
  {
    id: 'crispe',
    abbr: 'CRISPE',
    fullName: 'Capacity–Role–Insight–Statement–Personality–Experiment',
    tagline: '人格化与探索',
    complexity: '中高',
    bestFor: '学术、科研、内容创作',
    coreFeature: '人格化、支持探索性输出',
    fields: [
      { key: 'capacity', name: 'Capacity', cn: '能力', desc: '确定智能体的能力边界。', hint: '例如：熟悉零售行业数据分析与竞争对比方法', core: true },
      { key: 'role', name: 'Role', cn: '角色', desc: '明确身份定位。', hint: '例如：你是一名资深市场策略分析师' },
      { key: 'insight', name: 'Insight', cn: '洞察', desc: '提供必要的知识视角或上下文背景。', hint: '例如：品牌背景与目标用户' },
      { key: 'statement', name: 'Statement', cn: '声明', desc: '定义具体的任务目标，也就是 Task。', hint: '例如：请撰写一份市场策略分析报告', core: true },
      { key: 'personality', name: 'Personality', cn: '个性', desc: '设置个性化的语气与风格。', hint: '例如：以专业咨询顾问语气，数据导向' },
      { key: 'experiment', name: 'Experiment', cn: '实验', desc: '指定探索性要求，例如提出假设或生成多个答案。', hint: '例如：额外提供一个创新性市场假设及风险分析' },
    ],
    example: `# Capacity and Role（能力与角色）
你是一名资深市场策略分析师，擅长品牌定位与消费趋势洞察，
熟悉零售行业的数据分析与竞争对比方法。

# Insight（洞察）
某科技品牌计划在明年推出一款主打AI功能的智能手表，
目标群体为25-40岁的城市白领。

# Statement（声明）
请撰写一份市场策略分析报告，包含以下内容：
1. 当前智能手表市场格局与主要竞争者分析
2. 目标用户画像与购买动机
3. 产品差异化与品牌定位建议
4. 三条可执行的市场推广策略

# Personality（个性）
请以专业咨询顾问的语气撰写，逻辑清晰、数据导向。

# Experiment（实验）
在报告结尾，请额外提供一个"创新性市场假设"，
并简要说明其商业价值与潜在风险。`,
  },
  {
    id: 'costar',
    abbr: 'CO-STAR',
    fullName: 'Context–Objective–Style–Tone–Audience–Response',
    tagline: '受众与响应控制',
    complexity: '中高',
    bestFor: '企业报告、课程设计、市场策略分析',
    coreFeature: '强调受众与响应形式，可控性高',
    fields: [
      { key: 'context', name: 'Context', cn: '背景', desc: '提供场景、前提或背景，让模型理解"为什么做"。', hint: '例如：学校计划开展青少年合理使用社交媒体的主题教育活动', core: true },
      { key: 'objective', name: 'Objective', cn: '目标', desc: '明确希望达成的结果，帮助模型聚焦"做什么"。', hint: '例如：帮助青少年理解合理使用社交媒体的重要性', core: true },
      { key: 'style', name: 'Style', cn: '风格/范围', desc: '约束表达风格，或界定任务的内容边界。', hint: '例如：聚焦 13-17 岁青少年，避免过于学术化' },
      { key: 'tone', name: 'Tone', cn: '语气', desc: '指定正式、幽默、专业或轻松等表达语气。', hint: '例如：亲切、鼓励，避免说教' },
      { key: 'audience', name: 'Audience', cn: '受众', desc: '说明目标读者，帮助模型选择合适术语与表达。', hint: '例如：初中至高中阶段的学生' },
      { key: 'response', name: 'Response', cn: '响应形式', desc: '要求列表、短文、步骤或表格等输出结构。', hint: '例如：分点列出 5 条具体建议，每条配一个简短案例' },
    ],
    example: `# Context（背景）
学校计划开展青少年合理使用社交媒体的主题教育活动。

# Objective（目标）
帮助青少年理解合理使用社交媒体的重要性，并提供可操作的建议。

# Style（风格）
聚焦 13-17 岁青少年，涵盖使用时长管理、信息辨别、隐私保护，
避免过于学术化的理论。

# Tone（语气）
亲切、鼓励，像学长学姐的建议，避免说教。

# Audience（受众）
初中至高中阶段的学生。

# Response（响应形式）
分点列出 5 条具体建议，每条配一个简短案例或比喻。`,
  },
  {
    id: 'tiddec',
    abbr: 'TIDD-EC',
    fullName: "Task Type–Instructions–Do–Don't–Example–Content",
    tagline: '允许与禁止行为',
    complexity: '中高',
    bestFor: '教育培训、法律咨询、技术支持等强规范场景',
    coreFeature: '明确应做与禁止做',
    fields: [
      { key: 'taskType', name: 'Task Type', cn: '任务类型', desc: '明确任务的性质和目标。', hint: '例如：撰写法律意见书', core: true },
      { key: 'instructions', name: 'Instructions', cn: '指令', desc: '提供执行任务的具体步骤或指导。', hint: '例如：根据客户提供的案件信息，分析法律风险并提出可行建议' },
      { key: 'do', name: 'Do', cn: '应做', desc: '列出应当执行的操作或行为。', hint: '例如：结合相关法律法规进行分析、条理清晰地列出风险点' },
      { key: 'dont', name: "Don't", cn: '不应做', desc: '指出应避免的错误或不当行为。', hint: '例如：不要提供具体法律诉讼策略、避免主观推测' },
      { key: 'example', name: 'Example', cn: '示例', desc: '提供期望输出的示例，帮助模型理解结果。', hint: '例如：给出一个符合期望的输入输出对' },
      { key: 'content', name: 'Content', cn: '用户内容', desc: '用户提供的背景信息或数据。', hint: '例如：案件类型与关键条款' },
    ],
    example: `# 任务
撰写法律意见书

# 指令
根据客户提供的案件信息，分析法律风险并提出可行建议

# 你应该做
- 结合相关法律法规进行分析
- 条理清晰地列出风险点
- 提供操作性建议

# 你禁止做
- 不要提供具体的法律诉讼策略或个案判决
- 避免主观推测，确保内容专业客观

# 示例
客户希望了解合同条款中的潜在风险，分析指出关键条款可能存在的
履约争议，并给出建议如完善合同条款或加强证据准备

# 用户内容
- 案件类型：商业合同纠纷
- 关键条款：付款条款、违约责任、交付时间`,
  },
  {
    id: 'broke',
    abbr: 'BROKE',
    fullName: 'Background–Role–Objective–Key Result–Evolution',
    tagline: '结果评估与迭代',
    complexity: '中高',
    bestFor: '活动策划、产品设计、需要持续改进的任务',
    coreFeature: '关键结果可评估、支持迭代',
    fields: [
      { key: 'background', name: 'Background', cn: '背景', desc: '描述任务上下文，提供必要理解依据。', hint: '例如：学校希望提高学生的环保意识' },
      { key: 'role', name: 'Role', cn: '角色', desc: '明确模型应扮演的身份，引导输出风格与深度。', hint: '例如：作为校园活动策划师' },
      { key: 'objective', name: 'Objective', cn: '目标', desc: '定义任务的具体目标或预期结果。', hint: '例如：通过活动让学生了解环保知识并积极参与实践', core: true },
      { key: 'keyResult', name: 'Key Result', cn: '关键结果', desc: '设定衡量成功的标准或指标，确保输出可评估。', hint: '例如：参与率达到 80% 以上，创意作品不少于 50 份' },
      { key: 'evolution', name: 'Evolution', cn: '进化', desc: '提供改进建议或后续步骤，支持持续优化。', hint: '例如：根据反馈调整宣传策略与活动形式' },
    ],
    example: `# 背景（Background）
学校希望提高学生的环保意识，计划开展一次以校园环保为主题的活动。

# 角色（Role）
作为校园活动策划师，负责设计活动方案并确保可执行性。

# 目标（Objective）
通过活动让学生了解环保知识并积极参与实践。

# 关键结果（Key Result）
活动结束后，学生参与率达到80%以上，
提交的环保创意作品数量不少于50份。

# 进化（Evolution）
根据活动反馈调整宣传策略和活动形式，优化互动环节，
使下一次活动更具吸引力。`,
  },
]

export const frameworkOf = (id: FrameworkId): Framework =>
  FRAMEWORKS.find(fw => fw.id === id) ?? FRAMEWORKS[0]

export interface Scenario {
  id: string
  label: string
  frameworkId: FrameworkId
  reason: string
}

export const SCENARIOS: Scenario[] = [
  { id: 'simple', label: '简单通用，快速上手', frameworkId: 'rtf', reason: '简单通用、希望快速上手时，用最少结构明确角色、任务与格式。' },
  { id: 'data', label: '有具体输入数据要处理', frameworkId: 'icio', reason: '有具体文本或数据要处理时，把稳定指令和动态输入清晰分开。' },
  { id: 'creative', label: '需要人格化与创造性探索', frameworkId: 'crispe', reason: '需要稳定人格、专业视角或多个创新假设时，加入能力、个性与实验要求。' },
  { id: 'audience', label: '结构复杂且有明确受众', frameworkId: 'costar', reason: '输出结构复杂且面向特定读者时，显式控制受众、语气与响应形式。' },
  { id: 'guardrails', label: '必须规定允许与禁止行为', frameworkId: 'tiddec', reason: '合规或强规范任务中，用 Do 与 Don\'t 建立明确的行为护栏。' },
  { id: 'iterative', label: '结果需可评估、可迭代', frameworkId: 'broke', reason: '结果需要量化验收并持续改进时，用 Key Result 与 Evolution 闭环。' },
]

export const CORE_ELEMENTS: { index: string; title: string; desc: string }[] = [
  { index: 'CORE 01', title: '角色定位', desc: '回答"模型是谁"。对应 RTF 的 Role、CRISPE 的 Capacity 与 Role、BROKE 的 Role，ICIO 中常写入 Context。' },
  { index: 'CORE 02', title: '任务目标', desc: '回答"要做什么"。对应 Task、Instruction、Statement、Objective 等要素。' },
  { index: 'CORE 03', title: '上下文背景', desc: '回答"为什么做、依据什么"。对应 Context、Input、Insight、Content 与 Background。' },
  { index: 'CORE 04', title: '输出格式', desc: '回答"怎么呈现"。对应 Format、Output、Personality、Tone、Response 与 Example。' },
]

export const SYSTEM_EXPERT_PROMPT =
  '你是一位资深提示词工程专家，精通结构化 Prompt 框架：RTF（Role–Task–Format）、ICIO（Instruction–Context–Input–Output）、CRISPE（Capacity–Role–Insight–Statement–Personality–Experiment）、CO-STAR（Context–Objective–Style–Tone–Audience–Response）、TIDD-EC（Task Type–Instructions–Do–Don\'t–Example–Content）、BROKE（Background–Role–Objective–Key Result–Evolution）。你擅长把零散需求组织成结构清晰、可直接使用的系统提示词，也擅长诊断现有提示词的薄弱环节并针对性改进。'

export type FrameworkFieldValues = Record<string, string>

export function buildGenerateMessages(fw: Framework, values: FrameworkFieldValues): { system: string; user: string } {
  const fieldsText = fw.fields.map(f => {
    const v = (values[f.key] ?? '').trim()
    return `- ${f.name}（${f.cn}）：${v ? v : '（未填写，可自行合理补全或省略）'}`
  }).join('\n')

  const user = `请按照 ${fw.abbr} 框架（${fw.fullName}）撰写一份完整、可直接使用的系统提示词。

要素填写情况：
${fieldsText}

要求：
1. 严格遵循 ${fw.abbr} 框架的结构组织内容，用 Markdown 的 # 分节
2. 使用中文书写（除非要素中明确要求其他语言）
3. 对用户填写的要素进行润色与补全，使其更专业、更具体
4. 对未填写的要素，根据专业判断合理补全或合并省略，不要编造与任务无关的信息
5. 只输出提示词本身，不要输出任何解释、前言或后语`

  return { system: SYSTEM_EXPERT_PROMPT, user }
}

export function buildOptimizeMessages(raw: string, targetFwId: FrameworkId | 'auto'): { system: string; user: string } {
  const fw = targetFwId === 'auto' ? null : frameworkOf(targetFwId)
  const target = fw ? `${fw.abbr}（${fw.fullName}），按该框架结构重组` : '先自行判断最适合的框架，再按该框架结构输出'
  const user = `我有一段现有的提示词，请你以资深提示词工程专家的身份审视并优化它。

现有提示词：
"""
${raw}
"""

目标框架：${target}

优化要求：
1. 对照四大核心要素（角色定位、任务目标、上下文背景、输出格式）诊断薄弱环节：缺失、含糊、冗余、缺乏约束等
2. 补全缺失要素，把含糊的要求写具体，删掉冗余表述，必要时补充明确的输出格式与禁止行为

输出格式要求（必须严格遵守）：
- 第一段以「${OPTIMIZED_MARK}」开头，输出优化后的完整提示词
- 第二段以「${NOTES_MARK}」开头，分条列出每处改动及理由，例如"1. 补充角色定位：……"、"2. 明确输出格式：……"
- 除以上两段外不要输出其他内容`

  return { system: SYSTEM_EXPERT_PROMPT, user }
}

export const OPTIMIZED_MARK = '【优化后的提示词】'
export const NOTES_MARK = '【改动说明】'

export function parseOptimizeOutput(text: string): { optimized: string; notes: string } {
  const optimizedIdx = text.indexOf(OPTIMIZED_MARK)
  if (optimizedIdx === -1) return { optimized: text.trim(), notes: '' }
  const notesIdx = text.indexOf(NOTES_MARK)
  if (notesIdx === -1 || notesIdx < optimizedIdx) return { optimized: text.slice(optimizedIdx + OPTIMIZED_MARK.length).trim(), notes: '' }
  return {
    optimized: text.slice(optimizedIdx + OPTIMIZED_MARK.length, notesIdx).trim(),
    notes: text.slice(notesIdx + NOTES_MARK.length).trim(),
  }
}

// 拼接渠道 baseUrl 与接口路径，避免 /v1 重复
export function joinLlmUrl(base: string, path: string): string {
  const clean = base.trim().replace(/\/+$/, '')
  if (clean.endsWith('/v1') && path.startsWith('/v1/')) return clean + path.slice(3)
  return clean + path
}
