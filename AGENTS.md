# dev-toolkit

一个纯前端实现的开发工具箱：React + Vite + Tailwind CSS v4。包含 16 个工具（Seedance 计费、图片视频计费（Beta）、JSON 可视化/Diff、时间戳转换、AI 请求体格式转换、LLM 批量测试 & Token 计费口径核查、LLM 报告生成、图片接口测试、模型探测、提示词优化、图片信息识别、视频信息检测、ID 生成器、Base64 编解码、Unicode 转换、GraphQL 格式化）与 4 套主题。

## 开发命令

```bash
npm run dev        # 启动 Vite dev server（默认 http://localhost:8443，可用 PORT 环境变量改）
npm run build      # 生产构建到 dist/
npm run preview    # 预览生产构建
npm run test:e2e   # 运行 Playwright 端到端测试
```

## 项目结构

- `src/main.tsx` - React 入口，挂载 `src/App.tsx`
- `src/App.tsx` - 应用外壳（主题 + 侧边栏 + URL 路由，工具注册见 `toolRegistry.tsx`）
- `src/HomePage.tsx` - 首页（`/` 路由：无侧栏的顶栏 + Hero + 3 列工具卡片 + 备案页脚，视觉参考 `index/index.html`）
- `src/index.css` - 全局样式 + Tailwind CSS v4 import + 毛玻璃/主题过渡工具类 + `home-*` 首页样式
- `playwright.config.ts` - Playwright 端到端测试配置
- `e2e/` - 端到端测试用例（按工具拆分）

## 技术要点

