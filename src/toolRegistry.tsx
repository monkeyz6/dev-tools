import React, { lazy } from 'react'
import SeedanceTool from './tools/SeedanceTool'
import {
  IconSeedance, IconJson, IconClock, IconConvert, IconBatch, IconImgTest, IconProbe,
  IconImage, IconVideo, IconId, IconCode, IconType, IconGraphql, IconPromptOpt, IconReport, IconMultiCost, IconCacheHit,
} from './shared/icons'

export type ToolKey = 'seedance' | 'multicost' | 'json' | 'timestamp' | 'aiconvert' | 'llmbatch' | 'imgtest' | 'modelprobe' | 'cachehit' | 'promptopt'
  | 'imganalyze' | 'videoanalyze' | 'idgen' | 'base64' | 'unicode' | 'graphql' | 'llmreport'
export type ToolIntent = 'hover' | 'focus' | 'activate'
export type ToolPath = `/tools/${ToolKey}`
export type ToolRoute =
  | { kind: 'home' }
  | { kind: 'tool'; key: ToolKey; path: ToolPath }
  | { kind: 'not-found'; pathname: string }

type AsyncToolKey = Exclude<ToolKey, 'seedance'>
export type ToolModule = { default: React.ComponentType }
type ToolLoader = () => Promise<ToolModule>

export type ToolGroupKey = 'ai' | 'data' | 'encode'

export interface ToolDefinition {
  key: ToolKey
  path: ToolPath
  label: string
  desc: string
  icon: React.ReactNode
  fullHeight: boolean
  component: React.ComponentType
  group: ToolGroupKey
  /** 侧栏菜单名后追加 Beta 徽章 */
  beta?: boolean
}

export function toolPath(key: ToolKey): ToolPath {
  return `/tools/${key}`
}

const loaders: Record<AsyncToolKey, ToolLoader> = {
  multicost: () => import('./tools/MultiCostTool'),
  json: () => import('./tools/JsonTool'),
  timestamp: () => import('./tools/TimestampTool'),
  aiconvert: () => import('./tools/AiConvertTool'),
  llmbatch: () => import('./tools/LlmBatchTool'),
  llmreport: () => import('./tools/LlmReportTool'),
  imgtest: () => import('./tools/ImgApiTestTool'),
  modelprobe: () => import('./tools/ModelProbeTool'),
  cachehit: () => import('./tools/CacheHitTool'),
  promptopt: () => import('./tools/PromptOptTool'),
  imganalyze: () => import('./tools/ImageAnalyzerTool'),
  videoanalyze: () => import('./tools/VideoAnalyzerTool'),
  idgen: () => import('./tools/IdGenTool'),
  base64: () => import('./tools/Base64Tool'),
  unicode: () => import('./tools/UnicodeTool'),
  graphql: () => import('./tools/GraphqlTool'),
}

const modulePromises = new Map<AsyncToolKey, Promise<ToolModule>>()

function loadToolModule(key: AsyncToolKey): Promise<ToolModule> {
  const cached = modulePromises.get(key)
  if (cached) return cached
  const pending = loaders[key]().catch(error => {
    modulePromises.delete(key)
    throw error
  })
  modulePromises.set(key, pending)
  return pending
}

const lazyComponents: Record<AsyncToolKey, React.LazyExoticComponent<React.ComponentType>> = {
  multicost: lazy(() => loadToolModule('multicost')),
  json: lazy(() => loadToolModule('json')),
  timestamp: lazy(() => loadToolModule('timestamp')),
  aiconvert: lazy(() => loadToolModule('aiconvert')),
  llmbatch: lazy(() => loadToolModule('llmbatch')),
  llmreport: lazy(() => loadToolModule('llmreport')),
  imgtest: lazy(() => loadToolModule('imgtest')),
  modelprobe: lazy(() => loadToolModule('modelprobe')),
  cachehit: lazy(() => loadToolModule('cachehit')),
  promptopt: lazy(() => loadToolModule('promptopt')),
  imganalyze: lazy(() => loadToolModule('imganalyze')),
  videoanalyze: lazy(() => loadToolModule('videoanalyze')),
  idgen: lazy(() => loadToolModule('idgen')),
  base64: lazy(() => loadToolModule('base64')),
  unicode: lazy(() => loadToolModule('unicode')),
  graphql: lazy(() => loadToolModule('graphql')),
}

