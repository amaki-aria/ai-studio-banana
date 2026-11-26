---
name: ai-studio-banana
description: Generate or edit images using Google AI Studio's Nano Banana models (gemini-3.1-flash-image, gemini-3-pro-image, gemini-nano-banana-2.1) via the user's own AI Studio API key, separate from Antigravity's built-in image-generator quota. Use whenever the user asks to draw/generate/edit images with AI Studio, Banana, or their own Gemini API key.
---

# AI Studio Banana 绘图技能

当用户希望使用 **Google AI Studio / Banana 模型**（或其自己的 Gemini API Key 额度）进行绘图或改图时，优先调用本插件提供的 MCP 工具，而不是 Antigravity 自带的 `image-generator`：

1. **首次使用或未配置 Key 时**：
   - 先调用 `banana_list_models` 检查配置状态。
   - 若尚未配置 API Key，请向用户索取 Google AI Studio API Key，并调用 `banana_configure` 保存到本地插件配置文件（`config.json`）。
2. **生成或编辑图片**：
   - 调用 `banana_generate_image`：
     - `prompt`：绘图/改图提示词。
     - `model`：可选，默认 `gemini-3.1-flash-image`（Nano Banana 2）；也支持 `gpt-image-2`、`gpt-image-2.5-flare`、`gpt-image-2.6-flare`、`nano-banana-2.1` 等。
     - `protocol`：可选 `auto`（默认自动识别）、`gemini`、 `openai-images`（`/v1/images/generations` 与 `/v1/images/edits`）、`openai-chat`（`/v1/chat/completions`）。
     - `aspectRatio`：可选比例，如 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`21:9`（传给 `gpt-image-*` 时自动映射为对应 `size`）。
     - `imageSize`：Gemini 分辨率，如 `0.5K`（仅 `gemini-3.1-flash-image`）、`1K`、`2K`、`4K`。
     - `size` / `quality` / `style` / `n`：OpenAI `gpt-image-*` 专用参数。
     - `referenceImages`：可选本机参考图片路径数组（同时支持 Gemini 与 `gpt-image-*` 改图）。
     - `upscale`：可选本机超分后处理，填 `"2"` 执行 2x 超分锐化，或填 `"4K"` 缩放到 3840px 宽。
     - `outputPath`：可选输出路径；未指定时自动保存到配置的输出目录并返回文件路径。
3. **对已有图片做超分**：
   - 如用户想把已生成的图片放大到 2x 或 4K，可调用 `banana_upscale_image`（传入 `imagePath`、`scale` 或 `targetWidth: 3840`）。
4. **返回结果**：
   - 生成成功后，向用户提供可点击的 `file://` 图片路径链接。