- 路由：`/` 渲染首页（`HomePage.tsx`，无侧栏），`/tools/*` 渲染带侧边栏的工作台；`resolveToolRoute` 不再把 `/` 重定向到默认工具
- 图片视频计费（`src/tools/MultiCostTool.tsx`，逻辑在 `src/shared/multicost.ts`）：5 个产品（Seedance/Grok Image/Grok Video/GPT Image/Gemini Image）× 三种计费方式（百万 Token/张/秒），双币种展示（汇率 `ai-cost-fx-rate` 持久化于 IndexedDB kv，默认 7）；「粘贴 JSON 自动识别」解析请求/响应体（含 new-api 网关 `origin_model_name`）自动切换产品并填充表单；Seedance 定价与 `SeedanceTool.tsx` 对齐（2.0/2.0-fast/2.0-mini/2.5 + dreamina 2-0/2-0-fast/2-0-mini/2.5），其余产品价格参考官方来源、部分占位标注「需人工核实」；侧栏菜单带 Beta 徽章（`ToolDefinition.beta`，样式 `.beta-badge`）
- 运行时：React 19 + Vite 8 + Tailwind CSS v4（`@tailwindcss/vite` 插件）+ recharts（LLM 批量测试的输出 Token 波动图、LLM 报告生成的图表）+ `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities`（LLM 批量测试的提示词库拖拽排序）+ `xlsx`（LLM 报告生成的 Excel/CSV 解析）
- LLM 报告生成（`src/tools/LlmReportTool.tsx` + `LlmReportCharts.tsx` + `LlmReportExport.ts`，逻辑在 `src/shared/llm-report.ts`）：导入 new-api 风格日志（JSON 粘贴或 Excel/CSV，跳过 Query 类 sheet）生成性能/稳定性报告（成功率、TTFT、时序、错误分布），报告不含任何费用字段；失败判定 `other.stream_status.status !== "ok"`（缺失视为成功）；时间序列按跨度自动分钟/小时/天聚合；导出为自包含单文件 HTML（内嵌 echarts 源码——`import echartsSource from 'echarts/dist/echarts.min.js?raw'`，echarts 为 devDependency 仅取源码字符串进懒加载 chunk；模板见 `LlmReportExport.ts`，含深/浅主题切换）；`xlsx` 解析走动态 import（`parseExcelBuffer` 为 async，仅 Excel 路径按需下载），报告图表 `LlmReportCharts` 二次懒加载（对齐 `LlmBatchTool` 的 `LlmCharts` 套路），`vite.config.ts` 用 rolldown `advancedChunks` 把 recharts/xlsx 拆成稳定 vendor chunk
- 样式：Tailwind 工具类 + CSS 变量主题（`--bg`/`--accent` 等，见 `THEMES`），毛玻璃用 `.glass`/`.glass-sidebar`
- 字体：直接用 CSS `font-family` 声明 Inter（正文，`src/index.css`）/ JetBrains Mono（等宽，`App.tsx` 内联样式），不自建 `@font-face`、不下载/打包字体文件——本机没装就走后面的系统字体兜底栈；主题数据在 App.tsx
- 状态持久化：除首帧需同步读取的主题 `dev-toolkit-theme` 与侧栏折叠态 `dev-toolkit-sidebar` 仍留在 localStorage 外，其余键值配置全部存于共享 IndexedDB 的 `kv` object store（`dev-toolkit-history` 库 v2，低层 CRUD 在 `src/shared/history-db.ts`，上层在 `src/shared/app-kv.ts`）。读写模型：App 挂载时先 `kvHydrate()` 把整个 kv store 载入内存 Map 并做一次性 localStorage 迁移（成功落库才删旧 key，失败保留下次重试；迁移清单见 `app-kv.ts` 的 `LEGACY_LOCALSTORAGE_KEYS`），工具组件被 `kvReady` 门控在水合完成后才渲染，因此各工具仍可用 `useState(() => loadXxx())` 同步初始化；写入是写穿（同步改内存 + 异步落库，IndexedDB 不可用时回退写 localStorage，下次启动自愈迁回）。值统一为字符串（与 localStorage 语义一致），各工具自行 parse/stringify，接口是 `kvGet/kvSet/kvRemove`。高频写入（提示词库、工作台长文本等）统一用 `src/shared/use-debounced-persist.ts` 的 `useDebouncedPersist` 防抖 400ms、卸载时补写。迁移的键：Seedance 汇率 `seedance-fx-rate`、图片视频计费汇率 `ai-cost-fx-rate`、ID 生成器配置 `idgen-opts`、Base64 选项 `base64-opts`、Unicode 选项 `unicode-opts`、LLM 批量测试配置 `llmbatch-config`、渠道 `llmbatch-channels`/当前渠道 `llmbatch-active-channel`、提示词库 `llmbatch-prompts`、模型探测配置 `modelprobe-config`、渠道 `modelprobe-channels`/当前渠道 `modelprobe-active-channel`、图片接口测试配置 `imgtest-*`（渠道 `imgtest-channels`、当前渠道 `imgtest-active`、价格 `imgtest-prices`、汇率 `imgtest-rate`、表单 `imgtest-ui`、隐藏价格开关 `imgtest-hideprices`）、提示词优化 `promptopt-*`（渠道 `promptopt-channels`、当前渠道 `promptopt-active`、工作台状态 `promptopt-ui`，渠道 key 复用共享 AES-GCM 模块加密内嵌于渠道对象）、LLM 报告生成配置 `llmreport-opts`（输入方式）、报告标题 `llmreport-title`，以及仅供旧版迁移读取的 `llmbatch-key`/`modelprobe-key`。注意：IndexedDB 与 localStorage 同源页面 JS 均可读取，这次迁移的收益是配额、结构化管理与写入性能，不是密级提升。`llmbatch-config` 不再存储请求体原文（已迁移到 `llmbatch-prompts`，首次加载时自动迁移一次）。LLM 批量测试、模型探测均已改为「渠道管理」多目标模式（对齐图片接口测试/提示词优化的既有渠道范式）：渠道对象（`baseUrl`/超时/`apiKeyEnc`/`keyMask`，模型探测的渠道还含三种协议 URL 覆写）可保存多个、选一个当前使用，UI 是右侧新增的「渠道管理」Tab；旧版单一配置（`llmbatch-config.baseUrl`/`timeout` + `llmbatch-key`，`modelprobe-config.baseUrl`/`chatUrl`/`responsesUrl`/`anthropicUrl`/`timeout` + `modelprobe-key`）首次加载时自动迁移为一条「默认渠道」，旧 key 不再写入、仅保留供迁移读取。API Key 用 Web Crypto（AES-GCM）加密后落盘，读取时解密回填：LLM 批量测试/模型探测的渠道 key 加密后存于渠道对象内（复用共享模块 `shared/api-key-crypto.ts`），图片接口测试的渠道 key 加密后存于渠道对象内（passphrase `dev-toolkit-imgtest-v1`，未复用共享模块，历史遗留）；纯前端工具没有服务端，密钥必然内嵌在代码里，这只是避免明文直接落盘，不是抵御可执行页面 JS 的攻击者的真正机密保护。图片接口测试的历史记录只存缩略图（canvas 压缩到最长边 ≤160px，JPEG）不存原图，避免撑爆存储配额
- 历史记录存储：LLM 批量测试（`llmbatch-history`）、模型探测（`modelprobe-history`）、图片接口测试（`imgtest-history`）三个工具的历史记录已从 localStorage 迁移到共享 IndexedDB（`src/shared/history-db.ts`，数据库 `dev-toolkit-history`，三者各占一个同名 object store：`llmbatch`/`modelprobe`/`imgtest`）——原因是整份历史数组 `JSON.stringify` 写回 localStorage，在共享的 5-10MB 配额被写满时会从最旧记录开始静默裁剪，极端情况下只剩最新 1 条；IndexedDB 配额大得多，从根本上避免这个问题。每个工具挂载时用 `historyDbMigrateFromLocalStorage` 把旧版 localStorage 数据一次性迁移进对应 store 并清空旧 key（迁移失败则保留旧 key 等下次重试）；`history` state 因此在挂载时异步加载，不再能用 `useState(() => loadXxxHistory())` 同步初始化
- 图片接口测试支持导出测试结果为 HTML 报告 / PNG 图片（`ImgApiTestTool.tsx` 内 `img*Export*` 系列函数，DOM 截图模式，`html2canvas-pro` 懒加载，同 `LlmBatchTool.tsx` 的导出套路）：入口在「批量测试」页（导出当前这一轮结果）和「历史记录」页（勾选记录后导出），触发时渲染一个真实可见的全屏预览遮罩层（导出完自动关闭；早期版本用 `position:fixed` 负坐标把容器藏到屏幕外，导致 html2canvas 截图失败/导出的 HTML 打开后空白，改成真实可见内容后解决），复用既有的 `renderResultBody(r, { hidePrice: true })` 展示校验结果/图片/请求响应但隐藏价格信息；导出内容只用渠道名 `channelName`/`keyMask` 标识来源，不解密、不展示 apiKey 明文。截图库用 `html2canvas-pro`（`LlmBatchTool.tsx` 的图片/HTML/PDF 导出同样懒加载它）而非原版 `html2canvas`：原版 1.x 无法解析 `color-mix()`/`color()` 等现代 CSS 颜色函数（Tailwind v4 主题大量使用，`getComputedStyle` 会把它们解析成原版看不懂的语法直接抛异常导致导出失败），`html2canvas-pro` 是修复这个问题的 API 兼容 fork；`jspdf` 仍会把原版 `html2canvas` 装进 `node_modules`（它内部未使用到的 `.html()` 方法的可选依赖），构建产物里会多出一个从不会被加载的孤立 chunk，无害可忽略。`renderResultBody` 的「已发送的请求体」`<details>` 支持 `defaultOpenReq` 选项——历史记录详情弹窗和导出报告（图片/HTML）传 `true` 使其默认展开（不用点开就能看到请求体），「批量测试」页当前用例结果保持原样折叠（避免批量跑很多用例时列表被拉长）；「响应头」「响应体」两个 `<details>` 始终保持折叠。默认展开的 `<pre>` 额外打了 `data-export-scroll` 标记，配合 `imgWithExpandedScrollAreas` 在导出截图/HTML 时临时去掉其 `max-h-[32rem]`/`overflow-auto` 限制，避免长 JSON 请求体被裁切只截到可视区域

## 代码质量

- 使用双引号包含含撇号的字符串，或转义单引号字符串中的撇号
- 确保 JSX 标签闭合、大括号配平
- 组件默认导出
- 动画只用 `transform`/`opacity`；尊重 `prefers-reduced-motion`
