import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, useDeferredValue } from 'react'
import { Btn, Label, Card, Badge, CustomInput, CustomSelect, SearchableSelect, CustomTextarea, Toggle, SegmentedControl, SectionTitle, CopyBtn } from '../shared/ui'

interface ImageItem {
  id: string; order: number; source: 'local' | 'url' | 'base64json'; name: string
  size: number | null; mime: string; status: 'loading' | 'done' | 'error'
  width: number; height: number; format: string; src: string; origin: string
  url?: string; error?: string; note?: string; formatNote?: string
  crossOriginBlocked?: boolean; sizeBlocked?: boolean
}

// ─── Image Analyzer Utilities ────────────────────────────────────────────────────

const IMG_STANDARDS = [
  { tier:'8K', name:'8K UHD (4320p)', w:7680, h:4320 },
  { tier:'8K', name:'8K DCI', w:8192, h:4320 },
  { tier:'6K', name:'6K', w:6144, h:3456 },
  { tier:'5K', name:'5K UHD+', w:5120, h:2880 },
  { tier:'4K', name:'4K DCI', w:4096, h:2160 },
  { tier:'4K', name:'4K UHD (2160p)', w:3840, h:2160 },
  { tier:'4K', name:'4K 宽屏 UW', w:3840, h:1600 },
  { tier:'3K', name:'3K (3200×1800)', w:3200, h:1800 },
  { tier:'2K', name:'2K QHD (1440p)', w:2560, h:1440 },
  { tier:'2K', name:'2K 超宽 UWQHD', w:3440, h:1440 },
  { tier:'2K', name:'2K DCI', w:2048, h:1080 },
  { tier:'2K', name:'QXGA', w:2048, h:1536 },
  { tier:'1080P', name:'WUXGA', w:1920, h:1200 },
  { tier:'1080P', name:'FHD 1080P', w:1920, h:1080 },
  { tier:'1080P', name:'FHD 超宽', w:2560, h:1080 },
  { tier:'900P', name:'HD+ 900P', w:1600, h:900 },
  { tier:'900P', name:'WSXGA+', w:1680, h:1050 },
  { tier:'768P', name:'WXGA (768p)', w:1366, h:768 },
  { tier:'720P', name:'HD 720P', w:1280, h:720 },
  { tier:'720P', name:'WXGA 16:10', w:1280, h:800 },
  { tier:'768P', name:'XGA', w:1024, h:768 },
  { tier:'576P', name:'PAL 576P', w:1024, h:576 },
  { tier:'480P', name:'FWVGA 480P', w:854, h:480 },
  { tier:'480P', name:'VGA 480P', w:640, h:480 },
  { tier:'480P', name:'SVGA', w:800, h:600 },
  { tier:'360P', name:'nHD 360P', w:640, h:360 },
  { tier:'240P', name:'240P', w:426, h:240 },
  { tier:'144P', name:'144P', w:256, h:144 },
] as const

const IMG_TIER_STYLE: Record<string, string> = {
  '8K': 'from-rose-500 to-orange-500',
  '6K': 'from-rose-500 to-pink-500',
  '5K': 'from-fuchsia-500 to-pink-500',
  '4K': 'from-violet-500 to-fuchsia-500',
  '3K': 'from-indigo-500 to-violet-500',
  '2K': 'from-sky-500 to-indigo-500',
  '1080P': 'from-emerald-500 to-teal-500',
  '900P': 'from-teal-500 to-cyan-600',
  '768P': 'from-cyan-600 to-sky-700',
  '720P': 'from-amber-500 to-yellow-600',
  '576P': 'from-amber-600 to-orange-700',
  '480P': 'from-orange-600 to-red-700',
  '360P': 'from-slate-500 to-slate-600',
  '240P': 'from-slate-600 to-slate-700',
  '144P': 'from-slate-700 to-slate-800',
  '非标准': 'from-slate-600 to-slate-700',
}

const IMG_FORMAT_COLOR: Record<string, string> = {
  JPEG: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/25',
  PNG: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-400/25',
  WebP: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-400/25',
  GIF: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 border-fuchsia-400/25',
  SVG: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-400/25',
  AVIF: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-400/25',
  HEIC: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-400/25',
  BMP: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/25',
  ICO: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-400/25',
  TIFF: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-400/25',
}

const IMG_COMMON_RATIOS: [number, number][] = [
  [16,9],[9,16],[4,3],[3,4],[3,2],[2,3],[1,1],[21,9],[9,21],[16,10],[10,16],[5,4],[4,5],[2,1],[1,2],[32,9],[5,3],[7,5]
]

function imgFormatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '未知'
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(kb < 10 ? 2 : 1) + ' KB'
  const mb = kb / 1024
  if (mb < 1024) return mb.toFixed(2) + ' MB'
  return (mb / 1024).toFixed(2) + ' GB'
}

function imgGcd(a: number, b: number): number { return b === 0 ? a : imgGcd(b, a % b) }

function imgAspectRatio(w: number, h: number): string {
  if (!w || !h) return '—'
  const r = w / h
  let best: [number, number] | null = null; let bestDiff = Infinity
  for (const [a, b] of IMG_COMMON_RATIOS) {
    const d = Math.abs(r - a / b)
    if (d < bestDiff) { bestDiff = d; best = [a, b] }
  }
  if (best && bestDiff / r < 0.012) return `${best[0]}:${best[1]}`
  const g = imgGcd(w, h); const sw = w / g; const sh = h / g
  if (sw <= 40 && sh <= 40) return `${sw}:${sh}`
  return r.toFixed(2) + ':1'
}

interface ImgClassification { tier: string; label: string; standard: boolean; name: string; exact?: boolean; near?: string }

function imgClassifyResolution(w: number, h: number, loose: boolean): ImgClassification {
  if (!w || !h) return { tier: '未知', label: '未知', standard: false, name: '' }
  const long = Math.max(w, h); const short = Math.min(w, h); const tol = loose ? 0.02 : 0
  for (const s of IMG_STANDARDS) {
    const sl = Math.max(s.w, s.h); const ss = Math.min(s.w, s.h)
    const okL = tol ? Math.abs(long - sl) / sl <= tol : long === sl
    const okS = tol ? Math.abs(short - ss) / ss <= tol : short === ss
    if (okL && okS) return { tier: s.tier, label: s.tier, standard: true, name: s.name, exact: long === sl && short === ss }
  }
  let near = '低于 144P'
  const buckets: [number, string][] = [[7680,'8K'],[6144,'6K'],[5120,'5K'],[3840,'4K'],[3200,'3K'],[2560,'2K'],[1920,'1080P'],[1600,'900P'],[1366,'768P'],[1280,'720P'],[1024,'576P'],[854,'480P'],[640,'360P'],[426,'240P'],[256,'144P']]
  for (const [edge, name] of buckets) { if (long >= edge) { near = name; break } }
  return { tier: '非标准', label: '非标准分辨率', standard: false, name: '', near }
}

function imgDetectFormat(buffer: ArrayBuffer): string | null {
  const b = new Uint8Array(buffer)
  const hex = Array.from(b.slice(0, 16)).map(x => x.toString(16).padStart(2, '0')).join('')
  if (hex.startsWith('ffd8ff')) return 'JPEG'
  if (hex.startsWith('89504e47')) return 'PNG'
  if (hex.startsWith('47494638')) return 'GIF'
  if (hex.startsWith('424d')) return 'BMP'
  if (hex.startsWith('00000100')) return 'ICO'
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'TIFF'
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'WebP'
  if (b.length > 12 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...b.slice(8, 12)).toLowerCase()
    if (brand.startsWith('avi')) return 'AVIF'
    if (/heic|heix|hevc|mif1|msf1|heim/.test(brand)) return 'HEIC'
  }
  try {
    const head = new TextDecoder().decode(b.slice(0, 300)).trim().toLowerCase()
    if (head.includes('<svg') || head.startsWith('<?xml')) return 'SVG'
  } catch { /* ignore */ }
  return null
}

function imgMimeToFormat(mime: string = ''): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'JPEG'
  if (m.includes('png')) return 'PNG'
  if (m.includes('webp')) return 'WebP'
  if (m.includes('gif')) return 'GIF'
  if (m.includes('bmp')) return 'BMP'
  if (m.includes('svg')) return 'SVG'
  if (m.includes('avif')) return 'AVIF'
  if (m.includes('heic') || m.includes('heif')) return 'HEIC'
  if (m.includes('icon') || m.includes('ico')) return 'ICO'
  if (m.includes('tiff')) return 'TIFF'
  return ''
}

function imgExtFromUrl(url: string = ''): string {
  try {
    const clean = url.split('?')[0].split('#')[0]
    const m = clean.match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toUpperCase().replace('JPG', 'JPEG') : ''
  } catch { return '' }
}

// ─── Tool: 图片信息识别 ─────────────────────────────────────────────────────────

