import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'
import { IconVideo } from '../shared/icons'

// ─── Tool: 视频信息检测 ─────────────────────────────────────────────────────────

interface VideoItem {
  id: string; order: number; source: 'local' | 'url'; name: string
  status: 'loading' | 'done' | 'error'
  width: number; height: number; duration: number
  ratio: string; mime: string
  url?: string; error?: string
  src?: string // 探测成功后的可播放地址：url 条目为原链接，本地条目为 Blob URL（用于预览播放）
}

const VID_COMMON_RATIOS: [string, number][] = [
  ['21:9', 21 / 9], ['32:9', 32 / 9], ['16:9', 16 / 9], ['16:10', 16 / 10],
  ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:2', 3 / 2], ['1:1', 1],
  ['9:16', 9 / 16], ['9:18', 0.5], ['3:4', 3 / 4], ['2:3', 2 / 3],
]

function vidGcd(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { [a, b] = [b, a % b] }
  return a
}

// 宽高比：先按常见比例就近吸附（容差 0.025），否则用 GCD 化简，化简后仍过大则退化为小数形式
function vidAspectRatio(w: number, h: number): string {
  if (!w || !h) return '—'
  const r = w / h
  for (const [label, val] of VID_COMMON_RATIOS) {
    if (Math.abs(r - val) < 0.025) return label
  }
  const d = vidGcd(w, h)
  const sw = w / d, sh = h / d
  if (sw > 200 || sh > 200) return r.toFixed(2) + ':1'
  return `${sw}:${sh}`
}

function vidFormatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const VID_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg',
  mov: 'video/quicktime', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mkv: 'video/x-matroska', m4v: 'video/mp4', '3gp': 'video/3gpp', ts: 'video/mp2t', mts: 'video/mp2t',
}
const VID_VALID_EXTS = Object.keys(VID_MIME_MAP)

function vidExtFromName(nameOrUrl: string): string {
  try {
    const clean = nameOrUrl.split(/[?#]/)[0]
    const last = clean.split('/').pop() || clean
    return (last.split('.').pop() || '').toLowerCase()
  } catch { return '' }
}

function vidMimeFromName(nameOrUrl: string): string {
  const ext = vidExtFromName(nameOrUrl)
  return VID_MIME_MAP[ext] || ext || '未知'
}

function vidIsVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return VID_VALID_EXTS.includes(vidExtFromName(file.name))
}

function vidDisplayNameFromUrl(url: string): string {
  try {
    const clean = url.split(/[?#]/)[0]
    return decodeURIComponent(clean.split('/').pop() || url) || url
  } catch { return url }
}

// 探测视频元数据：不挂载 DOM 的 <video preload="metadata">，超时/失败均 reject 并清空 src 释放资源
function probeVideoMeta(src: string, timeoutMs = 20000): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      video.src = ''
      reject(new Error(`加载超时（${Math.round(timeoutMs / 1000)}s），请检查链接是否可访问`))
    }, timeoutMs)
    video.onloadedmetadata = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const { videoWidth: width, videoHeight: height, duration } = video
      video.src = ''
      if (!width || !height) { reject(new Error('无法读取视频尺寸，文件可能已损坏或格式不受支持')); return }
      resolve({ width, height, duration })
    }
    video.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.src = ''
      reject(new Error('无法加载视频，链接可能已失效或不允许访问'))
    }
    video.src = src
  })
}

let vidCounter = 0

