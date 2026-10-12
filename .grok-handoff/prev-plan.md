# 图片测试工具：为 Interactions 模型增加 generateContent 用例

改动在 Vue 工具箱 `/Users/wuwei/code/vueCode/2026/tool`，不改 novafare 网关。

## 已确认的行为

- 模型名归一化后属于 Interactions 集合时（现在只有 `gemini-nano-banana-2.1`，含 `google/` 这类前缀），模型框下方增加端点切换：**Interactions** / **generateContent**。
- 默认仍是 Interactions，现有 12 条用例、请求体、通过条件不动。
- 选 generateContent 时，同一集合里的模型共用一套新用例。请求 URL 用用户输入的模型名：`POST /v1/models/{model}:generateContent`，不写死 `gemini-nano-banana-2.1`。
- 其它 Gemini 模型仍走现有 8 条通用用例，不出现这个切换。
- 尺寸和比例只写 `generationConfig.imageConfig.aspectRatio` / `imageSize`。不写 `responseFormat`，不写 `responseModalities`，不在请求里指定输出 mime。
- 新用例 8 条。不包含 512、输出 PNG、输出 WebP、多轮编辑。

## 新用例

请求头与现有 Gemini 用例相同：`x-goog-api-key` + `Content-Type: application/json`。参考图继续用画布合成，字段保持现有的 `inline_data.mime_type` / `data`。

| 用例名 | 请求要点 | 通过条件 |
| --- | --- | --- |
| 默认参数 · 仅 contents | 只有 `contents[].parts[].text`，不带 `generationConfig` | HTTP 2xx 且至少一张图。尺寸、比例、格式只记 info |
| 2K · 16:9 · imageConfig | `imageSize=2K`，`aspectRatio=16:9` | 现有档位下限 + 宽高比 ±5%。格式只记 info |
| 2K · 9:16 · imageConfig | `2K` + `9:16` | 同上 |
| 4K · 21:9 · imageConfig | `4K` + `21:9`（约 $0.113） | 同上 |
| 参考图 · 单图 JPEG · 1K 1:1 · imageConfig | 1 张合成 JPEG + `1K` + `1:1` | 同上，并沿用输入图估价 |
| 参考图 · 三图 PNG · 2K 5:4 · imageConfig | 3 张合成 PNG + `2K` + `5:4` | 同上 |
| thinkingLevel=minimal · 1K 1:1 | 在 imageConfig 上加 `thinkingConfig.thinkingLevel: "minimal"` | 请求被接受并出图。不从响应反推思考档位 |
| google_search · 1K 16:9 | `tools: [{ google_search: {} }]`，外加 `1K` + `16:9` | 出图，且响应里有 grounding 证据 |

用例名与 Interactions 的 12 条都不重复，历史还原按名字对回时不会串到另一端点。

`thinkingLevel` 用文档正文里的小写 `minimal`。官方 REST 示例里的 `"High"` 是另一条用例的写法，这里不采用。

搜索证据看原始 JSON，camelCase / snake_case 都认：`candidates[].groundingMetadata` 或顶层同名字段里，`webSearchQueries`、`groundingChunks`、`searchEntryPoint` 任一非空即通过。不找 `google_search_call`。没有这些字段则「联网搜索」未通过。

## 明确不做的判定

- 不要求 Interactions 的 `id` / `status=completed` / 响应 `model` 回显。generateContent 响应是 `candidates`。
- 不做图片输出 token 的严格相等。定价页 4K 是 3780，图像指南表是 2520，两边冲突。若响应里有 `usageMetadata.candidatesTokensDetails` 的 IMAGE `tokenCount`，只记一条 info，不进通过率。缺字段也只记 info。
- 不把 `thought: true` 的 part 算成成图。现有 generateContent 解析会把思考图算进张数，thinking 用例会被「返回张数 = 1」误判。解析 `candidates` 时跳过 `thought === true` 的 part。没有 thought 的现有 Gemini 用例结果不变。

## 代码落点

`src/tools/ImgApiTestTool.tsx`

- 新增 `IMG_NANO_GENERATE_CONTENT_CASES`。
- `imgBuildCases(type, model, endpoint)`：Gemini 且是 Interactions 模型时，按端点选 12 条或 8 条；否则仍用 `IMG_TEST_SETS`。
- `imgBuildPlan`：Interactions 模型且端点为 generateContent 时，走与现有 Gemini 相同的 `contents` + `imageConfig` 构造，并按参数补上 `thinkingConfig` 或 `tools`。默认参数用例不带 `generationConfig`。不要进现在的 `imgIsNanoBanana21` → `/v1beta/interactions` 分支。
- 模型框下增加端点选择，仅在 Gemini 且模型属于 Interactions 集合时显示。提示文案随端点变成对应的 POST 路径。
- 切换端点与跨 nano 边界一样：已有结果、取消过勾选或改过请求预览时先 `confirm`，确认后重建用例并清空当前 `runId`，避免一批历史里混两种协议。
- `imgtest-ui` 增加可选字段 `geminiEndpoint`。旧配置没有该字段时视为 `interactions`。
- `ImgRecord` 增加可选 `geminiEndpoint`。写入历史时带上。还原批次时用记录上的端点调用 `imgBuildCases`，再按用例名灌回结果。旧记录没有该字段且模型是 nano 时，还原到 Interactions。
- 历史批次行在接口名旁显示端点（旧记录按上面的规则显示 Interactions）。

`src/tools/img-report/generate-content.ts`（纯函数）+ `generate-content.test.ts`

- 从 generateContent JSON 读出是否有 grounding，以及 IMAGE token 数（没有则为 null）。
- `imgBuildChecks` 在 `targets.searchReq` 且不是 Interactions 时追加「联网搜索」。有 token 数时追加 info「图片输出 token」。
- 能力矩阵已把「联网搜索」归到 `search`，检查名沿用「联网搜索」，不必改矩阵键。

`src/tools/img-report/types.ts`

- `ImgRecord.geminiEndpoint?: 'interactions' | 'generateContent'`。

`AGENTS.md`

- 更新图片接口测试那一段：nano 模型可切换端点；generateContent 的 8 条用例、字段和通过条件按上面写。Interactions 的 12 条描述保持原样。

## 验证

- `npm run test:unit`：新的 grounding / token 解析单测，以及现有 `interactions.test.ts` 仍过。
- Playwright：现有 `e2e/imgtest-nano-banana.spec.ts` 应原样通过（默认仍是 Interactions）。另加一条：切到 generateContent 后是 8 条用例，mock `POST /v1/models/gemini-nano-banana-2.1:generateContent`，核对 imageConfig、thinkingConfig、`tools:[{google_search:{}}]`，以及没有 `response_format`、`previous_interaction_id`、`responseModalities`。搜索响应无 grounding 时该条未通过，有 grounding 时通过。
- 浏览器里走一遍切换：默认 12 条 Interactions → 切到 generateContent 看到 8 条和对应路径 → 再切回 12 条。不启动真实上游。

## 不改

- novafare 的路由、DTO、计费。
- 通用 Gemini 8 条、OpenAI / Grok / Seedream / ZeroFA 用例。
- Interactions 的 12 条请求体和三层判定（结构、模型回显、token、指纹）。
