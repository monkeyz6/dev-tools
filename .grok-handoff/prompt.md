# 任务：为"图片测试工具"新增 generateContent 端点测试

（说明：这个任务上次误在 novafare 网关仓库里启动了。实际要改的是当前这个 Vue 工具箱仓库。请在这里重新探索代码，重新出计划。）

## 背景
- 当前项目是一个前端工具箱，本次要扩展其中的"图片测试工具"。
- 工具目前只支持测试 `/v1beta/interactions` 端点。
- 模型 `gemini-nano-banana-2.1` 还支持另一种调用格式 `/v1/models/gemini-nano-banana-2.1:generateContent`，现有用例还没覆盖。

## 需求
1. 在"图片测试工具"里新增针对 `/v1/models/{model}:generateContent` 端点的测试用例。
2. 这个端点理论上不限制模型，所以不要只适配 `gemini-nano-banana-2.1`。凡是 `/v1beta/interactions` 端点支持测试的模型，都要能用新端点测试。
3. 保留现有 `/v1beta/interactions` 端点的测试能力。

## 工作流程（先计划，后实现）
### 阶段一：制定计划
1. 先探索现有代码架构，重点了解"图片测试工具"的端点配置方式、模型列表定义在哪里、请求怎么构造和响应怎么解析、测试用例怎么组织。
2. 基于现有架构，制定新增端点测试的最佳修改方案。
3. 有任何不确定的地方，必须用 `ask_user_question` 问我，不得自行假设。采用苏格拉底式提问，层层追问，帮我逐步澄清需求，目标是和我一起定出最佳方案。
4. 输出完整的修改计划，等我确认后再进入实现阶段。

### 阶段二：实现
- 按确认后的计划修改代码，新增代码与现有架构和代码风格保持一致。

另外确认一下：`/v1beta/interactions` 能跑通的用例，不代表 `/v1/models/{model}:generateContent` 也能跑通。你可以开多个 Agent，从不同维度调研。

## 我上一轮已经做过的选择（沿用，不用再问）
1. 新端点的接入方式：端点切换，加上按 generateContent 重写的用例。模型旁边加 Interactions / generateContent 切换。选 Interactions 仍然是现有 12 条用例；选 generateContent 时，凡是走 Interactions 的模型都用同一套新用例。其他 Gemini 模型仍走现有的 8 条用例。URL 用用户填的模型名，不写死。
2. 尺寸字段：只用 `generationConfig.imageConfig`（aspectRatio / imageSize），不用 responseFormat。输出格式只记 info，不计入通过率。
3. 512、输出 PNG、输出 WebP、多轮这四条不放进新用例。generateContent 只留 8 条：默认参数、2K·16:9、2K·9:16、4K·21:9、单图 JPEG 参考、三图 PNG 参考、thinkingLevel=minimal、google_search（搜索看 groundingMetadata）。

## 上一轮的计划（仅供参考）
在 `.grok-handoff/prev-plan.md`。上一轮是在网关仓库里调研的，请对照本仓库的真实代码逐条核实，发现不对的地方就修正。有新的不确定点，用 ask_user_question 问我。
