import { kvGet, kvSet, kvRemove } from '../shared/app-kv'
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, EditableSelect, CustomTextarea, Toggle, SegmentedControl } from '../shared/ui'
import { historyDbGetAll, historyDbPutOne, historyDbDeleteOne, historyDbDeleteMany, historyDbClear } from '../shared/history-db'
import { useDebouncedPersist } from '../shared/use-debounced-persist'
import { uniqueCopyName } from '../shared/channel-copy'
import { encryptLlmApiKey, decryptLlmApiKey } from '../shared/api-key-crypto'
import { probeVideoMeta, vidAspectRatio, vidCheckRatio, vidCheckResolution, vidFormatDuration } from '../shared/video-meta'
import { VIDEO_CASE_DEFS, VIDEO_MATERIAL_DEFS, VIDEO_RESOLUTION_HEIGHT, videoModelMaxResolution, videoModelMaxResolutionLabel, videoFmtTime } from './video-report/types'
import type { VideoCaseDef, VideoCaseKind, VideoCheck, VideoExpect, VideoRecord } from './video-report/types'
import { formatVideoTaskError, parseVideoTaskError, videoBuildErrorBodyChecks, videoShouldCheckErrorBody } from './video-report/errors'
import { videoClassify, videoVerdict } from './video-report/summary'
import { videoCanRequery, videoRetryAction, videoRetrySort, videoRetryTargets } from './video-report/retry'
import { videoGroupBatches, videoTrimByBatch } from './video-report/batches'
import type { VideoBatch } from './video-report/batches'
import VideoReportView from './video-report/VideoReportView'

const VIDEO_CH_KEY = 'videotest-channels'
const VIDEO_ACTIVE_KEY = 'videotest-active'
const VIDEO_UI_KEY = 'videotest-ui'
const VIDEO_POLL_MS = 5000
const VIDEO_POLL_MAX_MS = 15 * 60 * 1000
const VIDEO_ASSET_POLL_MAX_MS = 3 * 60 * 1000
/** 提交生成任务：网关会先同步拉取并转换 content 里的图片/视频/音频（「素材转换」）再返回任务 id，大图/视频常要一两分钟，给足 5 分钟 */
const VIDEO_SUBMIT_TIMEOUT_MS = 5 * 60 * 1000
/** 任务轮询 / 素材 OpenAPI 单次请求 */
const VIDEO_REQUEST_TIMEOUT_MS = 60 * 1000
const VIDEO_DURATION_TOL = 1
const VIDEO_RATIO_TOL = 0.05
const VIDEO_RESOLUTION_TOL = 0.15
const VIDEO_DEFAULT_PROMPT = '海浪拍打礁石，慢动作，电影感'
const VIDEO_DEFAULT_MODEL = 'doubao-seedance-2-0'
const VIDEO_MODEL_OPTIONS = [
  'doubao-seedance-2-0',
  'doubao-seedance-2-0-fast',
  'doubao-seedance-2-0-mini',
  'doubao-seedance-2-5',
  'dreamina-seedance-2-0',
  'dreamina-seedance-2-0-fast',
  'dreamina-seedance-2-0-mini',
  'dreamina-seedance-2-5',
].map(m => ({ value: m, label: m }))

/**
 * 默认素材用火山方舟官方文档里的示例文件（`ark-project.tos-cn-beijing.volces.com`）：网关是服务端拉取，
 * 官方 TOS 桶对任意 UA 匿名可取，尺寸也都在 Seedance 2.x 输入范围内
 * （首尾帧 2048×2048；参考图 1280×706；参考视频 1280×720 · 24fps · 5.0s；参考音频 11.1s）。
 * 早期用 Wikimedia / MDN 公网文件：Wikimedia 对非浏览器 UA 403、对非标准缩略图宽度 400、对数据中心 IP 还会 429，
 * 网关侧统一表现成「素材转换失败: Failed to download media」，不能当默认。
 */
const VIDEO_DEFAULT_URLS = {
  firstFrame: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_first_frame.jpeg',
  lastFrame: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_last_frame.jpeg',
  refImage: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg',
  refVideo: 'https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4',
  refAudio: 'https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3',
  // 官方没有「真人名人」示例，仍用 Wikimedia Commons（CC 授权）：2020 中餐厅第四季发布会上的赵丽颖，仅供「拒绝 · 名人首帧」用例；
  // 960px 是 Wikimedia 标准缩略图宽度。网关拉不到时用例会记「请求异常」而不是「已拒绝」，左栏可换成自己的图
  sensitiveFace: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg/960px-Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg',
}

/** 历史版本的默认链接：`videotest-ui` 里存的若仍是这些（用户没手改过），加载时换成当前默认 */
const VIDEO_LEGACY_DEFAULT_URLS: Record<keyof typeof VIDEO_DEFAULT_URLS, string[]> = {
  firstFrame: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/960px-PNG_transparency_demonstration_1.png',
  ],
  lastFrame: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/320px-Fronalpstock_big.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/960px-Fronalpstock_big.jpg',
  ],
  refImage: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/960px-Camponotus_flavomarginatus_ant.jpg',
  ],
  refVideo: ['https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'],
  refAudio: ['https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3'],
  sensitiveFace: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg/640px-Zhao_Liying_at_Chinese_Restaurant_S4_Announcement_Conference%2C_31_July_2020_%28cropped%29.jpg',
  ],
}
function videoUrlOrDefault(saved: string | undefined, role: keyof typeof VIDEO_DEFAULT_URLS): string {
  const def = VIDEO_DEFAULT_URLS[role]
  if (saved == null) return def
  return VIDEO_LEGACY_DEFAULT_URLS[role].includes(saved.trim()) ? def : saved
}

/** 网关服务端拉素材失败（TOS fetch 4xx/5xx）——这是素材链接的问题，不是模型拒绝，不能算「已拒绝」 */
function videoIsMediaFetchError(err: string | null | undefined): boolean {
  if (!err) return false
  return /素材转换失败|Failed to download media|fetch object return status code|failed to fetch (image|video|audio|media)/i.test(err)
}

interface VideoChannel { id: string; name: string; baseUrl: string; apiKeyEnc: string; keyMask: string }
interface VideoMediaUrls {
  firstFrame: string
  lastFrame: string
  refImage: string
  refVideo: string
  refAudio: string
  sensitiveFace: string
}
interface VideoPlan {
  kind: 'task' | 'openapi'
  endpoint: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}
interface VideoCase {
  id: string
  def: VideoCaseDef
  kind: VideoCaseKind
  name: string
  desc: string
  selected: boolean
  expanded: boolean
  status: 'idle' | 'running' | 'pass' | 'fail' | 'error'
  editedPreview: string | null
  result: VideoRecord | null
}
interface VideoAssets {
  groupId: string | null
  firstFrame?: string
  lastFrame?: string
  refImage?: string
  refVideo?: string
  refAudio?: string
}

function videoUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function videoEsc(s: unknown) { return String(s ?? '') }
function videoTrimUrl(s: string) { return s.trim() }

function videoLoadChannels(): VideoChannel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = kvGet(VIDEO_CH_KEY)
    if (raw) { const l = JSON.parse(raw); if (Array.isArray(l)) return l }
  } catch { /* ignore */ }
  return []
}

function videoLoadUi(): {
  model?: string; prompt?: string; testMaterials?: boolean
  firstFrame?: string; lastFrame?: string; refImage?: string; refVideo?: string; refAudio?: string; sensitiveFace?: string
} {
  if (typeof window === 'undefined') return {}
  try {
    const raw = kvGet(VIDEO_UI_KEY)
    if (raw) { const c = JSON.parse(raw); return c && typeof c === 'object' ? c : {} }
  } catch { /* ignore */ }
  return {}
}

async function videoLoadHistory(): Promise<VideoRecord[]> {
  const list = await historyDbGetAll<VideoRecord>('videotest')
  return list.sort((a, b) => b.time - a.time)
}

async function videoHistTrim(): Promise<void> {
  const list = await videoLoadHistory()
  const keep = new Set(videoTrimByBatch(list).map(r => r.id))
  const overflow = list.filter(r => !keep.has(r.id))
  if (overflow.length) await historyDbDeleteMany('videotest', overflow.map(r => r.id))
}

function videoHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