export const TOOL_GROUPS: { key: ToolGroupKey; label: string }[] = [
  { key: 'ai', label: 'AI 模型工具' },
  { key: 'data', label: '数据格式工具' },
  { key: 'encode', label: '编码与辅助工具' },
]

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // AI 模型工具
  { key: 'seedance', path: toolPath('seedance'), label: 'Seedance 计费', desc: '视频生成模型计费计算器，人民币/美元自动换算', icon: <IconSeedance />, fullHeight: false, component: SeedanceTool, group: 'ai' },
  { key: 'multicost', path: toolPath('multicost'), label: '图片视频计费', desc: '多模型图片/视频生成计费，双币种与 JSON 自动识别', icon: <IconMultiCost />, fullHeight: false, component: lazyComponents.multicost, group: 'ai', beta: true },
  { key: 'modelprobe', path: toolPath('modelprobe'), label: '模型探测', desc: 'API 渠道兼容性、参数降级与缓存实验台', icon: <IconProbe />, fullHeight: true, component: lazyComponents.modelprobe, group: 'ai' },
  { key: 'cachehit', path: toolPath('cachehit'), label: '缓存命中率', desc: '三协议 Prompt Caching 命中率、覆盖率与延迟测试', icon: <IconCacheHit />, fullHeight: true, component: lazyComponents.cachehit, group: 'ai' },
  { key: 'llmbatch', path: toolPath('llmbatch'), label: 'LLM 批量测试', desc: 'Token 计费口径、一致性、波动与模型验真', icon: <IconBatch />, fullHeight: true, component: lazyComponents.llmbatch, group: 'ai' },
  { key: 'llmreport', path: toolPath('llmreport'), label: 'LLM 报告生成', desc: '日志导入生成性能/稳定性分析报告，可导出 HTML', icon: <IconReport />, fullHeight: false, component: lazyComponents.llmreport, group: 'ai' },
  { key: 'imgtest', path: toolPath('imgtest'), label: '图片接口测试', desc: '多渠道图片生成接口批测、价格与响应校验', icon: <IconImgTest />, fullHeight: true, component: lazyComponents.imgtest, group: 'ai' },
  { key: 'imganalyze', path: toolPath('imganalyze'), label: '图片信息识别', desc: '图片分辨率、格式、尺寸与等级识别', icon: <IconImage />, fullHeight: false, component: lazyComponents.imganalyze, group: 'ai' },
  { key: 'videoanalyze', path: toolPath('videoanalyze'), label: '视频信息检测', desc: '本地文件或 URL 视频元信息与播放检测', icon: <IconVideo />, fullHeight: false, component: lazyComponents.videoanalyze, group: 'ai' },
  // 数据格式工具
  { key: 'json', path: toolPath('json'), label: 'JSON 可视化', desc: '双栏 JSON 查看、编辑、折叠与 A/B Diff 对比', icon: <IconJson />, fullHeight: true, component: lazyComponents.json, group: 'data' },
  { key: 'graphql', path: toolPath('graphql'), label: 'GraphQL 格式化', desc: 'GraphQL 查询格式化、压缩与语法检查', icon: <IconGraphql />, fullHeight: true, component: lazyComponents.graphql, group: 'data' },
  { key: 'aiconvert', path: toolPath('aiconvert'), label: 'AI 格式转换', desc: 'OpenAI、Anthropic、Responses 请求体互转', icon: <IconConvert />, fullHeight: true, component: lazyComponents.aiconvert, group: 'data' },
  // 编码与辅助工具
  { key: 'base64', path: toolPath('base64'), label: 'Base64 编解码', desc: '双向编解码、URL-safe 模式与宽容解码', icon: <IconCode />, fullHeight: true, component: lazyComponents.base64, group: 'encode' },
  { key: 'unicode', path: toolPath('unicode'), label: 'Unicode 转换', desc: '六种 Unicode 表示格式的编码与自动解码', icon: <IconType />, fullHeight: true, component: lazyComponents.unicode, group: 'encode' },
  { key: 'timestamp', path: toolPath('timestamp'), label: '时间戳转换', desc: '毫秒/秒/纳秒时间戳与日期时间双向转换', icon: <IconClock />, fullHeight: false, component: lazyComponents.timestamp, group: 'encode' },
  { key: 'promptopt', path: toolPath('promptopt'), label: '提示词优化', desc: '结构化框架选型、系统提示词撰写与智能优化', icon: <IconPromptOpt />, fullHeight: false, component: lazyComponents.promptopt, group: 'encode' },
  { key: 'idgen', path: toolPath('idgen'), label: 'ID 生成器', desc: 'UUID v4/v7 与安全随机字符串批量生成', icon: <IconId />, fullHeight: false, component: lazyComponents.idgen, group: 'encode' },
]

export const TOOL_GROUP_SECTIONS = TOOL_GROUPS.map(group => ({
  ...group,
  tools: TOOL_DEFINITIONS.filter(tool => tool.group === group.key),
}))

export function resolveToolRoute(pathname: string): ToolRoute {
  if (pathname === '/') return { kind: 'home' }
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const definition = TOOL_DEFINITIONS.find(tool => tool.path === normalizedPath)
  return definition
    ? { kind: 'tool', key: definition.key, path: definition.path }
    : { kind: 'not-found', pathname }
}

function allowSpeculativePreload(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (connection?.saveData) return false
  return connection?.effectiveType !== 'slow-2g' && connection?.effectiveType !== '2g'
}

export function preloadTool(key: ToolKey, intent: ToolIntent): void {
  if (key === 'seedance') return
  if (intent !== 'activate' && !allowSpeculativePreload()) return
  void loadToolModule(key)
}