function VideoAnalyzerTool() {
  const [items, setItems] = useState<VideoItem[]>([])
  const [urlText, setUrlText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [formMsg, setFormMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewItem, setPreviewItem] = useState<VideoItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 本地文件生成的 Blob URL 需要手动释放：探测成功后保留供预览播放，条目被移除/重新检测/组件卸载时统一回收
  const localBlobUrlsRef = useRef<Set<string>>(new Set())

  const updateItem = useCallback((id: string, patch: Partial<VideoItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  // 卸载时兜底释放所有未回收的本地文件 Blob URL
  useEffect(() => {
    return () => { localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u)) }
  }, [])

  // Esc 关闭预览播放器
  useEffect(() => {
    if (!previewItem) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewItem(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewItem])

  const addPendingFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(vidIsVideoFile)
    if (!files.length) { setFormMsg('未检测到有效的视频文件'); return }
    setFormMsg(null)
    setPendingFiles(prev => [...prev, ...files])
  }, [])

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id)
      if (target?.source === 'local' && target.src) {
        URL.revokeObjectURL(target.src)
        localBlobUrlsRef.current.delete(target.src)
      }
      return prev.filter(i => i.id !== id)
    })
    setPreviewItem(p => (p && p.id === id ? null : p))
  }, [])

  const clearAll = useCallback(() => {
    localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    localBlobUrlsRef.current.clear()
    setUrlText(''); setPendingFiles([]); setItems([]); setFormMsg(null); setPreviewItem(null)
  }, [])

  const runDetect = useCallback(() => {
    if (busy) return
    const urls = urlText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).filter(u => /^https?:\/\//i.test(u))
    const files = pendingFiles.slice()
    if (!urls.length && !files.length) {
      setFormMsg('请输入至少一个视频链接，或选择/拖拽本地视频文件')
      return
    }
    setFormMsg(null)
    setBusy(true)
    setPreviewItem(null)
    // 本次检测会整体替换结果列表，先回收上一轮本地文件残留的 Blob URL，避免内存泄漏
    localBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    localBlobUrlsRef.current.clear()

    const urlItems: VideoItem[] = urls.map(url => ({
      id: Math.random().toString(36).slice(2, 10), order: vidCounter++, source: 'url',
      name: vidDisplayNameFromUrl(url), status: 'loading', width: 0, height: 0, duration: 0,
      ratio: '', mime: vidMimeFromName(url), url,
    }))
    const fileItems: VideoItem[] = files.map(f => ({
      id: Math.random().toString(36).slice(2, 10), order: vidCounter++, source: 'local',
      name: f.name, status: 'loading', width: 0, height: 0, duration: 0,
      ratio: '', mime: f.type || vidMimeFromName(f.name),
    }))
    setItems([...urlItems, ...fileItems])

    const tasks: Promise<void>[] = []
    urlItems.forEach((item, i) => {
      const url = urls[i]
      tasks.push(
        probeVideoMeta(url)
          .then(meta => updateItem(item.id, { status: 'done', width: meta.width, height: meta.height, duration: meta.duration, ratio: vidAspectRatio(meta.width, meta.height), src: url }))
          .catch((err: Error) => updateItem(item.id, { status: 'error', error: err.message || '检测失败' }))
      )
    })
    fileItems.forEach((item, i) => {
      const file = files[i]
      const blobUrl = URL.createObjectURL(file)
      localBlobUrlsRef.current.add(blobUrl)
      tasks.push(
        probeVideoMeta(blobUrl)
          .then(meta => updateItem(item.id, { status: 'done', width: meta.width, height: meta.height, duration: meta.duration, ratio: vidAspectRatio(meta.width, meta.height), src: blobUrl }))
          .catch((err: Error) => {
            URL.revokeObjectURL(blobUrl)
            localBlobUrlsRef.current.delete(blobUrl)
            updateItem(item.id, { status: 'error', error: err.message || '检测失败' })
          })
      )
    })

    Promise.allSettled(tasks).then(() => setBusy(false))
  }, [busy, urlText, pendingFiles, updateItem])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) addPendingFiles(e.dataTransfer.files)
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12 space-y-6">
      <div>
        <SectionTitle>视频信息检测</SectionTitle>
        <p className="text-sm mt-1" style={{ color: 'var(--t2)' }}>粘贴视频直链（支持多个，一行一个）或上传本地视频文件，批量获取分辨率、时长、宽高比与格式信息</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <Label className="block mb-1.5">视频 URL 链接</Label>
          <CustomTextarea
            value={urlText} onChange={setUrlText} rows={7} mono
            placeholder={'粘贴视频直链，每行一个\n例如：https://example.com/a.mp4'}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runDetect() } }}
          />
        </Card>
        <Card>
          <Label className="block mb-1.5">本地视频文件</Label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={e => { e.preventDefault(); setDragOver(true) }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
            onDrop={onDrop}
            className={`rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${dragOver ? 'ia-drag-active' : ''}`}
            style={{ border: '2px dashed var(--border)', background: 'var(--s1)' }}
          >
            <div className="flex justify-center mb-2" style={{ color: 'var(--t3)', transform: 'scale(1.8)' }}><IconVideo /></div>
            <p className="text-sm" style={{ color: 'var(--t2)' }}>拖拽视频文件到此处，或<span style={{ color: 'var(--accent)', fontWeight: 600 }}>点击选择</span></p>
            <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>支持 MP4 / WebM / MOV / MKV 等常见格式，可多选</p>
            <input ref={fileInputRef} type="file" multiple accept="video/*" className="hidden" onChange={e => { if (e.target.files?.length) addPendingFiles(e.target.files); e.target.value = '' }} />
          </div>
          {pendingFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              {pendingFiles.map((f, idx) => (
                <div key={f.name + idx} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--s1)' }}>
                  <span className="truncate" style={{ color: 'var(--text)' }} title={f.name}>{f.name}</span>
                  <button onClick={() => removePendingFile(idx)} className="flex-shrink-0 transition-colors duration-100" style={{ color: 'var(--t3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}>移除</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Btn variant="accent" onClick={runDetect} disabled={busy}>{busy ? '检测中…' : '开始检测'}</Btn>
        <Btn variant="soft" onClick={clearAll}>清除全部</Btn>
        <span className="text-xs" style={{ color: 'var(--t3)' }}>Ctrl / Cmd + Enter 快速检测</span>
        {formMsg && <span className="text-xs" style={{ color: 'var(--err)' }}>{formMsg}</span>}
      </div>

      {items.length > 0 ? (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--t3)' }}>共 {items.length} 个 · 成功 {doneCount} · 失败 {errorCount}</p>
          <div className="surface-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead style={{ background: 'var(--s1)' }}>
                  <tr className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t2)' }}>
                    {['预览', '来源', '分辨率', '时长', '宽高比', '格式 / MIME', '状态', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    // 缩略图：本地/URL 探测成功后用小号 <video> 静音展示第一帧，默认不播放，点击放大观看
                    const thumbCell = (
                      <td className="px-4 py-2">
                        {it.status === 'done' && it.src ? (
                          <div
                            onClick={() => setPreviewItem(it)}
                            className="w-16 h-11 rounded-lg overflow-hidden cursor-zoom-in flex items-center justify-center"
                            style={{ background: '#000', border: '1px solid var(--border)' }}
                            title="点击放大观看"
                          >
                            <video
                              src={it.src} muted playsInline preload="metadata"
                              className="w-full h-full object-cover pointer-events-none"
                              onLoadedMetadata={e => { try { e.currentTarget.currentTime = Math.min(0.1, (e.currentTarget.duration || 1) / 2) } catch { /* ignore */ } }}
                            />
                          </div>
                        ) : it.status === 'loading' ? (
                          <div className="w-16 h-11 rounded-lg ia-shimmer" />
                        ) : (
                          <div className="w-16 h-11 rounded-lg flex items-center justify-center" style={{ background: 'var(--s1)', color: 'var(--t3)' }}>
                            <IconVideo />
                          </div>
                        )}
                      </td>
                    )
                    const nameCell = (
                      <td className="px-4 py-3 text-xs max-w-[220px] truncate" style={{ color: 'var(--text)' }} title={it.url || it.name}>
                        {it.source === 'url' ? '🔗 ' : '📄 '}{it.name}
                      </td>
                    )
                    if (it.status === 'loading') {
                      return (
                        <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                          {thumbCell}
                          {nameCell}
                          <td className="px-4 py-3" colSpan={6}><div className="h-6 rounded ia-shimmer" /></td>
                        </tr>
                      )
                    }
                    if (it.status === 'error') {
                      return (
                        <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                          {thumbCell}
                          {nameCell}
                          <td className="px-4 py-3 text-xs" colSpan={4} style={{ color: 'var(--err)' }}>{it.error}</td>
                          <td className="px-4 py-3"><Badge color="err">失败</Badge></td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeItem(it.id)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>移除</button>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                        {thumbCell}
                        {nameCell}
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text)' }}>{vidFormatDuration(it.duration)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{it.ratio}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{it.mime}</td>
                        <td className="px-4 py-3"><Badge color="ok">成功</Badge></td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => setPreviewItem(it)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>预览</button>
                          <button onClick={() => removeItem(it.id)} className="ml-3 text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>移除</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl py-16 text-center" style={{ background: 'var(--s1)', border: '1px dashed var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--t3)' }}>还没有检测结果，粘贴视频链接或上传本地文件后点击「开始检测」</p>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--t3)' }}>所有检测均在浏览器本地完成，视频数据不会上传至任何服务器</p>

      {/* 预览播放器：点击表格中的成功条目放大观看 */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setPreviewItem(null) }}
        >
          <div className="max-w-4xl w-full max-h-full flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)' }} title={previewItem.url || previewItem.name}>{previewItem.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>
                  {previewItem.width} × {previewItem.height} px · {vidFormatDuration(previewItem.duration)} · {previewItem.ratio} · {previewItem.mime}
                </p>
              </div>
              <Btn small variant="soft" onClick={() => setPreviewItem(null)}>关闭 ✕</Btn>
            </div>
            <div className="rounded-xl overflow-hidden flex items-center justify-center min-h-0" style={{ border: '1px solid var(--border)', background: '#000' }}>
              {previewItem.src && (
                <video key={previewItem.id} src={previewItem.src} controls autoPlay className="max-w-full max-h-[72vh]" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoAnalyzerTool
