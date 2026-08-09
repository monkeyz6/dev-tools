# dev-toolkit

一个纯前端实现的开发工具箱：React + Vite + Tailwind CSS v4。包含 13 个工具（Seedance 计费、JSON 可视化/Diff、时间戳转换、AI 请求体格式转换、LLM 批量测试 & Token 计费口径核查、图片接口测试、模型探测、图片信息识别、视频信息检测、ID 生成器、Base64 编解码、Unicode 转换、GraphQL 格式化）与 4 套主题。

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
- 运行时：React 19 + Vite 8 + Tailwind CSS v4（`@tailwindcss/vite` 插件）+ recharts（LLM 批量测试的输出 Token 波动图）+ `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities`（LLM 批量测试的提示词库拖拽排序）
- 样式：Tailwind 工具类 + CSS 变量主题（`--bg`/`--accent` 等，见 `THEMES`），毛玻璃用 `.glass`/`.glass-sidebar`
- 字体：直接用 CSS `font-family` 声明 Inter（正文，`src/index.css`）/ JetBrains Mono（等宽，`App.tsx` 内联样式），不自建 `@font-face`、不下载/打包字体文件——本机没装就走后面的系统字体兜底栈；主题数据在 App.tsx
- 状态持久化：localStorage（主题 `dev-toolkit-theme`、Seedance 汇率/海外 2.5 单价、ID 生成器配置 `idgen-opts`、Base64 选项 `base64-opts`、Unicode 选项 `unicode-opts`、LLM 批量测试配置 `llmbatch-config`、提示词库 `llmbatch-prompts`、历史报告 `llmbatch-history`、模型探测配置 `modelprobe-config`、模型探测历史 `modelprobe-history`、图片接口测试配置 `imgtest-*`（渠道 `imgtest-channels`、价格 `imgtest-prices`、汇率 `imgtest-rate`、历史 `imgtest-history` 等））。`llmbatch-config` 不再存储请求体原文（已迁移到 `llmbatch-prompts`，首次加载时自动迁移一次）。API Key 用 Web Crypto（AES-GCM）加密后落盘，读取时解密回填：LLM 批量测试/模型探测的 key 独立存 `llmbatch-key` / `modelprobe-key`，图片接口测试的渠道 key 加密后存于渠道对象内（passphrase `dev-toolkit-imgtest-v1`）；纯前端工具没有服务端，密钥必然内嵌在代码里，这只是避免明文直接躺在 localStorage 里，不是抵御可执行页面 JS 的攻击者的真正机密保护。图片接口测试的历史记录只存缩略图（canvas 压缩到最长边 ≤160px，JPEG）不存原图，避免撑爆 localStorage 配额

## 代码质量

- 使用双引号包含含撇号的字符串，或转义单引号字符串中的撇号
- 确保 JSX 标签闭合、大括号配平
- 组件默认导出
- 动画只用 `transform`/`opacity`；尊重 `prefers-reduced-motion`