async function videoFetch(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

function videoParseJson(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

function videoFormatBody(body: string): string {
  if (!body) return ''
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}

function videoOpenApiError(json: any, httpStatus: number, text: string): string | null {
  const metaErr = json?.ResponseMetadata?.Error
  if (metaErr?.Message || metaErr?.Code) return `${metaErr.Code || 'Error'}: ${metaErr.Message || ''}`.trim()
  if (json?.error?.message) return `${json.error.code || 'error'}: ${json.error.message}`
  if (httpStatus >= 400) return text.slice(0, 400) || `HTTP ${httpStatus}`
  return null
}

function videoTaskError(json: any): string | null {
  return formatVideoTaskError(parseVideoTaskError(json).detail)
}

function videoExtractTaskId(json: any): string | null {
  return json?.id || json?.task_id || json?.data?.id || json?.data?.task_id || null
}

function videoExtractStatus(json: any): string {
  return String(json?.status || json?.data?.status || json?.task?.status || '').toLowerCase()
}

function videoTaskSucceeded(st: string) {
  return st === 'succeeded' || st === 'success'
}

function videoTaskFailed(st: string) {
  return st === 'failed' || st === 'failure'
}

function videoExtractVideoUrl(json: any): string | null {
  return json?.content?.video_url
    || json?.data?.content?.video_url
    || json?.data?.data?.content?.video_url
    || json?.result_url
    || json?.data?.result_url
    || null
}

function videoExtractEcho(json: any): { resolution?: string; ratio?: string; duration?: number; generate_audio?: boolean; seed?: number } {
  const src = json?.data?.data && typeof json.data.data === 'object' ? json.data.data : (json?.data && typeof json.data === 'object' && !json.data.content ? json.data : json)
  const duration = src?.duration
  const seed = src?.seed
  return {
    resolution: src?.resolution != null ? String(src.resolution) : undefined,
    ratio: src?.ratio != null ? String(src.ratio) : undefined,
    duration: typeof duration === 'number' ? duration : (duration != null ? Number(duration) : undefined),
    generate_audio: typeof src?.generate_audio === 'boolean' ? src.generate_audio : undefined,
    seed: typeof seed === 'number' ? seed : (seed != null && seed !== '' && !Number.isNaN(Number(seed)) ? Number(seed) : undefined),
  }
}

type VideoAssetRole = Exclude<keyof VideoMediaUrls, 'sensitiveFace'>

function videoMediaItems(urls: VideoMediaUrls, testMaterials: boolean, assets: VideoAssets | null, roles: Array<{ key: VideoAssetRole; type: 'image_url' | 'video_url' | 'audio_url'; role: string }>) {
  const skipped: string[] = []
  const content: Record<string, unknown>[] = []
  let missing: string | null = null
  for (const r of roles) {
    const raw = videoTrimUrl(urls[r.key])
    if (!raw) { skipped.push(r.role + '（未提供 URL，已跳过）'); continue }
    let url = raw
    if (testMaterials) {
      const id = assets?.[r.key]
      if (!id) {
        if (!missing) missing = r.role
        url = `asset://{{${r.role}}}`
      } else {
        url = `asset://${id}`
      }
    }
    if (r.type === 'image_url') content.push({ type: 'image_url', image_url: { url }, role: r.role })
    else if (r.type === 'video_url') content.push({ type: 'video_url', video_url: { url }, role: r.role })
    else content.push({ type: 'audio_url', audio_url: { url }, role: r.role })
  }
  return { content, skipped, missing }
}

function videoBuildPlan(def: VideoCaseDef, model: string, prompt: string, urls: VideoMediaUrls, testMaterials: boolean, assets: VideoAssets | null): { plan: VideoPlan; skipped: string[]; missing: string | null; targets: Record<string, string | number | boolean | null> } {
  const kind = def.kind
  if (kind === 'material-group') {
    return {
      plan: {
        kind: 'openapi',
        method: 'POST',
        endpoint: '/byteplus/?Action=CreateAssetGroup&Version=2024-01-01',
        headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
        body: { Name: `videotest-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`, Description: '视频接口测试自动创建', GroupType: 'AIGC' },
      },
      skipped: [], missing: null, targets: {},
    }
  }
  if (kind === 'material-assets') {
    const items = [
      urls.firstFrame && { URL: urls.firstFrame, Name: 'first_frame', AssetType: 'Image' },
      urls.lastFrame && { URL: urls.lastFrame, Name: 'last_frame', AssetType: 'Image' },
      urls.refImage && { URL: urls.refImage, Name: 'reference_image', AssetType: 'Image' },
      urls.refVideo && { URL: urls.refVideo, Name: 'reference_video', AssetType: 'Video' },
      urls.refAudio && { URL: urls.refAudio, Name: 'reference_audio', AssetType: 'Audio' },
    ].filter(Boolean)
    return {
      plan: {
        kind: 'openapi',
        method: 'POST',
        endpoint: '/byteplus/?Action=CreateAsset&Version=2024-01-01',
        headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
        body: { GroupId: assets?.groupId || '{{GROUP_ID}}', items },
      },
      skipped: [], missing: assets?.groupId ? null : '素材组尚未创建', targets: {},
    }
  }

  const text = { type: 'text', text: prompt }
  let extra: Record<string, unknown>[] = []
  let skipped: string[] = []
  let missing: string | null = null
  const targets: Record<string, string | number | boolean | null> = {}

  if (kind === 'i2v-frames') {
    const packed = videoMediaItems(urls, testMaterials, assets, [
      { key: 'firstFrame', type: 'image_url', role: 'first_frame' },
      { key: 'lastFrame', type: 'image_url', role: 'last_frame' },
    ])
    extra = packed.content
    skipped = packed.skipped
    missing = packed.missing
  } else if (kind === 'ref-omni') {
    const packed = videoMediaItems(urls, testMaterials, assets, [
      { key: 'refImage', type: 'image_url', role: 'reference_image' },
      { key: 'refVideo', type: 'video_url', role: 'reference_video' },
      { key: 'refAudio', type: 'audio_url', role: 'reference_audio' },
    ])
    extra = packed.content
    skipped = packed.skipped
    missing = packed.missing
  } else if (kind === 'i2v-reject') {
    // 名人照始终走 https 直链：不把它登记进素材组，也不受「测试素材库」开关影响
    const face = videoTrimUrl(urls.sensitiveFace)
    if (!face) missing = '敏感人像 URL（左栏为空）'
    else extra = [{ type: 'image_url', image_url: { url: face }, role: 'first_frame' }]
  }

  const body: Record<string, unknown> = { model, content: [text, ...extra] }
  for (const [k, v] of Object.entries(def.params)) {
    if (v === undefined) continue
    body[k] = v
    targets[k] = v
  }

  return {
    plan: {
      kind: 'task',
      method: 'POST',
      endpoint: '/byteplus/api/v3/contents/generations/tasks',
      headers: { Authorization: 'Bearer {{APIKEY}}', 'Content-Type': 'application/json' },
      body,
    },
    skipped, missing, targets,
  }
}

function videoPlanPreview(plan: VideoPlan): string {
  return JSON.stringify(plan.body, null, 2)
}

function videoParseEditedPreview(plan: VideoPlan, raw: string): VideoPlan {
  const body = JSON.parse(raw)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求体必须是 JSON 对象')
  return { ...plan, body }
}

const VIDEO_NEGATIVE_CHECK_NAMES = ['预期拒绝', '预期不支持']

/** 拒绝 / 不支持类：ok 表示「按预期完成」，由判定项决定；真出片的「不支持」走正向流程，ok 保持探测结果 */
function videoSettleOk(rec: VideoRecord): boolean {
  if (!videoIsNegative(rec)) return rec.ok
  const neg = rec.checks.find(x => VIDEO_NEGATIVE_CHECK_NAMES.includes(x.name) && !x.info)
  return neg ? neg.pass : rec.ok
}

function videoCaseStatus(rec: VideoRecord): 'pass' | 'fail' | 'error' {
  const v = videoVerdict(rec.checks)
  let status: 'pass' | 'fail' | 'error' = rec.ok ? (v.level === 'ok' ? 'pass' : 'fail') : 'error'
  if (status === 'pass' && rec.checks.some(x => !x.info && !x.pass)) status = 'fail'
  if (status === 'error' && rec.ok && v.level !== 'ok') status = 'fail'
  return status
}

function videoIsNegative(rec: Pick<VideoRecord, 'expect'>): boolean {
  return rec.expect === 'reject' || rec.expect === 'unsupported'
}

/** 拒绝 / 不支持类的判定：提交 4xx 或任务 failed 都算「已按预期拒绝」，真出片才算没拒 */
function videoNegativeOutcome(rec: VideoRecord): { rejected: boolean; produced: boolean; actual: string } {
  const produced = videoTaskSucceeded(rec.taskStatus || '') && !!rec.videoUrl
  const http4xx = rec.status >= 400 && rec.status < 500
  // 提交 4xx 不会写入 taskId；查询 4xx 已有 taskId，只是轮询终态，不能算模型拒绝
  const submitRejected = http4xx && !rec.taskId
  const taskFailed = videoTaskFailed(rec.taskStatus || '')
  const mediaFetchErr = videoIsMediaFetchError(rec.error)
  const rejected = !produced && !mediaFetchErr && (submitRejected || taskFailed)
  const actual = produced ? '任务成功并出片'
    : mediaFetchErr ? `素材拉取失败（网关取不到图，不是模型拒绝，请换左栏「敏感人像」链接）· ${rec.error}`
    : submitRejected ? `HTTP ${rec.status} 已拒绝${rec.error ? ' · ' + rec.error : ''}`
    : taskFailed ? `任务 ${rec.taskStatus}${rec.error ? ' · ' + rec.error : ''}`
    : rec.status ? `HTTP ${rec.status}${rec.taskStatus ? ' · 任务 ' + rec.taskStatus : ''}${rec.error ? ' · ' + rec.error : ''}`
    : (rec.error || '无响应')
  return { rejected, produced, actual: actual.length > 200 ? actual.slice(0, 200) + '…' : actual }
}

function videoBuildChecks(rec: VideoRecord): VideoCheck[] {
  const checks: VideoCheck[] = []
  const negative = videoIsNegative(rec)
  const httpOk = rec.status >= 200 && rec.status < 300

  if (negative) {
    const out = videoNegativeOutcome(rec)
    if (rec.expect === 'reject') {
      checks.push({ name: '预期拒绝', target: '4xx 或任务 failed', actual: out.actual, pass: out.rejected })
      if (videoShouldCheckErrorBody(rec)) checks.push(...videoBuildErrorBodyChecks(rec))
      return checks
    }
    if (!out.produced) {
      checks.push({ name: '预期不支持', target: `4xx 或任务 failed（能力表：最高 ${videoModelMaxResolutionLabel(rec.model)}）`, actual: out.actual, pass: out.rejected })
      if (videoShouldCheckErrorBody(rec)) checks.push(...videoBuildErrorBodyChecks(rec))
      return checks
    }
    checks.push({ name: '预期不支持', target: `能力表：最高 ${videoModelMaxResolutionLabel(rec.model)}`, actual: '任务成功并出片 · 能力表可能过期，请核对', pass: true, info: true })
  }

  checks.push({ name: rec.kind.startsWith('material') ? 'OpenAPI 请求成功' : '请求成功', target: 'HTTP 2xx', actual: rec.status ? `HTTP ${rec.status}` : '无响应', pass: httpOk })

  if (!negative && videoShouldCheckErrorBody(rec)) {
    checks.push(...videoBuildErrorBodyChecks(rec))
    if (rec.status >= 400) return checks
  }

  for (const skip of rec.skippedRoles || []) {
    checks.push({ name: '素材角色', target: '已提供', actual: skip, pass: true, info: true })
  }

  if (rec.kind === 'material-group' || rec.kind === 'material-assets') {
    checks.push({ name: rec.kind === 'material-group' ? '素材组' : '素材登记', target: '成功', actual: rec.ok ? (rec.taskId || 'ok') : (rec.error || '失败'), pass: rec.ok })
    return checks
  }

  if (rec.taskStatus) {
    checks.push({ name: '任务状态', target: 'succeeded', actual: rec.taskStatus, pass: videoTaskSucceeded(rec.taskStatus) })
  }
  checks.push({ name: '视频地址', target: 'content.video_url', actual: rec.videoUrl || '无', pass: !!rec.videoUrl })
  checks.push({ name: '成片元数据', target: '可读宽高时长', actual: rec.probe ? `${rec.probe.w}×${rec.probe.h} · ${rec.probe.duration.toFixed(2)}s` : (rec.error && !rec.probe ? rec.error : '未读到'), pass: !!(rec.probe && rec.probe.w && rec.probe.h && rec.probe.duration > 0) })

  const wantRes = rec.targets.resolution
  if (typeof wantRes === 'string' && rec.probe) {
    const hit = vidCheckResolution(wantRes, rec.probe.w, rec.probe.h, VIDEO_RESOLUTION_TOL)
    if (hit) {
      checks.push({
        name: '分辨率',
        target: `${wantRes}（面积档 ±${Math.round(VIDEO_RESOLUTION_TOL * 100)}%）`,
        actual: `${rec.probe.w}×${rec.probe.h} → 最近 ${hit.nearest}（偏差 ${hit.devPct}%）`,
        pass: hit.pass,
      })
    }
  }

  const wantDur = rec.targets.duration
  if (typeof wantDur === 'number' && rec.probe) {
    const diff = Math.abs(rec.probe.duration - wantDur)
    checks.push({ name: '时长', target: `${wantDur}s ±${VIDEO_DURATION_TOL}s`, actual: `${rec.probe.duration.toFixed(2)}s`, pass: diff <= VIDEO_DURATION_TOL })
  } else if (rec.probe && typeof rec.targets.echoDuration === 'number') {
    const echo = rec.targets.echoDuration
    const diff = Math.abs(rec.probe.duration - echo)
    checks.push({ name: '时长', target: `回显 ${echo}s ±${VIDEO_DURATION_TOL}s`, actual: `${rec.probe.duration.toFixed(2)}s`, pass: diff <= VIDEO_DURATION_TOL })
  }

  const wantRatio = rec.targets.ratio
  if (typeof wantRatio === 'string' && rec.probe) {
    const ratioTarget = wantRatio === 'adaptive'
      ? (typeof rec.targets.echoRatio === 'string' && rec.targets.echoRatio !== 'adaptive' ? rec.targets.echoRatio : null)
      : wantRatio
    if (ratioTarget) {
      const hit = vidCheckRatio(ratioTarget, rec.probe.w, rec.probe.h, VIDEO_RATIO_TOL)
      checks.push({
        name: '宽高比',
        target: `${ratioTarget}${wantRatio === 'adaptive' ? '（adaptive 回显）' : ''} ±5%`,
        actual: hit ? `${vidAspectRatio(rec.probe.w, rec.probe.h)}（偏差 ${hit.devPct}%）` : `${rec.probe.w}×${rec.probe.h}`,
        pass: hit ? hit.pass : false,
      })
    } else if (wantRatio === 'adaptive') {
      checks.push({ name: '宽高比', target: 'adaptive（无回显，只要求可读）', actual: vidAspectRatio(rec.probe.w, rec.probe.h), pass: true, info: true })
    }
  }

  const wantAudio = rec.targets.generate_audio
  if (typeof wantAudio === 'boolean' && rec.probe) {
    const has = rec.probe.hasAudio
    if (has == null) {
      checks.push({ name: '音轨', target: wantAudio ? '有音轨' : '无音轨', actual: '无法判断（浏览器测不出）', pass: true, info: true })
    } else {
      checks.push({ name: '音轨', target: wantAudio ? '有音轨' : '无音轨', actual: has ? '有音轨' : '无音轨', pass: has === wantAudio })
    }
  }

  const wantSeed = rec.targets.seed
  if (typeof wantSeed === 'number') {
    const echo = rec.targets.echoSeed
    if (typeof echo === 'number') {
      checks.push({ name: 'seed', target: String(wantSeed), actual: `回显 ${echo}`, pass: echo === wantSeed })
    } else {
      checks.push({ name: 'seed', target: String(wantSeed), actual: rec.ok ? '任务已接受（响应未回显 seed）' : (rec.error || '未接受'), pass: rec.ok, info: true })
    }
  }
  if (rec.targets.watermark != null) {
    checks.push({ name: 'watermark', target: String(rec.targets.watermark), actual: rec.ok ? '任务已接受（画面水印需人工看）' : (rec.error || '未接受'), pass: rec.ok, info: true })
  }
  if (rec.usage) {
    const tokens = rec.usage.total_tokens ?? rec.usage.completion_tokens
    if (tokens != null) checks.push({ name: 'usage', target: 'total_tokens', actual: tokens, pass: true, info: true })
  }
  return checks
}

/** 用例分辨率超出模型能力表上限时按「预期不支持」判定；不支持/未知档位（500p）不参与 */
function videoExpectFor(def: VideoCaseDef, model: string): VideoExpect {
  if (def.expect === 'reject') return 'reject'
  const h = def.params.resolution ? VIDEO_RESOLUTION_HEIGHT[def.params.resolution.toLowerCase()] : undefined
  if (h && h > videoModelMaxResolution(model)) return 'unsupported'
  return 'success'
}

function videoBuildCases(testMaterials: boolean): VideoCase[] {
  const defs = testMaterials ? [...VIDEO_MATERIAL_DEFS, ...VIDEO_CASE_DEFS] : VIDEO_CASE_DEFS
  return defs.map(d => ({
    id: d.id,
    def: d,
    kind: d.kind,
    name: d.name,
    desc: d.desc,
    selected: true,
    expanded: false,
    status: 'idle',
    editedPreview: null,
    result: null,
  }))
}

function videoMergeCases(prev: VideoCase[], next: VideoCase[]): VideoCase[] {
  return next.map(n => {
    const old = prev.find(p => p.id === n.id)
    if (!old) return n
    return { ...n, selected: old.selected, expanded: old.expanded, status: old.status, result: old.result, editedPreview: old.editedPreview }
  })
}

function videoDownloadText(name: string, content: string, mime: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

function videoWithExpandedScrollAreas<T>(root: HTMLElement, fn: () => Promise<T>): Promise<T> {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-export-scroll]'))
  const saved = els.map(el => ({ maxHeight: el.style.maxHeight, overflowY: el.style.overflowY, overflowX: el.style.overflowX }))
  els.forEach(el => { el.style.maxHeight = 'none'; el.style.overflowY = 'visible'; el.style.overflowX = 'visible' })
  return fn().finally(() => els.forEach((el, i) => { el.style.maxHeight = saved[i].maxHeight; el.style.overflowY = saved[i].overflowY; el.style.overflowX = saved[i].overflowX }))
}

async function videoExportAsHtml(rootEl: HTMLElement, filename: string) {
  try {
    await videoWithExpandedScrollAreas(rootEl, async () => {
      const clone = rootEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[data-html2canvas-ignore]').forEach(el => el.remove())
      const varNames = ['bg', 's1', 's2', 'border', 'borderHard', 'text', 't2', 't3', 'accent', 'accentFg', 'accentSub', 'accentSubHard', 'primary', 'primaryFg', 'sidebar', 'code', 'shadow', 'shadowMd', 'ok', 'okBg', 'err', 'errBg', 'warn', 'warnBg', 'inputBg', 'inputBorder']
      const cs = getComputedStyle(rootEl)
      const varsCss = ':root{' + varNames.map(n => `--${n}:${cs.getPropertyValue('--' + n).trim()}`).join(';') + '}'
      let appCss = ''
      for (const sheet of Array.from(document.styleSheets)) {
        try { for (const rule of Array.from(sheet.cssRules)) appCss += rule.cssText + '\n' } catch { /* skip */ }
      }
      const overrideCss = `
html,body{height:auto!important;min-height:0!important;overflow:auto!important;margin:0!important}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-size-adjust:100%}
body{
  padding:clamp(28px,6vw,72px) clamp(20px,5vw,56px) clamp(48px,8vw,96px);
  background:var(--bg);
  color:var(--text);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;
}
[data-video-export-root]{width:100%!important;max-width:1120px;margin:0 auto;padding:0!important;border-radius:0!important}
[data-video-export-root] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;animation:none!important;transition:none!important}
[data-video-export-root] video{max-width:100%;max-height:260px;background:#000}
.overflow-hidden{overflow:visible!important}
[data-export-scroll]{max-height:none!important;overflow:visible!important}
@media print{
  body{padding:0;background:#fff}
  [data-video-export-root]{max-width:none}
  [data-video-export-root]>*{break-inside:avoid}
}
`
      const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>视频接口测试报告</title><style>${varsCss}\n${appCss}\n${overrideCss}</style></head><body>${clone.outerHTML}</body></html>`
      videoDownloadText(filename, htmlContent, 'text/html;charset=utf-8')
    })
  } catch (e) {
    console.error('[videoExportAsHtml]', e)
    window.alert('导出 HTML 失败，请稍后重试。')
  }
}

function videoExportFilename(): string {
  const t = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`
  return `videotest-report-${stamp}.html`
}

type VideoChFormState = { name: string; baseUrl: string; apiKey: string }

const VideoChannelsPane = React.memo(function VideoChannelsPane({
  channels, activeChId, chForm, editingChId,
  onSetActive, onEdit, onCopy, onDelete, onSave, onChFormChange, onClearForm,
}: {
  channels: VideoChannel[]; activeChId: string | null; chForm: VideoChFormState; editingChId: string | null
  onSetActive: (id: string) => void; onEdit: (c: VideoChannel) => void; onCopy: (c: VideoChannel) => void; onDelete: (id: string) => void
  onSave: () => void; onChFormChange: React.Dispatch<React.SetStateAction<VideoChFormState>>; onClearForm: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>已保存的渠道 <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ml-1" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{channels.length}</span></p>
        {channels.length === 0 && <p className="text-xs mb-3" style={{ color: 'var(--t3)' }}>还没有渠道，请在下方添加。</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {channels.map(c => (
            <div key={c.id} className="rounded-2xl p-4 relative" style={{ border: `1px solid ${c.id === activeChId ? 'var(--accent)' : 'var(--border)'}`, background: c.id === activeChId ? 'var(--accentSub)' : 'var(--s1)' }}>
              {c.id === activeChId && <span className="absolute top-3 right-4 text-[11px] font-bold" style={{ color: 'var(--accent)' }}>✓ 当前使用</span>}
              <div className="text-sm font-bold pr-16 truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
              <div className="text-xs break-all mt-1" style={{ color: 'var(--t3)' }}>{c.baseUrl}</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--t3)' }}>{c.keyMask || '（未设置）'}</div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Btn small variant="soft" onClick={() => onSetActive(c.id)}>设为当前</Btn>
                <Btn small variant="soft" onClick={() => onEdit(c)}>编辑</Btn>
                <Btn small variant="soft" onClick={() => onCopy(c)}>复制</Btn>
                <Btn small variant="danger" onClick={() => onDelete(c.id)}>删除</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>{editingChId ? '编辑渠道' : '添加新渠道'}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="block mb-1.5">渠道名称（自定义标识）</Label>
            <CustomInput value={chForm.name} onChange={v => onChFormChange(f => ({ ...f, name: v }))} placeholder="例如：主线-oinone" />
          </div>
          <div>
            <Label className="block mb-1.5">baseUrl</Label>
            <CustomInput value={chForm.baseUrl} onChange={v => onChFormChange(f => ({ ...f, baseUrl: v }))} placeholder="https://api.oinone.top" />
          </div>
        </div>
        <div className="mt-3">
          <Label className="block mb-1.5">apiKey {editingChId ? '（留空表示保持不变，本地加密存储）' : ''}</Label>
          <CustomInput value={chForm.apiKey} onChange={v => onChFormChange(f => ({ ...f, apiKey: v }))} type="password" placeholder="sk-xxxxxxxx" />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Btn variant="primary" small={false} onClick={onSave}>保存渠道</Btn>
          <Btn variant="soft" onClick={onClearForm}>清空表单</Btn>
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>baseUrl 填网关根，工具会拼 /byteplus/api/v3/... 与 OpenAPI。apiKey 经 AES-GCM 加密。</span>
        </div>
      </Card>
    </div>
  )
})

const VideoHistoryPane = React.memo(function VideoHistoryPane({
  history, channels, exportBusy, fChannel, fModel, fResult, requeryingIds,
  onFChannel, onFModel, onFResult, onStartExport, onClearAll, onDetail, onDeleteOne, onRestore, onDeleteBatch, onRequery,
}: {
  requeryingIds: Set<string>
  onRequery: (r: VideoRecord) => void
  history: VideoRecord[]; channels: VideoChannel[]; exportBusy: boolean
  fChannel: string; fModel: string; fResult: string
  onFChannel: (v: string) => void; onFModel: (v: string) => void; onFResult: (v: string) => void
  onStartExport: (records: VideoRecord[]) => void
  onClearAll: () => void; onDetail: (r: VideoRecord) => void; onDeleteOne: (id: string) => void
  onRestore: (b: VideoBatch) => void; onDeleteBatch: (b: VideoBatch) => void
}) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const batches = useMemo(() => {
    const filtered = history.filter(r => {
      if (fChannel && r.channelName !== fChannel) return false
      if (fModel && r.model !== fModel) return false
      if (fResult) {
        const k = videoClassify(r)
        if (fResult !== k) return false
      }
      return true
    })
    return videoGroupBatches(filtered)
  }, [history, fChannel, fModel, fResult])
  const models = useMemo(() => Array.from(new Set(history.map(r => r.model).filter(Boolean))), [history])
  const isOpen = (id: string, idx: number) => (idx === 0 ? !flipped.has(id) : flipped.has(id))
  const toggle = (id: string) => setFlipped(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>历史测试记录</p>
        <Btn small variant="danger" onClick={onClearAll}>清空全部</Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="w-40"><CustomSelect value={fChannel} onChange={onFChannel} options={[{ value: '', label: '全部渠道' }, ...channels.map(c => ({ value: c.name, label: c.name }))]} /></div>
        <div className="w-48"><CustomSelect value={fModel} onChange={onFModel} options={[{ value: '', label: '全部模型' }, ...models.map(m => ({ value: m, label: m }))]} /></div>
        <div className="w-32"><CustomSelect value={fResult} onChange={onFResult} options={[{ value: '', label: '全部结果' }, { value: 'pass', label: '通过' }, { value: 'fail', label: '未通过' }, { value: 'error', label: '请求失败' }]} /></div>
      </div>
      {batches.length === 0 && <p className="text-xs py-8 text-center" style={{ color: 'var(--t3)' }}>还没有历史记录</p>}
      <div className="flex flex-col gap-3">
        {batches.map((b, idx) => {
          const open = isOpen(b.id, idx)
          return (
            <div key={b.id} data-testid="videotest-batch" className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ background: 'var(--s1)' }}>
                <button className="text-left flex-1 min-w-0" onClick={() => toggle(b.id)}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {videoFmtTime(b.startAt)}
                    {b.legacy && <Badge>旧记录</Badge>}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
                    {b.channelName || '—'} · {b.models.join(' / ') || '—'} · {b.records.length} 个用例 · 通过 {b.passed}/{b.records.length}
                  </div>
                </button>
                <Btn small variant="soft" onClick={() => onRestore(b)}>↺ 还原到工作台</Btn>
                <Btn small variant="soft" disabled={exportBusy} onClick={() => onStartExport(b.records)}>导出 HTML</Btn>
                <Btn small variant="danger" onClick={() => onDeleteBatch(b)}>删除本批</Btn>
              </div>
              {open && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
                        <th className="px-3 py-2 font-semibold">用例</th>
                        <th className="px-3 py-2 font-semibold">判定</th>
                        <th className="px-3 py-2 font-semibold">HTTP</th>
                        <th className="px-3 py-2 font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.records.map(r => {
                        const k = videoClassify(r)
                        return (
                          <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td className="px-3 py-2">{r.caseName}</td>
                            <td className="px-3 py-2">{k === 'pass' ? <Badge color="ok">通过</Badge> : k === 'fail' ? <Badge color="err">未通过</Badge> : <Badge color="warn">失败</Badge>}</td>
                            <td className="px-3 py-2 font-mono">{r.status || '—'}</td>
                            <td className="px-3 py-2">
                              <Btn small variant="soft" onClick={() => onDetail(r)}>详情</Btn>
                              {videoCanRequery(r) && (
                                <Btn small variant="accent" disabled={requeryingIds.has(r.id)} onClick={() => onRequery(r)}>
                                  {requeryingIds.has(r.id) ? '查询中…' : '↻ 重试查询'}
                                </Btn>
                              )}
                              <Btn small variant="ghost" onClick={() => onDeleteOne(r.id)}>删除</Btn>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
})

function VideoApiTestTool() {
  const ui0 = videoLoadUi()
  const [pane, setPane] = useState<'test' | 'channels' | 'history'>('test')
  const [channels, setChannels] = useState<VideoChannel[]>(() => videoLoadChannels())
  const [activeChId, setActiveChId] = useState<string | null>(() => (typeof window === 'undefined' ? null : kvGet(VIDEO_ACTIVE_KEY)))
  const [model, setModel] = useState(ui0.model ?? VIDEO_DEFAULT_MODEL)
  const [prompt, setPrompt] = useState(ui0.prompt ?? VIDEO_DEFAULT_PROMPT)
  const [testMaterials, setTestMaterials] = useState(!!ui0.testMaterials)
  const [urls, setUrls] = useState<VideoMediaUrls>({
    firstFrame: videoUrlOrDefault(ui0.firstFrame, 'firstFrame'),
    lastFrame: videoUrlOrDefault(ui0.lastFrame, 'lastFrame'),
    refImage: videoUrlOrDefault(ui0.refImage, 'refImage'),
    refVideo: videoUrlOrDefault(ui0.refVideo, 'refVideo'),
    refAudio: videoUrlOrDefault(ui0.refAudio, 'refAudio'),
    sensitiveFace: videoUrlOrDefault(ui0.sensitiveFace, 'sensitiveFace'),
  })
  const [history, setHistory] = useState<VideoRecord[]>([])
  const [chForm, setChForm] = useState({ name: '', baseUrl: '', apiKey: '' })
  const [editingChId, setEditingChId] = useState<string | null>(null)
  const [cases, setCases] = useState<VideoCase[]>(() => videoBuildCases(!!ui0.testMaterials))
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState('')
  const [detailRec, setDetailRec] = useState<VideoRecord | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fChannel, setFChannel] = useState('')
  const [fModel, setFModel] = useState('')
  const [fResult, setFResult] = useState('')
  const [restoredFrom, setRestoredFrom] = useState<{ time: number; count: number } | null>(null)
  const [exportJob, setExportJob] = useState<VideoRecord[] | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [refVideoMeta, setRefVideoMeta] = useState<{ w: number; h: number; duration: number } | null>(null)
  const [refVideoErr, setRefVideoErr] = useState('')
  const reportRootRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<number | null>(null)
  const stopRef = useRef(false)
  const channelsRef = useRef(channels)
  const casesRef = useRef(cases)
  const historyRef = useRef(history)
  const urlsRef = useRef(urls)
  const assetsRef = useRef<VideoAssets>({ groupId: null })
  const currentRunIdRef = useRef<string | null>(null)
  /** 正在手动重试查询的记录 id（ref 供异步流程判重，state 供按钮渲染）与请求停止的 id */
  const requeryingRef = useRef<Set<string>>(new Set())
  const requeryCancelRef = useRef<Set<string>>(new Set())
  const [requeryingIds, setRequeryingIds] = useState<Set<string>>(new Set())
  const cancelRequery = (id: string) => { requeryCancelRef.current.add(id); toastShow('将在本次查询返回后停止') }

  useEffect(() => { channelsRef.current = channels }, [channels])
  useEffect(() => { casesRef.current = cases }, [cases])
  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => { urlsRef.current = urls }, [urls])

  useEffect(() => { try { kvSet(VIDEO_CH_KEY, JSON.stringify(channels)) } catch { /* ignore */ } }, [channels])
  useEffect(() => {
    try {
      if (activeChId) kvSet(VIDEO_ACTIVE_KEY, activeChId)
      else kvRemove(VIDEO_ACTIVE_KEY)
    } catch { /* ignore */ }
  }, [activeChId])
  useEffect(() => {
    let cancelled = false
    videoLoadHistory().then(list => { if (!cancelled) setHistory(list) })
    return () => { cancelled = true }
  }, [])
  useDebouncedPersist(() => {
    try {
      kvSet(VIDEO_UI_KEY, JSON.stringify({
        model, prompt, testMaterials,
        firstFrame: urls.firstFrame, lastFrame: urls.lastFrame,
        refImage: urls.refImage, refVideo: urls.refVideo, refAudio: urls.refAudio, sensitiveFace: urls.sensitiveFace,
      }))
    } catch { /* ignore */ }
  }, [model, prompt, testMaterials, urls])

  useEffect(() => {
    setCases(prev => videoMergeCases(prev, videoBuildCases(testMaterials)))
  }, [testMaterials])

  useEffect(() => {
    if (!exportJob) return
    const root = reportRootRef.current
    if (!root) { setExportJob(null); return }
    let cancelled = false
    ;(async () => {
      setExportBusy(true)
      try { await videoExportAsHtml(root, videoExportFilename()) }
      finally { if (!cancelled) { setExportBusy(false); setExportJob(null) } }
    })()
    return () => { cancelled = true }
  }, [exportJob])

  useEffect(() => {
    if (!previewUrl) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewUrl(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewUrl])

  const toastShow = (m: string) => {
    setToast(m)
    if (toastRef.current) window.clearTimeout(toastRef.current)
    toastRef.current = window.setTimeout(() => setToast(''), 2200)
  }

  const saveChannel = useCallback(async () => {
    const name = chForm.name.trim()
    const base = chForm.baseUrl.trim().replace(/\/+$/, '')
    const key = chForm.apiKey.trim()
    if (!name || !base) { toastShow('请填写渠道名称与 baseUrl'); return }
    let apiKeyEnc = ''
    let keyMask = ''
    if (key) {
      const enc = await encryptLlmApiKey(key)
      if (!enc) { toastShow('加密失败，请重试'); return }
      apiKeyEnc = enc
      keyMask = key.slice(0, 8) + '••••' + key.slice(-4)
    }
    if (editingChId) {
      const target = channels.find(x => x.id === editingChId)
      if (!target) return
      const nc: VideoChannel = { ...target, name, baseUrl: base }
      if (apiKeyEnc) { nc.apiKeyEnc = apiKeyEnc; nc.keyMask = keyMask }
      setChannels(channels.map(x => x.id === editingChId ? nc : x))
    } else {
      if (!apiKeyEnc) { toastShow('请填写 apiKey'); return }
      const nc: VideoChannel = { id: videoUid(), name, baseUrl: base, apiKeyEnc, keyMask }
      setChannels([...channels, nc])
      if (!activeChId) setActiveChId(nc.id)
    }
    setChForm({ name: '', baseUrl: '', apiKey: '' })
    setEditingChId(null)
    toastShow('已保存')
  }, [chForm, editingChId, channels, activeChId])

  const editChannel = useCallback((c: VideoChannel) => {
    setChForm({ name: c.name, baseUrl: c.baseUrl, apiKey: '' })
    setEditingChId(c.id)
    setPane('channels')
  }, [])
  const copyChannel = useCallback((c: VideoChannel) => {
    const name = uniqueCopyName(c.name, channels.map(x => x.name))
    setChannels([...channels, { ...c, id: videoUid(), name }])
    toastShow(`已复制为 ${name}`)
  }, [channels])
  const delChannel = useCallback((id: string) => {
    if (!window.confirm('删除该渠道？')) return
    setChannels(prev => prev.filter(x => x.id !== id))
    setActiveChId(prev => (prev === id ? null : prev))
  }, [])
  const clearChForm = useCallback(() => {
    setChForm({ name: '', baseUrl: '', apiKey: '' })
    setEditingChId(null)
  }, [])

  const probeRefVideo = async () => {
    const u = urls.refVideo.trim()
    if (!u) { setRefVideoMeta(null); setRefVideoErr(''); return }
    try {
      const m = await probeVideoMeta(u)
      setRefVideoMeta({ w: m.width, h: m.height, duration: m.duration })
      setRefVideoErr('')
    } catch (e: any) {
      setRefVideoMeta(null)
      setRefVideoErr(e?.message || '探测失败')
    }
  }

  const toggleExpand = (c: VideoCase) => { c.expanded = !c.expanded; setCases([...cases]) }
  const toggleSel = (c: VideoCase, v: boolean) => {
    c.selected = v
    setCases([...cases])
  }
  const toggleSelAll = (v: boolean) => {
    setCases(cases.map(c => ({ ...c, selected: v })))
  }

  const persistRecord = async (rec: VideoRecord) => {
    const histRec: VideoRecord = { ...rec, rawSnippet: rec.rawSnippet.length > 80_000 ? rec.rawSnippet.slice(0, 80_000) + '\n…' : rec.rawSnippet }
    const stale = historyRef.current.filter(r => r.runId === histRec.runId && r.caseName === histRec.caseName)
    const staleIds = new Set(stale.map(r => r.id))
    const next = videoTrimByBatch([histRec, ...historyRef.current.filter(r => !staleIds.has(r.id))])
    historyRef.current = next
    setHistory(next)
    historyDbPutOne('videotest', histRec)
      .then(() => staleIds.size ? historyDbDeleteMany('videotest', [...staleIds]) : undefined)
      .then(() => videoHistTrim())
      .catch(() => toastShow('历史记录写入失败'))
  }

  const sleep = (ms: number) => new Promise<void>(resolve => {
    const t = window.setTimeout(resolve, ms)
    const watch = window.setInterval(() => {
      if (stopRef.current) { window.clearTimeout(t); window.clearInterval(watch); resolve() }
    }, 200)
    window.setTimeout(() => window.clearInterval(watch), ms + 50)
  })

  const runOpenApi = async (c: VideoCase, ch: VideoChannel, apiKey: string, rec: VideoRecord) => {
    const built = videoBuildPlan(c.def, model, prompt, urlsRef.current, testMaterials, assetsRef.current)
    let plan = built.plan
    if (c.editedPreview != null) plan = videoParseEditedPreview(plan, c.editedPreview)
    rec.skippedRoles = built.skipped
    rec.sentPreview = JSON.stringify(plan.body, null, 2)
    if (c.kind === 'material-assets' && !assetsRef.current.groupId) {
      rec.ok = false
      rec.error = '请先运行「创建素材组」'
      rec.checks = videoBuildChecks(rec)
      return
    }

    if (c.kind === 'material-group') {
      const resp = await videoFetch(ch.baseUrl + plan.endpoint, VIDEO_REQUEST_TIMEOUT_MS, { method: 'POST', headers: videoHeaders(apiKey), body: JSON.stringify(plan.body) })
      const text = await resp.text()
      rec.status = resp.status
      rec.respHeaders = Object.fromEntries(resp.headers.entries())
      rec.reqId = rec.respHeaders['x-oneapi-request-id'] || rec.respHeaders['x-request-id'] || ''
      rec.rawSnippet = videoFormatBody(text)
      const json = videoParseJson(text)
      const err = videoOpenApiError(json, resp.status, text)
      const id = json?.Result?.Id || json?.Result?.id || json?.id
      if (err || !id) {
        rec.ok = false
        rec.error = err || '未返回素材组 Id'
      } else {
        rec.ok = true
        rec.taskId = String(id)
        assetsRef.current = { groupId: String(id) }
      }
      rec.checks = videoBuildChecks(rec)
      return
    }

    const items = (plan.body.items as Array<{ URL: string; Name: string; AssetType: string }> | undefined) || []
    if (!items.length) {
      rec.ok = false
      rec.error = '左栏没有可登记的素材 URL'
      rec.checks = videoBuildChecks(rec)
      return
    }
    const created: string[] = []
    let lastStatus = 0
    let lastText = ''
    for (const item of items) {
      if (stopRef.current) {
        rec.ok = false
        rec.error = created.length ? `已停止（已登记 ${created.join(', ')}）` : '已停止'
        rec.status = lastStatus
        rec.rawSnippet = lastText ? videoFormatBody(lastText) : rec.rawSnippet
        rec.taskId = created.join(', ') || null
        rec.checks = videoBuildChecks(rec)
        return
      }
      const body = { GroupId: assetsRef.current.groupId, URL: item.URL, Name: item.Name, AssetType: item.AssetType }
      const resp = await videoFetch(ch.baseUrl + '/byteplus/?Action=CreateAsset&Version=2024-01-01', VIDEO_REQUEST_TIMEOUT_MS, {
        method: 'POST', headers: videoHeaders(apiKey), body: JSON.stringify(body),
      })
      lastStatus = resp.status
      lastText = await resp.text()
      rec.respHeaders = Object.fromEntries(resp.headers.entries())
      const json = videoParseJson(lastText)
      const err = videoOpenApiError(json, resp.status, lastText)
      const id = json?.Result?.Id || json?.Result?.id
      if (err || !id) {
        rec.ok = false
        rec.error = `${item.Name}: ${err || '未返回素材 Id'}`
        rec.status = lastStatus
        rec.rawSnippet = videoFormatBody(lastText)
        rec.checks = videoBuildChecks(rec)
        return
      }
      const assetId = String(id)
      const t0 = Date.now()
      let status = 'Processing'
      while (Date.now() - t0 < VIDEO_ASSET_POLL_MAX_MS) {
        if (stopRef.current) break
        const q = await videoFetch(ch.baseUrl + '/byteplus/?Action=GetAsset&Version=2024-01-01', VIDEO_REQUEST_TIMEOUT_MS, {
          method: 'POST', headers: videoHeaders(apiKey), body: JSON.stringify({ Id: assetId }),
        })
        const qt = await q.text()
        lastStatus = q.status
        lastText = qt
        const qj = videoParseJson(qt)
        status = qj?.Result?.Status || qj?.Result?.status || ''
        rec.pollLog.push({ at: Date.now(), status })
        if (status === 'Active' || status === 'Failed') break
        await sleep(VIDEO_POLL_MS)
      }
      if (status !== 'Active') {
        rec.ok = false
        rec.error = `${item.Name}: 素材状态 ${status || '超时'}`
        rec.status = lastStatus
        rec.rawSnippet = videoFormatBody(lastText)
        rec.taskId = assetId
        rec.checks = videoBuildChecks(rec)
        return
      }
      const key = item.Name === 'first_frame' ? 'firstFrame'
        : item.Name === 'last_frame' ? 'lastFrame'
        : item.Name === 'reference_image' ? 'refImage'
        : item.Name === 'reference_video' ? 'refVideo'
        : 'refAudio'
      assetsRef.current = { ...assetsRef.current, [key]: assetId }
      created.push(`${item.Name}=${assetId}`)
    }
    rec.status = lastStatus
    rec.rawSnippet = videoFormatBody(lastText)
    rec.ok = true
    rec.taskId = created.join(', ')
    rec.checks = videoBuildChecks(rec)
  }

  const runTask = async (c: VideoCase, ch: VideoChannel, apiKey: string, rec: VideoRecord) => {
    const built = videoBuildPlan(c.def, model.trim() || VIDEO_DEFAULT_MODEL, prompt, urlsRef.current, testMaterials, assetsRef.current)
    if (built.missing) {
      rec.ok = false
      rec.error = testMaterials ? `缺少可用素材：${built.missing}（请先跑素材用例，或关闭「测试素材库」）` : built.missing
      rec.skippedRoles = built.skipped
      rec.checks = videoBuildChecks(rec)
      return
    }
    let plan = built.plan
    rec.targets = { ...built.targets }
    rec.skippedRoles = built.skipped
    if (c.editedPreview != null) plan = videoParseEditedPreview(plan, c.editedPreview)
    rec.sentPreview = JSON.stringify(plan.body, null, 2)

    const resp = await videoFetch(ch.baseUrl + plan.endpoint, VIDEO_SUBMIT_TIMEOUT_MS, {
      method: 'POST', headers: videoHeaders(apiKey), body: JSON.stringify(plan.body),
    })
    const text = await resp.text()
    rec.status = resp.status
    rec.respHeaders = Object.fromEntries(resp.headers.entries())
    rec.reqId = rec.respHeaders['x-oneapi-request-id'] || rec.respHeaders['x-request-id'] || ''
    rec.rawSnippet = videoFormatBody(text)
    const json = videoParseJson(text)
    rec.errorDetail = parseVideoTaskError(json).detail
    const submitErr = videoOpenApiError(json, resp.status, text) || videoTaskError(json)
    const taskId = videoExtractTaskId(json)
    if (resp.status >= 400 || !taskId) {
      rec.ok = false
      rec.error = submitErr || '未返回任务 id'
      rec.checks = videoBuildChecks(rec)
      return
    }
    rec.taskId = taskId
    rec.taskStatus = videoExtractStatus(json) || 'queued'
    rec.pollLog.push({ at: Date.now(), status: rec.taskStatus })

    const polled = await pollTask(rec, ch, apiKey, json, () => stopRef.current)
    if (polled.stopped) {
      rec.ok = false
      rec.error = '已停止轮询'
      rec.checks = videoBuildChecks(rec)
      return
    }
    await finalizeTask(rec, polled.lastJson)
  }

  /**
   * 轮询任务直到 succeeded / failed、超过 VIDEO_POLL_MAX_MS 或 shouldStop 返回 true。
   * `immediate` 为 true 时先查一次再睡（手动重试查询用：用户点了就该立刻看到最新状态）。
   */
  const pollTask = async (
    rec: VideoRecord, ch: VideoChannel, apiKey: string, initialJson: any,
    shouldStop: () => boolean, immediate = false,
  ): Promise<{ lastJson: any; stopped: boolean }> => {
    const pollUrl = `${ch.baseUrl}/byteplus/api/v3/contents/generations/tasks/${encodeURIComponent(rec.taskId || '')}`
    const t0 = Date.now()
    let lastJson: any = initialJson
    let first = immediate
    while (Date.now() - t0 < VIDEO_POLL_MAX_MS) {
      if (shouldStop()) return { lastJson, stopped: true }
      const st = videoExtractStatus(lastJson)
      if (!first && (videoTaskSucceeded(st) || videoTaskFailed(st))) break
      if (!first) {
        await sleep(VIDEO_POLL_MS)
        if (shouldStop()) return { lastJson, stopped: true }
      }
      first = false
      rec.pollCount += 1
      const q = await videoFetch(pollUrl, VIDEO_REQUEST_TIMEOUT_MS, { headers: { Authorization: `Bearer ${apiKey}` } })
      const qt = await q.text()
      rec.status = q.status
      rec.respHeaders = Object.fromEntries(q.headers.entries())
      rec.reqId = rec.reqId || rec.respHeaders['x-oneapi-request-id'] || rec.respHeaders['x-request-id'] || ''
      rec.rawSnippet = videoFormatBody(qt)
      lastJson = videoParseJson(qt)
      rec.taskStatus = videoExtractStatus(lastJson) || rec.taskStatus
      rec.pollLog.push({ at: Date.now(), status: rec.taskStatus || '', progress: lastJson?.progress || lastJson?.data?.progress })
      if (q.status >= 400) break
    }
    return { lastJson, stopped: false }
  }

  /** 轮询结束后：从最后一次响应里取状态 / video_url / 回显字段，成片则探测元数据，最后生成校验项 */
  const finalizeTask = async (rec: VideoRecord, lastJson: any) => {
    rec.taskStatus = videoExtractStatus(lastJson) || rec.taskStatus
    rec.videoUrl = videoExtractVideoUrl(lastJson)
    const echo = videoExtractEcho(lastJson)
    if (echo.ratio) rec.targets.echoRatio = echo.ratio
    if (echo.duration != null && !Number.isNaN(echo.duration)) rec.targets.echoDuration = echo.duration
    if (echo.resolution) rec.targets.echoResolution = echo.resolution
    if (typeof echo.seed === 'number') rec.targets.echoSeed = echo.seed
    const usage = lastJson?.usage || lastJson?.data?.usage || lastJson?.data?.data?.usage
    if (usage && typeof usage === 'object') rec.usage = usage

    const failed = videoTaskFailed(rec.taskStatus || '')
    const succeeded = videoTaskSucceeded(rec.taskStatus || '')
    rec.errorDetail = parseVideoTaskError(lastJson).detail
    if (failed || !succeeded || !rec.videoUrl) {
      rec.ok = false
      rec.error = videoTaskError(lastJson) || videoOpenApiError(lastJson, rec.status, rec.rawSnippet) || (failed ? '任务失败' : succeeded ? '未返回 video_url' : `轮询超时（${VIDEO_POLL_MAX_MS / 60000} 分钟）任务仍未结束，可稍后「重试查询」`)
      rec.checks = videoBuildChecks(rec)
      return
    }

    try {
      const meta = await probeVideoMeta(rec.videoUrl, 20000, { detectAudio: typeof rec.targets.generate_audio === 'boolean' })
      rec.probe = { w: meta.width, h: meta.height, duration: meta.duration, hasAudio: meta.hasAudio }
      rec.ok = true
      rec.error = null
    } catch (e: any) {
      rec.ok = true
      rec.probe = null
      rec.error = e?.message || '成片元数据不可读'
    }
    rec.checks = videoBuildChecks(rec)
  }

  /**
   * 手动重试查询：对「已拿到任务 id 但没等到终态」的记录（轮询超时 / 网络中断 / 手动停止）重新 GET 任务，
   * 拿到结果后按正常流程判定，并原地更新工作台与历史里的同一条记录（id 不变，不新增）。
   */
  const requeryRecord = async (rec: VideoRecord) => {
    if (!videoCanRequery(rec)) { toastShow('这条记录没有可查询的任务 id'); return }
    if (requeryingRef.current.has(rec.id)) return
    const ch = channelsRef.current.find(x => x.name === rec.channelName)
      || channelsRef.current.find(x => x.id === activeChId)
    if (!ch) { toastShow('找不到可用渠道：请先在「渠道管理」添加渠道'); return }
    const apiKey = await decryptLlmApiKey(ch.apiKeyEnc)
    if (!apiKey) { toastShow('渠道 API Key 无效，请重新编辑保存'); return }
    if (ch.name !== rec.channelName) toastShow(`未找到记录里的渠道「${rec.channelName}」，改用当前渠道「${ch.name}」查询`)

    requeryingRef.current.add(rec.id)
    setRequeryingIds(new Set(requeryingRef.current))
    const next: VideoRecord = { ...rec, targets: { ...rec.targets }, pollLog: [...rec.pollLog, { at: Date.now(), status: '↻ 手动重试查询' }], checks: [] }
    const t0 = performance.now()
    let cancelled = false
    try {
      const polled = await pollTask(next, ch, apiKey, null, () => requeryCancelRef.current.has(rec.id), true)
      if (polled.stopped) {
        cancelled = true
        next.ok = false
        next.error = '已停止查询'
        next.checks = videoBuildChecks(next)
      } else {
        await finalizeTask(next, polled.lastJson)
      }
    } catch (e: any) {
      next.ok = false
      next.error = e?.name === 'AbortError' ? `轮询请求超时（单次 ${VIDEO_REQUEST_TIMEOUT_MS / 1000}s）` : (e?.message || String(e))
      next.checks = videoBuildChecks(next)
    } finally {
      requeryingRef.current.delete(rec.id)
      requeryCancelRef.current.delete(rec.id)
      setRequeryingIds(new Set(requeryingRef.current))
    }
    next.durationMs = (rec.durationMs || 0) + Math.round(performance.now() - t0)
    next.ok = videoSettleOk(next)
    replaceRecord(next)
    if (!cancelled) {
      const st = next.taskStatus || ''
      toastShow(videoTaskSucceeded(st) ? '任务已完成，结果已更新' : videoTaskFailed(st) ? `任务 ${st}，结果已更新` : `任务仍是 ${st || '未知'}，可稍后再试`)
    }
  }

  /** 按 id 原地替换一条记录：历史列表 + IndexedDB + 工作台里引用它的用例 + 打开中的详情弹窗 */
  const replaceRecord = (next: VideoRecord) => {
    const histRec: VideoRecord = { ...next, rawSnippet: next.rawSnippet.length > 80_000 ? next.rawSnippet.slice(0, 80_000) + '\n…' : next.rawSnippet }
    if (historyRef.current.some(r => r.id === next.id)) {
      const list = historyRef.current.map(r => (r.id === next.id ? histRec : r))
      historyRef.current = list
      setHistory(list)
      historyDbPutOne('videotest', histRec).catch(() => toastShow('历史记录写入失败'))
    }
    let touched = false
    for (const c of casesRef.current) {
      if (c.result?.id === next.id) {
        c.result = next
        c.status = videoCaseStatus(next)
        touched = true
      }
    }
    if (touched) setCases([...casesRef.current])
    setDetailRec(cur => (cur && cur.id === next.id ? next : cur))
  }

  const runCase = async (c: VideoCase) => {
    if (running && c.status !== 'running') { toastShow('正在批量运行中'); return }
    const ch = channelsRef.current.find(x => x.id === activeChId)
    if (!ch) { toastShow('请先在「渠道管理」添加并选择渠道'); return }
    const m = model.trim() || VIDEO_DEFAULT_MODEL
    const apiKey = await decryptLlmApiKey(ch.apiKeyEnc)
    if (!apiKey) { toastShow('渠道 API Key 无效，请重新编辑保存'); return }
    if (!currentRunIdRef.current) currentRunIdRef.current = videoUid()

    c.status = 'running'
    c.expanded = true
    c.result = null
    setCases([...casesRef.current])

    const t0 = performance.now()
    const rec: VideoRecord = {
      id: videoUid(), runId: currentRunIdRef.current, time: Date.now(),
      caseName: c.name, caseDesc: c.desc, channelName: ch.name, model: m, prompt,
      kind: c.kind, caseId: c.id, expect: videoExpectFor(c.def, m), testMaterials, targets: {}, skippedRoles: [],
      status: 0, respHeaders: {}, reqId: '', sentPreview: '',
      ok: false, error: null, rawSnippet: '', taskId: null, taskStatus: null, pollCount: 0,
      videoUrl: null, probe: null, usage: null, durationMs: 0, checks: [], pollLog: [],
    }
    try {
      if (c.kind === 'material-group' || c.kind === 'material-assets') await runOpenApi(c, ch, apiKey, rec)
      else await runTask(c, ch, apiKey, rec)
    } catch (e: any) {
      rec.ok = false
      rec.error = e?.name === 'AbortError'
        ? (rec.taskId ? `轮询请求超时（单次 ${VIDEO_REQUEST_TIMEOUT_MS / 1000}s）` : `提交请求超时（${VIDEO_SUBMIT_TIMEOUT_MS / 60000} 分钟内网关未返回任务 id，通常卡在素材转换）`)
        : (e?.message || String(e))
      rec.checks = videoBuildChecks(rec)
    }
    rec.durationMs = Math.round(performance.now() - t0)
    if (!rec.checks.length) rec.checks = videoBuildChecks(rec)
    rec.ok = videoSettleOk(rec)
    c.status = videoCaseStatus(rec)
    c.result = rec
    await persistRecord(rec)
    setCases([...casesRef.current])
  }

  const resetRun = () => {
    setCases(cs => cs.map(c => ({ ...c, status: 'idle' as const, result: null })))
    currentRunIdRef.current = null
    assetsRef.current = { groupId: null }
    setRestoredFrom(null)
  }

  const runList = async (list: VideoCase[]) => {
    if (running) { toastShow('已有运行中'); return }
    const ordered = videoRetrySort(list)
    setRunning(true)
    currentRunIdRef.current = videoUid()
    assetsRef.current = { groupId: null }
    setRestoredFrom(null)
    stopRef.current = false
    try {
      for (const c of ordered) {
        if (stopRef.current) break
        try { await runCase(c) } catch { /* continue */ }
      }
    } finally {
      setRunning(false)
      stopRef.current = false
    }
    toastShow('批量测试结束')
  }

  /** 只重跑已勾选的请求失败用例，留在当前批：能查的只查，其余整单重提 */
  const runErrorRetries = async () => {
    if (running) { toastShow('已有运行中'); return }
    const list = videoRetryTargets(casesRef.current)
    if (!list.length) { toastShow('请先勾选请求失败的用例'); return }
    setRunning(true)
    stopRef.current = false
    try {
      for (const c of list) {
        if (stopRef.current) break
        try {
          if (c.result && videoRetryAction(c.result) === 'requery') await requeryRecord(c.result)
          else await runCase(c)
        } catch { /* continue */ }
      }
    } finally {
      setRunning(false)
      stopRef.current = false
    }
    toastShow('错误重试结束')
  }

  const requestStop = () => {
    stopRef.current = true
    for (const id of requeryingRef.current) requeryCancelRef.current.add(id)
    toastShow('将在当前用例结束后停止')
  }

  const selCases = cases.filter(c => c.selected)
  const selAll = cases.length > 0 && cases.every(c => c.selected)
  const doneCount = cases.filter(c => c.status === 'pass' || c.status === 'fail' || c.status === 'error').length
  const passCount = cases.filter(c => c.status === 'pass').length
  const failCount = cases.filter(c => c.status === 'fail' || c.status === 'error').length

  const statusBadge = (c: VideoCase) => {
    if (c.status === 'running') {
      return <Badge><span className="inline-block w-3 h-3 rounded-full border-2 animate-spin align-middle" style={{ borderColor: 'var(--accentSub)', borderTopColor: 'var(--accent)' }} /> 运行中</Badge>
    }
    const negRejected = c.result && videoIsNegative(c.result) && c.result.checks.some(x => VIDEO_NEGATIVE_CHECK_NAMES.includes(x.name) && !x.info && x.pass)
    if (c.status === 'pass' && negRejected) return <Badge color="ok">✓ 已拒绝</Badge>
    if (c.status === 'pass') { const v = c.result ? videoVerdict(c.result.checks) : null; return <Badge color="ok">✓ {v ? v.text : '通过'}</Badge> }
    if (c.status === 'fail') { const v = c.result ? videoVerdict(c.result.checks) : null; return <Badge color="err">✕ {v ? v.text : '未通过'}</Badge> }
    if (c.status === 'error' && c.result && videoIsNegative(c.result)) {
      return videoNegativeOutcome(c.result).produced ? <Badge color="err">✕ 未被拒绝</Badge> : <Badge color="warn">! 请求异常</Badge>
    }
    if (c.status === 'error') return <Badge color="warn">! 请求失败</Badge>
    return <Badge>待运行</Badge>
  }

  const renderChecks = (r: VideoRecord) => (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
            <th className="px-3 py-2 font-semibold">校验项</th>
            <th className="px-3 py-2 font-semibold">请求</th>
            <th className="px-3 py-2 font-semibold">实际</th>
            <th className="px-3 py-2 font-semibold">结果</th>
          </tr>
        </thead>
        <tbody>
          {r.checks.map((x, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="px-3 py-2">{x.name}</td>
              <td className="px-3 py-2 font-mono">{String(x.target)}</td>
              <td className="px-3 py-2 font-mono">{String(x.actual)}</td>
              <td className="px-3 py-2">{x.info ? <Badge>信息</Badge> : (x.pass ? <Badge color="ok">通过</Badge> : <Badge color="err">未通过</Badge>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderResultBody = (r: VideoRecord, opts: { defaultOpenReq?: boolean } = {}) => (
    <div className="flex flex-col gap-4">
      {r.checks.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>校验结果</p>
          {renderChecks(r)}
        </div>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--t2)' }}>
        <span>HTTP <b style={{ color: 'var(--text)' }}>{r.status}</b></span>
        <span>耗时 <b style={{ color: 'var(--text)' }}>{r.durationMs}ms</b></span>
        {r.taskStatus && <span>任务 <b style={{ color: 'var(--text)' }}>{r.taskStatus}</b></span>}
        {r.pollCount > 0 && <span>轮询 <b style={{ color: 'var(--text)' }}>{r.pollCount}</b> 次</span>}
        {r.probe && <span>成片 <b style={{ color: 'var(--text)' }}>{r.probe.w}×{r.probe.h} · {vidFormatDuration(r.probe.duration)}</b></span>}
      </div>
      <div className="inline-flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 text-xs"
        style={{ background: 'var(--warnBg)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)', color: 'var(--warn)' }}>
        x-oneapi-request-id: <span className="font-mono font-bold">{r.reqId ? videoEsc(r.reqId) : '（未在响应头中读取到）'}</span>
      </div>
      {videoCanRequery(r) && (
        <div data-html2canvas-ignore className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 text-xs"
          style={{ background: 'var(--accentSub)', border: '1px solid var(--border)', color: 'var(--t2)' }}>
          <span>任务 <span className="font-mono" style={{ color: 'var(--text)' }}>{videoEsc(r.taskId || '')}</span> 尚未拿到终态（任务 id 服务端保留 7 天），可重新查询</span>
          <div className="ml-auto flex gap-2">
            {requeryingIds.has(r.id)
              ? <Btn small variant="danger" onClick={() => cancelRequery(r.id)}>■ 停止查询</Btn>
              : <Btn small variant="accent" onClick={() => requeryRecord(r)}>↻ 重试查询</Btn>}
          </div>
        </div>
      )}
      {requeryingIds.has(r.id) && (
        <div data-html2canvas-ignore className="flex items-center gap-2 text-xs" style={{ color: 'var(--t2)' }}>
          <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accentSub)', borderTopColor: 'var(--accent)' }} />
          正在查询任务状态…
        </div>
      )}
      {r.error && (videoIsNegative(r) && r.ok ? (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--okBg)', border: '1px solid color-mix(in srgb, var(--ok) 35%, transparent)', color: 'var(--ok)' }}>
          <b>拒绝原因：</b>{videoEsc(r.error)}
        </div>
      ) : (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--errBg)', border: '1px solid color-mix(in srgb, var(--err) 35%, transparent)', color: 'var(--err)' }}>
          <b>错误：</b>{videoEsc(r.error)}
        </div>
      ))}
      {r.videoUrl && (
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>成片（链接约 24h 过期）</p>
          <div className="rounded-xl overflow-hidden cursor-zoom-in" style={{ border: '1px solid var(--border)', background: '#000' }}
            onClick={() => setPreviewUrl(r.videoUrl)}>
            <video src={r.videoUrl} muted playsInline preload="metadata" className="w-full max-h-[260px] object-contain"
              onLoadedMetadata={e => { try { e.currentTarget.currentTime = Math.min(0.1, (e.currentTarget.duration || 1) / 2) } catch { /* ignore */ } }} />
          </div>
          <a href={r.videoUrl} target="_blank" rel="noreferrer" className="text-[11px] font-mono break-all mt-1.5 inline-block" style={{ color: 'var(--accent)' }}>{r.videoUrl}</a>
        </div>
      )}
      {r.pollLog.length > 0 && (
        <details className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>轮询时间线（{r.pollLog.length}）</summary>
          <pre data-export-scroll className="p-3 text-[11px] font-mono overflow-auto max-h-[16rem] whitespace-pre-wrap" style={{ color: 'var(--t2)' }}>
            {r.pollLog.map(t => `${videoFmtTime(t.at)}  ${t.status}${t.progress ? '  ' + t.progress : ''}`).join('\n')}
          </pre>
        </details>
      )}
      <div className="flex flex-col gap-2">
        {[
          ['响应头', JSON.stringify(r.respHeaders || {}, null, 2), false],
          ['响应体', videoFormatBody(r.rawSnippet || ''), false],
          ['已发送的请求体', r.sentPreview || '', true],
        ].map(([label, body, isReq]) => (
          <details key={label as string} open={isReq ? opts.defaultOpenReq : undefined} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>{label as string}</summary>
            <pre data-export-scroll className="p-3 text-[11px] font-mono overflow-auto max-h-[32rem] whitespace-pre-wrap break-all leading-relaxed" style={{ color: 'var(--t2)' }}>{videoEsc(body)}</pre>
          </details>
        ))}
      </div>
    </div>
  )

  const renderCaseRow = (c: VideoCase, i: number) => {
    const m = model.trim() || VIDEO_DEFAULT_MODEL
    const built = videoBuildPlan(c.def, m, prompt, urls, testMaterials, assetsRef.current)
    const preview = c.editedPreview != null ? c.editedPreview : videoPlanPreview(built.plan)
    const expect = videoExpectFor(c.def, m)
    const statusColor = c.status === 'running' ? 'var(--accent)' : c.status === 'pass' ? 'var(--ok)' : c.status === 'fail' ? 'var(--err)' : c.status === 'error' ? 'var(--warn)' : 'transparent'
    return (
      <div key={c.id} data-case-name={c.name} className="rounded-2xl overflow-hidden transition-all duration-150"
        style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${statusColor}`, background: 'var(--bg)', marginBottom: 10, boxShadow: c.status === 'running' ? '0 0 0 3px var(--accentSub)' : 'none' }}>
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:opacity-90" onClick={() => toggleExpand(c)}>
          <input type="checkbox" className="w-4 h-4 cursor-pointer flex-shrink-0" style={{ accentColor: 'var(--accent)' }} checked={c.selected}
            onChange={e => toggleSel(c, e.target.checked)} onClick={e => e.stopPropagation()} />
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--s1)', color: 'var(--t2)' }}>{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold flex-wrap" style={{ color: 'var(--text)' }}>
              <span>{c.name}</span>
              {c.kind.startsWith('material') && <Badge>素材</Badge>}
              {expect === 'reject' && <Badge color="warn">预期拒绝</Badge>}
              {expect === 'unsupported' && <Badge>预期不支持</Badge>}
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--t3)' }}>{c.desc}</div>
          </div>
          <div className="flex-shrink-0">{statusBadge(c)}</div>
          <span className="text-[10px] transition-transform duration-200 flex-shrink-0" style={{ color: 'var(--t3)', transform: c.expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
        </div>
        {c.expanded && (
          <div className="px-4 pb-4 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--border)', background: 'var(--s1)' }}>
            <p className="text-xs" style={{ color: 'var(--t2)' }}>{c.desc}</p>
            {built.skipped.length > 0 && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--accentSub)', color: 'var(--t2)' }}>
                {built.skipped.join('；')}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--t3)', letterSpacing: '0.05em' }}>请求预览（可编辑）</span>
                <div className="flex gap-2">
                  <Btn small variant="soft" onClick={() => { c.editedPreview = null; setCases([...cases]) }}>重置为默认</Btn>
                  <Btn small variant="accent" disabled={c.status === 'running'} onClick={() => { c.expanded = true; runCase(c) }}>▶ 运行此用例</Btn>
                </div>
              </div>
              <div className="text-[11px] font-mono mb-1.5" style={{ color: 'var(--t3)' }}>{built.plan.method} {built.plan.endpoint}</div>
              <CustomTextarea value={preview} mono rows={Math.min(16, preview.split('\n').length + 1)}
                onChange={v => { c.editedPreview = v; setCases([...cases]) }} />
            </div>
            {c.result && renderResultBody(c.result)}
          </div>
        )}
      </div>
    )
  }

  const restoreBatch = useCallback((batch: VideoBatch) => {
    if (casesRef.current.some(c => c.result) && !window.confirm('当前页已有结果，还原将覆盖工作台，继续？')) return
    const nextCases = videoBuildCases(batch.records.some(r => r.testMaterials))
    const byName = new Map(batch.records.map(r => [r.caseName, r]))
    const byId = new Map(batch.records.filter(r => r.caseId).map(r => [r.caseId!, r]))
    let restored = 0
    for (const c of nextCases) {
      const hit = byId.get(c.id) || byName.get(c.name)
      if (!hit) continue
      c.result = hit
      c.status = videoClassify(hit) === 'pass' ? 'pass' : videoClassify(hit) === 'fail' ? 'fail' : 'error'
      c.expanded = true
      restored++
    }
    setTestMaterials(batch.records.some(r => r.testMaterials))
    setCases(nextCases)
    casesRef.current = nextCases
    if (batch.models[0]) setModel(batch.models[0])
    const generic = batch.records.find(r => r.prompt)
    if (generic?.prompt) setPrompt(generic.prompt)
    const ch = channelsRef.current.find(x => x.name === batch.channelName)
    if (ch) setActiveChId(ch.id)
    currentRunIdRef.current = batch.id.startsWith('legacy:') ? null : batch.id
    setRestoredFrom({ time: batch.endAt, count: restored })
    setPane('test')
    toastShow(`已还原 ${videoFmtTime(batch.endAt).slice(11, 16)} 那一轮（${restored} 条）` + (ch ? '' : ' · 未找到同名渠道，请手动选择'))
  }, [])

  const clearAllHistory = () => {
    if (!window.confirm('清空全部历史记录？')) return
    setHistory([]); historyDbClear('videotest').catch(() => {}); toastShow('已清空')
  }
  const deleteHistOne = (id: string) => {
    setHistory(prev => prev.filter(r => r.id !== id))
    historyDbDeleteOne('videotest', id).catch(() => {})
  }
  const deleteHistBatch = (b: VideoBatch) => {
    if (!window.confirm(`删除本批 ${b.records.length} 条记录？`)) return
    const ids = b.records.map(r => r.id)
    setHistory(prev => prev.filter(r => !ids.includes(r.id)))
    historyDbDeleteMany('videotest', ids).catch(() => {})
  }

  const leftPanel = (
    <div className="w-[340px] flex-shrink-0 overflow-y-auto p-5 flex flex-col gap-4">
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>本次测试配置 <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>Seedance 火山原生</span></p>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="block mb-1.5">使用渠道</Label>
            <CustomSelect value={activeChId ?? ''} onChange={v => setActiveChId(v)} options={channels.map(c => ({ value: c.id, label: c.name }))} />
            {channels.length === 0 && <p className="text-xs mt-1.5" style={{ color: 'var(--warn)' }}>⚠ 请先到「渠道管理」标签页添加渠道。</p>}
          </div>
          <div>
            <Label className="block mb-1.5">模型编码</Label>
            <EditableSelect value={model} onChange={setModel} options={VIDEO_MODEL_OPTIONS} placeholder="doubao-seedance-2-0" />
          </div>
          <div>
            <Label className="block mb-1.5">提示词</Label>
            <CustomTextarea value={prompt} onChange={setPrompt} rows={3} placeholder={VIDEO_DEFAULT_PROMPT} />
          </div>
          <Toggle value={testMaterials} onChange={setTestMaterials} label="测试素材库" />
          <p className="text-[11px] -mt-1" style={{ color: 'var(--t3)' }}>开启后先登记素材，媒体用例改写成 asset://；关闭则直接用下方 https 地址。</p>
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>素材 URL <span className="text-xs font-normal" style={{ color: 'var(--t3)' }}>可改，空值则跳过该角色</span></p>
        <p className="text-[11px] mb-3 -mt-1.5" style={{ color: 'var(--t3)' }}>默认是火山方舟官方文档的示例素材。链接由网关服务端拉取：需公网可匿名访问（Wikimedia 等对非浏览器 UA / 数据中心 IP 会 403、429），图片宽高 ≥300px、宽高比 0.4~2.5。</p>
        <div className="flex flex-col gap-3">
          <div data-testid="videotest-first-frame">
            <Label className="block mb-1.5">首帧</Label>
            <CustomInput value={urls.firstFrame} onChange={v => setUrls(u => ({ ...u, firstFrame: v }))} placeholder="https://…" />
          </div>
          <div data-testid="videotest-last-frame">
            <Label className="block mb-1.5">尾帧</Label>
            <CustomInput value={urls.lastFrame} onChange={v => setUrls(u => ({ ...u, lastFrame: v }))} placeholder="https://…" />
          </div>
          <div data-testid="videotest-ref-image">
            <Label className="block mb-1.5">参考图</Label>
            <CustomInput value={urls.refImage} onChange={v => setUrls(u => ({ ...u, refImage: v }))} placeholder="https://…" />
          </div>
          <div data-testid="videotest-ref-video">
            <Label className="block mb-1.5">参考视频</Label>
            <CustomInput value={urls.refVideo} onChange={v => setUrls(u => ({ ...u, refVideo: v }))} placeholder="https://…" onBlur={probeRefVideo} />
            <div className="flex gap-2 mt-1.5">
              <Btn small variant="soft" onClick={probeRefVideo}>探测元数据</Btn>
            </div>
            {refVideoMeta && (
              <p className="text-[11px] mt-1.5 font-mono" style={{ color: 'var(--t2)' }}>
                {refVideoMeta.w}×{refVideoMeta.h} · {vidFormatDuration(refVideoMeta.duration)} · {vidAspectRatio(refVideoMeta.w, refVideoMeta.h)}
              </p>
            )}
            {refVideoErr && <p className="text-[11px] mt-1.5" style={{ color: 'var(--err)' }}>{refVideoErr}</p>}
            {urls.refVideo.trim() && (
              <video src={urls.refVideo.trim()} muted playsInline preload="metadata" className="mt-2 w-full rounded-lg max-h-28 object-contain" style={{ background: '#000', border: '1px solid var(--border)' }} />
            )}
          </div>
          <div data-testid="videotest-ref-audio">
            <Label className="block mb-1.5">参考音频</Label>
            <CustomInput value={urls.refAudio} onChange={v => setUrls(u => ({ ...u, refAudio: v }))} placeholder="https://…" />
          </div>
          <div data-testid="videotest-sensitive-face" className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Label className="block mb-1.5">敏感人像</Label>
            <CustomInput value={urls.sensitiveFace} onChange={v => setUrls(u => ({ ...u, sensitiveFace: v }))} placeholder="https://…（名人 / 真人正脸）" />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--t3)' }}>只给「拒绝 · 名人首帧」用，始终 https 直链、不登记进素材库；默认是 Wikimedia 上的赵丽颖发布会照。</p>
          </div>
        </div>
      </Card>
    </div>
  )

  const renderTestPane = () => (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>测试用例</p>
          <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>{cases.length}</span>
          <span className="text-xs" style={{ color: 'var(--t3)' }}>· 火山原生 · {testMaterials ? '含素材库' : '仅生视频'}</span>
        </div>
        {restoredFrom && (
          <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2.5 mb-3 text-xs" data-testid="videotest-restored-note"
            style={{ background: 'var(--accentSub)', border: '1px solid var(--border)', color: 'var(--t2)' }}>
            <span>当前是 <b style={{ color: 'var(--text)' }}>{videoFmtTime(restoredFrom.time)}</b> 那一轮的历史结果（{restoredFrom.count} 条）· 成片只留 URL/封面，TOS 可能过期</span>
            <div className="ml-auto"><Btn small variant="ghost" onClick={resetRun}>清除</Btn></div>
          </div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap rounded-xl px-3 py-2.5 mb-3" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" className="w-4 h-4 cursor-pointer" style={{ accentColor: 'var(--accent)' }} checked={selAll} onChange={e => toggleSelAll(e.target.checked)} />
            全选
          </label>
          <Btn small variant="primary" disabled={running} onClick={() => runList(cases.slice())}>▶ 全部运行</Btn>
          <Btn small variant="soft" disabled={running} onClick={() => { if (!selCases.length) { toastShow('请先选择用例'); return } runList(selCases.slice()) }}>▶ 运行选中</Btn>
          <Btn small variant="soft" disabled={running} onClick={() => runErrorRetries()}>↻ 重试错误</Btn>
          <Btn small variant="soft" disabled={running} onClick={async () => {
            const next = cases.find(c => c.selected && c.status === 'idle')
            if (!next) { toastShow('没有更多待运行的选中用例'); return }
            await runCase(next)
          }}>→ 逐个：运行下一个</Btn>
          <Btn small variant="ghost" disabled={running} onClick={resetRun}>↺ 重置状态</Btn>
          <Btn small variant="danger" disabled={!running} onClick={requestStop}>■ 停止</Btn>
          <Btn small variant="soft" disabled={exportBusy || !cases.some(c => c.selected && c.result)}
            title="只导出已勾选且有结果的用例"
            onClick={() => setExportJob(cases.filter(c => c.selected && c.result).map(c => c.result!))}>导出 HTML</Btn>
          <div className="flex-1 min-w-40 h-2 rounded-full overflow-hidden" style={{ background: 'var(--s2)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ background: 'var(--accent)', width: (cases.length ? (doneCount / cases.length * 100) : 0) + '%' }} />
          </div>
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--t2)' }}>
            已选 <b style={{ color: 'var(--text)' }}>{selCases.length}</b> / 已完成 <b style={{ color: 'var(--text)' }}>{doneCount}</b> · 通过 <b style={{ color: 'var(--ok)' }}>{passCount}</b> · 未通过 <b style={{ color: failCount ? 'var(--err)' : 'var(--t2)' }}>{failCount}</b>
          </span>
        </div>
        <div className="flex flex-col">
          {cases.map((c, i) => renderCaseRow(c, i))}
        </div>
      </Card>
    </div>
  )

  return (
    <div className="h-full flex" style={{ background: 'transparent' }}>
      {leftPanel}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="glass flex items-center px-6 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <SegmentedControl value={pane} onChange={v => setPane(v as 'test' | 'channels' | 'history')} options={[
            { value: 'test', label: '批量测试' },
            { value: 'channels', label: '渠道管理' },
            { value: 'history', label: `历史记录 (${history.length})` },
          ]} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {pane === 'test' && renderTestPane()}
          {pane === 'channels' && (
            <VideoChannelsPane
              channels={channels} activeChId={activeChId} chForm={chForm} editingChId={editingChId}
              onSetActive={setActiveChId} onEdit={editChannel} onCopy={copyChannel} onDelete={delChannel}
              onSave={saveChannel} onChFormChange={setChForm} onClearForm={clearChForm}
            />
          )}
          {pane === 'history' && (
            <VideoHistoryPane
              history={history} channels={channels} exportBusy={exportBusy} requeryingIds={requeryingIds}
              fChannel={fChannel} fModel={fModel} fResult={fResult} onRequery={requeryRecord}
              onFChannel={setFChannel} onFModel={setFModel} onFResult={setFResult}
              onStartExport={setExportJob}
              onClearAll={clearAllHistory} onDetail={setDetailRec} onDeleteOne={deleteHistOne}
              onRestore={restoreBatch} onDeleteBatch={deleteHistBatch}
            />
          )}
        </div>
      </div>

      {detailRec && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-8" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setDetailRec(null)}>
          <div className="floating-material w-full max-w-3xl rounded-2xl ia-card-enter" style={{ background: 'var(--bg)', boxShadow: 'var(--shadowMd)', border: '1px solid var(--border)', maxHeight: '82vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>测试记录详情</p>
              <div className="flex items-center gap-2">
                {videoCanRequery(detailRec) && (
                  <Btn small variant="accent" disabled={requeryingIds.has(detailRec.id)} onClick={() => requeryRecord(detailRec)}>
                    {requeryingIds.has(detailRec.id) ? '查询中…' : '↻ 重试查询'}
                  </Btn>
                )}
                <Btn small variant="soft" disabled={exportBusy} onClick={() => setExportJob([detailRec])}>导出 HTML</Btn>
                <button onClick={() => setDetailRec(null)} className="w-8 h-8 rounded-lg border-0 cursor-pointer text-lg flex items-center justify-center" style={{ color: 'var(--t3)', background: 'transparent' }}>×</button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-4" style={{ color: 'var(--t2)' }}>
                <span>用例 <b style={{ color: 'var(--text)' }}>{videoEsc(detailRec.caseName)}</b></span>
                <span>模型 <b style={{ color: 'var(--text)' }}>{videoEsc(detailRec.model)}</b></span>
                <span>渠道 <b style={{ color: 'var(--text)' }}>{videoEsc(detailRec.channelName)}</b></span>
                <span>时间 <b style={{ color: 'var(--text)' }}>{videoFmtTime(detailRec.time)}</b></span>
              </div>
              {renderResultBody(detailRec, { defaultOpenReq: true })}
            </div>
          </div>
        </div>
      )}

      {exportJob && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center overflow-auto p-8" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="sticky top-0 mb-3">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: 'var(--bg)', color: 'var(--text)', boxShadow: 'var(--shadowMd)' }}>
              {exportBusy ? '⏳ 正在生成导出文件…' : '导出预览'}
            </span>
          </div>
          <div className="w-full flex justify-center" style={{ minWidth: 960 }}>
            <VideoReportView rootRef={reportRootRef} records={exportJob} renderDetail={r => renderResultBody(r)} />
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewUrl(null) }}
        >
          <div className="max-w-4xl w-full flex flex-col gap-3">
            <div className="flex items-center justify-end"><Btn small variant="soft" onClick={() => setPreviewUrl(null)}>关闭 ✕</Btn></div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#000' }}>
              <video src={previewUrl} controls autoPlay className="max-w-full max-h-[72vh] mx-auto block" />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-xl px-4 py-2 text-sm ia-toast-in"
          style={{ background: 'var(--text)', color: 'var(--bg)', boxShadow: 'var(--shadowMd)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default VideoApiTestTool
