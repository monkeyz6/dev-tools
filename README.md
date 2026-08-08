# Dev Toolkit

> 纯前端开发者工具集合

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 介绍

**Dev Toolkit** 是一个纯前端、零服务端依赖的开发者工具集合站，所有数据均在浏览器本地处理，**不会上传到任何服务器**。包含 10 个实用工具，覆盖计费计算、JSON 处理、时间戳转换、AI 格式转换、LLM 测试、模型探测、图片分析、ID 生成、编解码等领域。

---

## 截图

### 主界面

![Seedance 计费计算器](public/screenshots/hero.png)

### JSON 可视化 & Diff

![JSON 可视化 & Diff](public/screenshots/json-diff.png)

### 时间戳转换

![时间戳转换](public/screenshots/timestamp.png)

### 图片信息识别

![图片信息识别](public/screenshots/image-analyzer.png)

### LLM 批量测试

![LLM 批量测试](public/screenshots/llmbatch.png)

### Base64 编解码

![Base64 编解码](public/screenshots/base64.png)

### ID 生成器

![ID 生成器](public/screenshots/idgen.png)

### 深色主题

![深色主题](public/screenshots/dark-theme.png)

---

## 特性

- ✅ **纯前端** — 所有计算在浏览器本地完成，不上传数据
- ✅ **10 个实用工具** — 覆盖日常开发高频需求
- ✅ **4 套主题** — 浅色、深色、暖陶、山野绿，一键切换
- ✅ **毛玻璃 UI** — 现代化毛玻璃设计，兼顾美观与可读性
- ✅ **数据持久化** — 配置和偏好自动保存到 localStorage
- ✅ **响应式布局** — 适配不同屏幕尺寸
- ✅ **无障碍设计** — 尊重 `prefers-reduced-motion` 和 `prefers-contrast` 系统偏好

---

## 工具一览

| 工具 | 说明 |
|------|------|
| **Seedance 计费** | 火山方舟 / BytePlus ModelArk 视频生成模型计费计算器，支持 4 个模型变体、4 种分辨率，自动计算人民币和美元 |
| **JSON 可视化** | 双栏 JSON 查看/编辑，支持语法高亮、折叠/展开、行号、A/B Diff 对比，拖拽调整左右栏宽度 |
| **时间戳转换** | 毫秒/秒/纳秒级时间戳与日期时间双向转换，自动识别单位，支持相对时间显示 |
| **AI 格式转换** | OpenAI Chat Completions ⇄ Anthropic Messages ⇄ OpenAI Responses 三种请求体格式互转，支持 cache_control 注入 |
| **LLM 批量测试** | Token 计费口径核查工具：同一请求体反复发送，检验输入 Token 一致性、输出 Token 波动、返回模型验真，支持并发控制与历史报告 |
| **模型探测** | API 渠道兼容性实验台：Chat / Responses / Anthropic 三格式 × 参数智能降级、流式、缓存命中（最多 3 次重试）、Token 计数稳定性、并发与错误码，每条请求记录 Token 用量、缓存读写与 Request ID，报告含说明与复现步骤 |
| **图片信息识别** | 拖拽/粘贴/URL 加载图片，自动识别分辨率、格式、尺寸、分辨率等级（8K/4K/1080P 等 30+ 标准），支持宽松匹配、卡片/表格视图、CSV 导出 |
| **ID 生成器** | UUID v4/v7 和随机字符串批量生成，支持多种格式（标准/紧凑/大括号/urn:uuid:），密码学安全随机源 |
| **Base64 编解码** | 双向编解码，支持 URL-safe 模式和宽容解码，实时统计膨胀率 |
| **Unicode 转换** | 支持 6 种编码格式（`\uXXXX` / `\u{XXXXX}` / HTML 实体 / `U+XXXX` / `%uXXXX`），解码自动识别混合格式 |

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/your-username/dev-toolkit.git
cd dev-toolkit

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:8443

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

---

## 技术栈

| 技术 | 用途 |
|------|------|
| [React 19](https://react.dev/) | UI 框架 |
| [Vite 8](https://vitejs.dev/) | 构建工具 |
| [Tailwind CSS v4](https://tailwindcss.com/) | 样式框架 |
| [Recharts v3](https://recharts.org/) | 图表库（LLM 测试输出 Token 波动图） |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [Playwright](https://playwright.dev/) | 端到端测试 |

---

## 主题

| 主题 | 说明 |
|------|------|
| ◐ 浅色 | 白色背景，蓝色强调色 |
| ● 深色 | 近黑色背景，蓝色强调色 |
| ✦ 暖陶 | 暖白/陶土色，哑光土红强调色 |
| ◉ 山野绿 | 灰绿色，哑光鼠尾草绿强调色 |

主题偏好自动保存到 `localStorage`，默认跟随系统 `prefers-color-scheme`。

---

## 项目结构

```
/
├── index.html           # HTML 入口
├── package.json         # 依赖与脚本
├── vite.config.ts       # Vite 配置
├── tsconfig.json        # TypeScript 配置
├── public/
│   ├── logo.svg         # Logo
│   └── screenshots/     # 截图
├── src/
│   ├── main.tsx         # React 入口
│   ├── App.tsx          # 单文件应用（10 个工具 + 主题 + 侧边栏）
│   └── index.css        # 全局样式 + Tailwind CSS
└── e2e/                 # Playwright 端到端测试
    ├── helpers.ts
    ├── app.spec.ts
    ├── json.spec.ts
    ├── llmbatch.spec.ts
    ├── timestamp.spec.ts
    ├── aiconvert.spec.ts
    ├── base64.spec.ts
    ├── unicode.spec.ts
    ├── idgen.spec.ts
    └── seedance.spec.ts
```

---

## 开源描述

**推荐版（150 字以内）：**

> 纯前端开发者工具合集，无需服务端，所有数据本地处理，不上传任何服务器。包含 Seedance 计费、JSON 可视化/Diff、时间戳转换、AI 请求体格式转换、LLM 批量测试与 Token 验真、图片信息识别、ID 生成器、Base64 编解码、Unicode 转换、模型探测等 10 个工具，支持 4 套主题。技术栈：React 19 + Vite 8 + Tailwind CSS v4。

**完整版（350 字以内）：**

> 纯前端开发者工具集合站，包含 10 个实用工具：Seedance 视频生成计费计算器、JSON 可视化与 Diff 对比、时间戳双向转换、AI 请求体格式转换（OpenAI/Anthropic/Responses）、LLM 批量测试与 Token 计费口径核查、图片信息识别（分辨率/格式/等级）、UUID 与随机字符串生成器、Base64 编解码、Unicode 多格式转换、模型探测（API 兼容性测试）。所有数据在浏览器本地处理，不上传任何服务器。内置 4 套主题（浅色/深色/暖陶/山野绿），毛玻璃 UI，配置持久化。技术栈：React 19 + Vite 8 + Tailwind CSS v4 + TypeScript + Recharts。

---

## 开源协议

[MIT](https://opensource.org/licenses/MIT)