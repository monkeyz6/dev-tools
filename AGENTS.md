# dev-toolkit

一个纯前端开发者工具集合站：React + Vite + Tailwind CSS v4。包含 6 个工具（Seedance 计费、JSON 可视化/Diff、时间戳转换、AI 请求体格式转换、LLM 批量测试 & Token 计费口径核查、图片信息识别）与 4 套主题。

## 开发命令

```bash
npm run dev        # 启动 Vite dev server（默认 http://localhost:8443，可用 PORT 环境变量改）
npm run build      # 生产构建到 dist/
npm run preview    # 预览生产构建
npm run test:e2e   # 运行 Playwright 端到端测试
```

## 项目结构

- `src/main.tsx` - React 入口，挂载 `src/App.tsx`
- `src/App.tsx` - 单文件应用（6 个工具 + 主题系统 + 侧边栏导航，约 3300 行）
- `src/index.css` - 全局样式 + Tailwind CSS v4 import + 毛玻璃/主题过渡工具类
- `playwright.config.ts` - Playwright 端到端测试配置
- `e2e/` - 端到端测试用例（按工具拆分）

## 技术要点

- 运行时：React 19 + Vite 8 + Tailwind CSS v4（`@tailwindcss/vite` 插件）+ recharts（LLM 批量测试的输出 Token 波动图）
- 样式：Tailwind 工具类 + CSS 变量主题（`--bg`/`--accent` 等，见 `THEMES`），毛玻璃用 `.glass`/`.glass-sidebar`
- 字体：Inter + JetBrains Mono（Google Fonts 引入），主题数据在 App.tsx
- 状态持久化：localStorage（主题 `dev-toolkit-theme`、Seedance 汇率/海外 2.5 单价、LLM 批量测试配置 `llmbatch-config` 与历史报告 `llmbatch-history` 等；API Key 类凭据一律只存内存，不落盘）

## 代码质量

- 使用双引号包含含撇号的字符串，或转义单引号字符串中的撇号
- 确保 JSX 标签闭合、大括号配平
- 组件默认导出
- 动画只用 `transform`/`opacity`；尊重 `prefers-reduced-motion`