let imgCounter = 0
function ImageAnalyzerTool() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [view, setView] = useState<'card' | 'table'>('card')
  const [sortBy, setSortBy] = useState<'added' | 'pixels' | 'size' | 'name' | 'width'>('added')
  const [filterTier, setFilterTier] = useState('')
  const [search, setSearch] = useState('')
  const [loose, setLoose] = useState(false)
  const [lightboxItem, setLightboxItem] = useState<ImageItem | null>(null)
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'info' | 'ok' | 'err' }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropzoneRef = useRef<HTMLDivElement>(null)

  const addToast = useCallback((msg: string, type: 'info' | 'ok' | 'err' = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, msg: '' } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 320)
    }, 2600)
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }, [])

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg|avif|heic|ico|tiff?)$/i.test(f.name))
    if (!files.length) { addToast('未检测到有效的图片文件', 'err'); return }
    files.forEach(file => {
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'local', name: file.name,
        size: file.size, mime: file.type, status: 'loading',
        width: 0, height: 0, format: '', src: '', origin: '本地文件',
      }
      setItems(prev => [...prev, item])
      const headReader = new FileReader()
      headReader.onload = () => {
        const detected = imgDetectFormat(headReader.result as ArrayBuffer)
        const fmt = detected || imgMimeToFormat(file.type) || imgExtFromUrl(file.name) || '未知'
        const patch: Partial<ImageItem> = { format: fmt }
        if (detected && imgMimeToFormat(file.type) && detected !== imgMimeToFormat(file.type)) {
          patch.formatNote = `扩展名声明为 ${imgMimeToFormat(file.type)}`
        }
        updateItem(id, patch)
      }
      headReader.readAsArrayBuffer(file.slice(0, 512))
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = () => {
          const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height
          updateItem(id, { width: w || 0, height: h || 0, src: e.target!.result as string, status: 'done', note: (!w || !h) ? '矢量图 / 无固有尺寸' : undefined })
        }
        img.onerror = () => updateItem(id, { status: 'error', error: '图片解码失败，可能是浏览器不支持的格式（如 HEIC）' })
        img.src = e.target!.result as string
      }
      reader.onerror = () => updateItem(id, { status: 'error', error: '文件读取失败' })
      reader.readAsDataURL(file)
    })
    addToast(`已添加 ${files.length} 张本地图片`, 'ok')
  }, [addToast, updateItem])

  // 解析 OpenAI 图片接口的标准响应结构 { "data": [ { "b64_json": "..." }, ... ] }
  // 每个 b64_json 单独解码为二进制后按 magic bytes 嗅探真实格式，不假设固定为 PNG
  const addOpenAiB64Json = useCallback((text: string) => {
    let json: unknown
    try { json = JSON.parse(text) } catch { addToast('JSON 解析失败，请检查内容是否完整、格式是否正确', 'err'); return }
    const dataArr = (json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data))
      ? (json as { data: unknown[] }).data : null
    if (!dataArr) { addToast('未识别到 OpenAI 图片响应结构：需包含 data 数组，如 { "data": [ { "b64_json": "..." } ] }', 'err'); return }
    const found = dataArr
      .map(entry => (entry && typeof entry === 'object') ? entry as { b64_json?: unknown } : null)
      .filter((entry): entry is { b64_json?: unknown } => !!entry && typeof entry.b64_json === 'string' && (entry.b64_json as string).trim().length > 0)
      .map(entry => (entry.b64_json as string).trim())
    if (!found.length) { addToast('data[] 中未找到 b64_json 字段', 'err'); return }
    found.forEach((b64, i) => {
      const idx = i + 1
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'base64json', name: `openai-image-${idx}`,
        size: null, mime: '', status: 'loading', width: 0, height: 0,
        format: '', src: '', origin: 'OpenAI Base64 JSON',
      }
      setItems(prev => [...prev, item])
      let buf: ArrayBuffer
      try {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
        buf = bytes.buffer
      } catch {
        updateItem(id, { status: 'error', error: 'base64 解码失败，可能不是合法的 base64 字符串' }); return
      }
      const fmt = imgDetectFormat(buf) || 'PNG'
      const mimeByFmt: Record<string, string> = { JPEG: 'image/jpeg', PNG: 'image/png', GIF: 'image/gif', BMP: 'image/bmp', WebP: 'image/webp', TIFF: 'image/tiff', AVIF: 'image/avif', HEIC: 'image/heic', ICO: 'image/x-icon', SVG: 'image/svg+xml' }
      const mime = mimeByFmt[fmt] || 'image/png'
      const ext = fmt === 'JPEG' ? 'jpg' : fmt.toLowerCase()
      const dataUrl = `data:${mime};base64,${b64}`
      const img = new Image()
      img.onload = () => updateItem(id, {
        width: img.naturalWidth, height: img.naturalHeight, src: dataUrl, status: 'done',
        format: fmt, mime, size: buf.byteLength, name: `openai-image-${idx}.${ext}`,
      })
      img.onerror = () => updateItem(id, { status: 'error', error: '图片解码失败，base64 数据可能已损坏或被截断' })
      img.src = dataUrl
    })
    addToast(`已从 JSON 中解析出 ${found.length} 张图片`, 'ok')
  }, [addToast, updateItem])

  const addUrls = useCallback((text: string) => {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) { addOpenAiB64Json(trimmed); return }
    const urls = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean).filter(u => /^(https?:)?\/\/|^data:image\//i.test(u))
    if (!urls.length) { addToast('请输入有效的图片 URL（以 http(s):// 开头），或粘贴 OpenAI 图片接口返回的 JSON', 'err'); return }
    urls.forEach(url => {
      const rawName = decodeURIComponent(url.split('/').pop()!.split('?')[0]) || '远程图片'
      const id = Math.random().toString(36).slice(2, 10)
      const item: ImageItem = {
        id, order: imgCounter++, source: 'url', name: rawName.length > 44 ? rawName.slice(0, 42) + '…' : rawName,
        url, size: null, mime: '', status: 'loading', width: 0, height: 0,
        format: imgExtFromUrl(url) || '', src: url, origin: 'URL 链接',
      }
      setItems(prev => [...prev, item])
      const img = new Image(); img.crossOrigin = 'anonymous'
      const fallback = () => {
        const img2 = new Image()
        img2.onload = () => updateItem(id, { width: img2.naturalWidth, height: img2.naturalHeight, status: 'done', crossOriginBlocked: true, format: item.format || '未知' })
        img2.onerror = () => updateItem(id, { status: 'error', error: '无法加载该 URL（链接失效、非图片或被防盗链拦截）' })
        img2.src = url
      }
      img.onload = () => updateItem(id, { width: img.naturalWidth, height: img.naturalHeight, status: 'done' })
      img.onerror = fallback; img.src = url
      fetch(url, { mode: 'cors' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
        .then(async blob => {
          const fmt = await blob.slice(0, 512).arrayBuffer().then(buf => imgDetectFormat(buf) || imgMimeToFormat(blob.type) || item.format || '未知').catch(() => imgMimeToFormat(blob.type) || item.format || '未知')
          updateItem(id, { size: blob.size, mime: blob.type, format: fmt })
        })
        .catch(() => updateItem(id, { sizeBlocked: true, format: item.format || '未知' }))
    })
    addToast(`已开始加载 ${urls.length} 个 URL 图片`, 'ok')
  }, [addToast, updateItem, addOpenAiB64Json])

  const removeItem = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), [])

  const visibleItems = useMemo(() => {
    let list = items.filter(it => {
      const c = imgClassifyResolution(it.width, it.height, loose)
      if (filterTier && c.tier !== filterTier) return false
      if (search && !(it.name.toLowerCase().includes(search) || (it.format || '').toLowerCase().includes(search))) return false
      return true
    })
    list.sort((a, b) => {
      if (sortBy === 'pixels') return (b.width * b.height) - (a.width * a.height)
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0)
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sortBy === 'width') return b.width - a.width
      return a.order - b.order
    })
    return list
  }, [items, sortBy, filterTier, search, loose])

  const tierOptions = useMemo(() => {
    const tiers = [...new Set(items.filter(i => i.status === 'done').map(i => imgClassifyResolution(i.width, i.height, loose).tier))]
    return [{ value: '', label: '全部' }, ...tiers.map(t => ({ value: t, label: t }))]
  }, [items, loose])

  const stats = useMemo(() => {
    const done = items.filter(i => i.status === 'done')
    const totalSize = done.reduce((s, i) => s + (i.size || 0), 0)
    const stdCount = done.filter(i => imgClassifyResolution(i.width, i.height, loose).standard).length
    const maxItem = done.slice().sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    const totalMP = done.reduce((s, i) => s + i.width * i.height, 0) / 1e6
    return { done, totalSize, stdCount, maxItem, totalMP }
  }, [items, loose])

  // Paste handler
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || [])
      if (files.length) { addFiles(files); return }
      const text = e.clipboardData?.getData('text')
      const trimmed = text?.trim()
      if (!trimmed) return
      // 全局粘贴要保守判断，避免误触发：URL 或者「看起来像带 b64_json 的 JSON」才当图片处理
      if (/^https?:\/\//i.test(trimmed) || (trimmed.startsWith('{') && /"b64_json"/.test(trimmed))) addUrls(text!)
    }
    window.addEventListener('paste', handler as EventListener)
    return () => window.removeEventListener('paste', handler as EventListener)
  }, [addFiles, addUrls])

  // Lightbox escape
  useEffect(() => {
    if (!lightboxItem) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxItem(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxItem])

  // Prevent default drag on document
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragover', prevent); document.addEventListener('dragenter', prevent)
    return () => { document.removeEventListener('dragover', prevent); document.removeEventListener('dragenter', prevent) }
  }, [])

  const has = items.length > 0
  const done = stats.done

  const tierBadge = (c: ImgClassification) => {
    const grad = IMG_TIER_STYLE[c.tier] || IMG_TIER_STYLE['非标准']
    return <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-gradient-to-r ${grad} text-white px-2 py-0.5 text-[10px]`} style={{ textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>{c.standard ? c.tier : '非标准'}</span>
  }

  const copyInfo = (it: ImageItem) => {
    const c = imgClassifyResolution(it.width, it.height, loose)
    const txt = `文件名：${it.name}\n分辨率：${it.width} × ${it.height} 像素\n文件大小：${it.size == null ? '未知' : imgFormatBytes(it.size)}\n分辨率等级：${c.standard ? c.tier + '（' + c.name + '）' : '非标准分辨率（最接近 ' + c.near + '）'}\n图片格式：${it.format}\n宽高比：${imgAspectRatio(it.width, it.height)}\n来源：${it.origin}`
    navigator.clipboard.writeText(txt).then(() => addToast('图片信息已复制到剪贴板', 'ok')).catch(() => addToast('复制失败', 'err'))
  }

  const exportCsv = () => {
    const rows = [['文件名', '来源', '宽度(px)', '高度(px)', '分辨率', '文件大小(字节)', '文件大小', '分辨率等级', '标准规格', '图片格式', '宽高比', '百万像素']]
    visibleItems.filter(i => i.status === 'done').forEach(it => {
      const c = imgClassifyResolution(it.width, it.height, loose)
      rows.push([it.name, it.origin, String(it.width), String(it.height), `${it.width}x${it.height}`, String(it.size ?? ''), it.size == null ? '未知' : imgFormatBytes(it.size),
        c.standard ? c.tier : '非标准分辨率', c.standard ? c.name : ('最接近 ' + (c.near || '')), it.format, imgAspectRatio(it.width, it.height), ((it.width * it.height) / 1e6).toFixed(2)])
    })
    const csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `图片信息_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); addToast('CSV 已导出', 'ok')
  }

  const [dragOver, setDragOver] = useState(false)
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); if (!dropzoneRef.current?.contains(e.relatedTarget as Node)) setDragOver(false) }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    else { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (url) addUrls(url) }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-12 space-y-6">
      <SectionTitle>图片信息识别器</SectionTitle>

      {/* Input Area */}
      <section className="grid lg:grid-cols-2 gap-5">
        <div className="surface-card rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>本地上传 <span style={{ color: 'var(--t3)' }} className="font-normal">（支持多选 / 拖拽 / 粘贴）</span></span>
          </div>
          <div ref={dropzoneRef}
            className={`ia-checker rounded-xl border-2 border-dashed cursor-pointer p-8 text-center select-none transition-all duration-200 ${dragOver ? 'ia-drag-active' : ''}`}
            style={{ borderColor: dragOver ? undefined : 'var(--border)' }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" className="w-11 h-11 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--t3)' }}>
              <path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" /><path d="M12 3v13m0-13 5 5m-5-5-5 5" />
            </svg>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>拖拽图片到此处，或 <span style={{ color: 'var(--accent)' }} className="underline decoration-dotted">点击选择文件</span></p>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--t3)' }}>支持 JPG / PNG / WebP / GIF / BMP / AVIF / SVG / ICO 等 · 可一次选择多张</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>

        <div className="surface-card rounded-2xl p-5 flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accentSub)', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" /></svg>
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>图片 URL 加载 <span style={{ color: 'var(--t3)' }} className="font-normal">（每行一个，可批量；也支持粘贴 OpenAI 图片接口返回的 JSON）</span></span>
          </div>
          <UrlInput onSubmit={addUrls} />
        </div>
      </section>

      {/* Toolbar */}
      {has && (
        <section className="surface-card rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <SegmentedControl value={view} options={[{ value: 'card', label: '卡片' }, { value: 'table', label: '表格' }]} onChange={v => setView(v as 'card' | 'table')} />
          <div className="w-px h-5" style={{ background: 'var(--border)' }} />
          <CustomSelect value={sortBy} onChange={v => setSortBy(v as typeof sortBy)}
            options={[{ value: 'added', label: '添加顺序' }, { value: 'pixels', label: '像素总数 ↓' }, { value: 'size', label: '文件大小 ↓' }, { value: 'name', label: '文件名 A→Z' }, { value: 'width', label: '宽度 ↓' }]} />
          <CustomSelect value={filterTier} onChange={setFilterTier} options={tierOptions} />
          <input type="text" placeholder="搜索文件名 / 格式…" value={search} onChange={e => setSearch(e.target.value)}
            className="rounded-xl px-3 py-1.5 text-xs outline-none transition-all duration-150"
            style={{ background: 'var(--inputBg)', border: '1px solid var(--inputBorder)', color: 'var(--text)', width: 176 }}
          />
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--t2)' }}>
            <input type="checkbox" checked={loose} onChange={e => setLoose(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5" />
            宽松匹配 ±2%
          </label>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: 'var(--t3)' }}>显示 {visibleItems.length} / {items.length} 张</span>
          <Btn small onClick={exportCsv}>导出 CSV</Btn>
          <Btn small variant="danger" onClick={() => { setItems([]); addToast('已清空全部图片') }}>清空</Btn>
        </section>
      )}

      {/* Stats */}
      {has && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['图片总数', items.length + ' 张', `已解析 ${done.length} · 加载中 ${items.filter(i => i.status === 'loading').length}`, 'text-blue-500'],
            ['总文件大小', imgFormatBytes(stats.totalSize), `${done.filter(i => i.size == null).length} 张体积未知`, 'text-emerald-500'],
            ['标准分辨率', `${stats.stdCount} / ${done.length}`, `${done.length - stats.stdCount} 张为非标准分辨率`, 'text-violet-500'],
            ['最高分辨率', stats.maxItem ? `${stats.maxItem.width}×${stats.maxItem.height}` : '—', `合计 ${stats.totalMP.toFixed(1)} 百万像素`, 'text-amber-500'],
          ] as const).map(([t, v, s, c]) => (
            <div key={t} className="rounded-2xl p-4" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
              <p className="text-[11px]" style={{ color: 'var(--t2)' }}>{t}</p>
              <p className={`text-xl font-bold mt-1 font-mono ${c}`}>{v}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>{s}</p>
            </div>
          ))}
        </section>
      )}

      {/* Empty State */}
      {!has && (
        <section className="surface-card rounded-2xl py-20 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <svg viewBox="0 0 24 24" className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--t3)' }}>
            <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 17 4.5-4.5 3 3L15 11l5 5" />
          </svg>
          <p className="font-medium" style={{ color: 'var(--t2)' }}>还没有图片</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--t3)' }}>上传本地图片或粘贴图片 URL，即可自动识别分辨率、大小、等级与格式</p>
        </section>
      )}

      {/* Card View */}
      {view === 'card' && has && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleItems.map(it => {
            const c = imgClassifyResolution(it.width, it.height, loose)
            const fmtCls = IMG_FORMAT_COLOR[it.format] || 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
            if (it.status === 'loading') return (
              <div key={it.id} className="surface-card rounded-2xl overflow-hidden ia-card-enter">
                <div className="h-44 ia-shimmer" />
                <div className="p-4 space-y-2.5">
                  <div className="h-4 w-3/4 rounded ia-shimmer" />
                  <div className="h-3 w-1/2 rounded ia-shimmer" />
                  <div className="grid grid-cols-2 gap-2 pt-1"><div className="h-11 rounded-lg ia-shimmer" /><div className="h-11 rounded-lg ia-shimmer" /></div>
                </div>
              </div>
            )
            if (it.status === 'error') return (
              <div key={it.id} className="surface-card rounded-2xl overflow-hidden ia-card-enter" style={{ borderColor: 'var(--err)' }}>
                <div className="h-44 grid place-items-center" style={{ background: 'var(--errBg)' }}>
                  <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--err)' }}><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3h.01" /></svg>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--err)' }}>{it.error || '加载失败'}</p>
                  <Btn small variant="soft" className="mt-3 w-full" onClick={() => removeItem(it.id)}>移除</Btn>
                </div>
              </div>
            )
            const mp = ((it.width * it.height) / 1e6).toFixed(2)
            const orientation = it.width === it.height ? '正方形' : (it.width > it.height ? '横向' : '纵向')
            return (
              <div key={it.id} className="surface-card surface-card-interactive rounded-2xl overflow-hidden ia-card-enter group">
                <div className="relative h-44 ia-checker cursor-zoom-in overflow-hidden" onClick={() => setLightboxItem(it)}>
                  <img src={it.src} alt={it.name} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
                  <div className="absolute top-2 left-2 flex gap-1.5">{tierBadge(c)}</div>
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${fmtCls}`}>{it.format || '未知'}</span>
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-mono" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)', border: '1px solid var(--border)', color: 'var(--text)' }}>{it.width}×{it.height}</div>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p>
                  <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--t3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: it.source === 'local' ? 'var(--accent)' : it.source === 'base64json' ? 'var(--jKey)' : 'var(--warn)' }} />{it.origin}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>分辨率</p>
                      <p className="font-mono text-sm font-semibold" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>文件大小</p>
                      <p className="font-mono text-sm font-semibold" style={{ color: it.size == null ? 'var(--t3)' : 'var(--ok)' }}>{it.size == null ? '未知' : imgFormatBytes(it.size)}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>分辨率等级</p>
                      <p className="text-sm font-semibold" style={{ color: c.standard ? 'var(--accent)' : 'var(--warn)' }}>{c.standard ? c.tier : '非标准'}</p>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--t3)' }}>图片格式</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{it.format || '未知'}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--t2)' }}>
                    {c.standard
                      ? <span style={{ color: 'var(--ok)' }}>✓ 标准规格：{c.name}{c.exact ? '' : '（±2% 近似）'}</span>
                      : <><span style={{ color: 'var(--warn)' }}>⚠ 非标准分辨率</span> · 最接近 <b style={{ color: 'var(--text)' }}>{c.near}</b></>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]" style={{ color: 'var(--t3)' }}>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>宽高比 {imgAspectRatio(it.width, it.height)}</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>{mp} MP</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>{orientation}</span>
                    {it.sizeBlocked && <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>跨域·体积未知</span>}
                    {it.formatNote && <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--warnBg)', border: '1px solid var(--warn)', color: 'var(--warn)' }}>{it.formatNote}</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Btn small variant="soft" className="flex-1" onClick={() => copyInfo(it)}>复制信息</Btn>
                    <Btn small variant="accent" className="flex-1" onClick={() => setLightboxItem(it)}>查看大图</Btn>
                    <Btn small variant="danger" onClick={() => removeItem(it.id)}>✕</Btn>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && has && (
        <div className="surface-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead style={{ background: 'var(--s1)' }}>
                <tr className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t2)' }}>
                  {['预览', '名称 / 来源', '分辨率', '等级', '文件大小', '格式', '宽高比', '像素', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(it => {
                  const c = imgClassifyResolution(it.width, it.height, loose)
                  if (it.status === 'loading') return <tr key={it.id}><td colSpan={9} className="px-4 py-3"><div className="h-8 rounded ia-shimmer" /></td></tr>
                  if (it.status === 'error') return <tr key={it.id}><td className="px-4 py-3" style={{ color: 'var(--err)' }}>—</td><td className="px-4 py-3 text-xs">{it.name}</td><td colSpan={6} className="px-4 py-3 text-xs" style={{ color: 'var(--err)' }}>{it.error}</td><td className="px-4 py-3"><button onClick={() => removeItem(it.id)} className="text-xs hover:underline" style={{ color: 'var(--err)' }}>移除</button></td></tr>
                  const fmtCls = IMG_FORMAT_COLOR[it.format] || 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-400/25'
                  return (
                    <tr key={it.id} className="transition-colors duration-100" style={{ borderTop: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--s1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2"><div className="w-14 h-10 ia-checker rounded overflow-hidden cursor-zoom-in" onClick={() => setLightboxItem(it)}><img src={it.src} className="w-full h-full object-contain" /></div></td>
                      <td className="px-4 py-2 max-w-[220px]"><p className="truncate text-xs font-medium" style={{ color: 'var(--text)' }} title={it.name}>{it.name}</p><p className="text-[10px]" style={{ color: 'var(--t3)' }}>{it.origin}</p></td>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--accent)' }}>{it.width} × {it.height}</td>
                      <td className="px-4 py-2">{tierBadge(c)}<span className="block text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{c.standard ? c.name : '最接近 ' + c.near}</span></td>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: it.size == null ? 'var(--t3)' : 'var(--ok)' }}>{it.size == null ? '未知' : imgFormatBytes(it.size)}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${fmtCls}`}>{it.format || '未知'}</span></td>
                      <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{imgAspectRatio(it.width, it.height)}</td>
                      <td className="px-4 py-2 text-xs" style={{ color: 'var(--t2)' }}>{((it.width * it.height) / 1e6).toFixed(2)} MP</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button onClick={() => copyInfo(it)} className="text-[11px] transition-colors duration-100" style={{ color: 'var(--t2)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>复制</button>
                        <button onClick={() => removeItem(it.id)} className="ml-2 text-[11px] transition-colors duration-100" style={{ color: 'var(--err)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--err)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}>删除</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Standards Reference */}
      <section className="surface-card rounded-2xl p-5" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <details>
          <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2 select-none" style={{ color: 'var(--text)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)' }}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
            分辨率标准规格参照表（判定规则说明）
          </summary>
          <div className="mt-4 text-xs space-y-3" style={{ color: 'var(--t2)' }}>
            <p>判定逻辑：取图片的<strong style={{ color: 'var(--text)' }}>长边与短边</strong>与标准规格比对（自动兼容横屏 / 竖屏）。完全一致时判定为对应标准等级；开启"宽松匹配"后允许 ±2% 误差；均不匹配时显示<span style={{ color: 'var(--warn)', fontWeight: 600 }}>非标准分辨率</span>，并给出最接近的等级参考（按长边区间归类）。</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {IMG_STANDARDS.map(s => (
                <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--s1)', border: '1px solid var(--border)' }}>
                  <span className="text-[11px] truncate" style={{ color: 'var(--t2)' }}>{s.name}</span>
                  <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: 'var(--t3)' }}>{s.w}×{s.h}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r ${IMG_TIER_STYLE[s.tier]} text-white`}>{s.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <footer className="text-center text-[11px] py-6" style={{ color: 'var(--t3)' }}>
        前端实现 · 所有图片均在本地浏览器解析，不会上传到任何服务器 · FileReader API + Image 动态加载
      </footer>

      {/* Lightbox */}
      {lightboxItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ia-lightbox-enter"
          style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setLightboxItem(null) }}
        >
          <div className="max-w-6xl w-full max-h-full flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{lightboxItem.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t2)' }}>
                  {lightboxItem.width} × {lightboxItem.height} px · {lightboxItem.size == null ? '体积未知' : imgFormatBytes(lightboxItem.size)} · {lightboxItem.format} · {(() => { const c = imgClassifyResolution(lightboxItem.width, lightboxItem.height, loose); return c.standard ? c.tier + '（' + c.name + '）' : '非标准分辨率' })()} · {imgAspectRatio(lightboxItem.width, lightboxItem.height)}
                </p>
              </div>
              <Btn small variant="soft" onClick={() => setLightboxItem(null)}>关闭 ✕</Btn>
            </div>
            <div className="ia-checker rounded-xl overflow-hidden flex-1 grid place-items-center min-h-0" style={{ border: '1px solid var(--border)' }}>
              <img src={lightboxItem.src} className="max-w-full max-h-[72vh] object-contain" alt="" />
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-20 right-4 z-[60] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`ia-toast-in pointer-events-auto px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl max-w-xs ${t.msg === '' ? 'opacity-0 translate-y-[-10px]' : ''}`}
            style={{
              background: t.type === 'ok' ? 'var(--ok)' : t.type === 'err' ? 'var(--err)' : 'var(--s2)',
              color: t.type === 'ok' || t.type === 'err' ? '#fff' : 'var(--text)',
              border: `1px solid ${t.type === 'ok' ? 'var(--ok)' : t.type === 'err' ? 'var(--err)' : 'var(--border)'}`,
              transition: 'opacity 0.3s, transform 0.3s',
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

function UrlInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <>
      <textarea
        value={value} onChange={e => setValue(e.target.value)} rows={4} spellCheck={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={'https://example.com/photo.jpg\nhttps://example.com/banner.png\n\n也支持粘贴 OpenAI 图片接口返回的 JSON（自动提取 data[].b64_json，可含多张）'}
        className="w-full flex-1 rounded-xl p-3 text-xs leading-relaxed resize-y outline-none transition-all duration-150"
        style={{
          background: 'var(--inputBg)', color: 'var(--text)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--inputBorder)'}`,
          boxShadow: focused ? '0 0 0 3px var(--accentSub)' : 'none',
          fontFamily: '"JetBrains Mono", "JetBrainsMono Nerd Font", "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Droid Sans Mono", "Cascadia Code", Consolas, "Courier New", monospace', minHeight: 80,
        }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onSubmit(value); setValue('') } }}
      />
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Btn variant="accent" onClick={() => { onSubmit(value); setValue('') }}>加载 URL 图片</Btn>
        {[
          { url: 'https://picsum.photos/id/1015/1920/1080', label: '示例 1080P' },
          { url: 'https://picsum.photos/id/1043/3840/2160', label: '示例 4K' },
          { url: 'https://picsum.photos/id/1025/1000/667', label: '示例 非标准' },
        ].map(s => (
          <Btn key={s.url} small variant="soft" onClick={() => onSubmit(s.url)}>{s.label}</Btn>
        ))}
        <span className="text-[10px]" style={{ color: 'var(--t3)' }}>跨域图片可能无法读取文件大小</span>
      </div>
    </>
  )
}

export default ImageAnalyzerTool
