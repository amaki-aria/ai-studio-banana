# AI Studio Banana (`ai-studio-banana`)

专为 **Google Antigravity** 打造的零依赖绘图插件（MCP Server + Skill）：使用你自己的 **Google AI Studio API Key** 或 **第三方中转站 Key** 调用 Nano Banana（Gemini 原生/Chat）以及 OpenAI（`gpt-image-*`）模型进行文生图、图生图与本机 2× 超分，**完全独立于 Antigravity 自带绘图额度**。

## 核心特性

- **零第三方依赖**：仅依赖 Node.js（>= 20，推荐 >= 22）内置 `fetch` 与 `FormData`，无需 `npm install`。
- **多协议自动适配（`protocol: "auto"`）**：
  - **Gemini 原生协议**（`/v1beta/models/<model>:generateContent`）：支持 `gemini-3.1-flash-image`、`gemini-3-pro-image`、`gemini-3.1-flash-lite-image`、`gemini-nano-banana-2.1`，支持 `aspectRatio`（`16:9` / `9:16` / `1:1` 等）与 `imageSize`（`0.5K` / `1K` / `2K` / `4K`）。
  - **OpenAI Images 协议**（`/v1/images/generations` & `/v1/images/edits`）：支持 `gpt-image-*` / `dall-e-*` 文生图与带参考图改图，支持 `size` / `quality` / `style` / `n`。
  - **OpenAI Chat 协议**（`/v1/chat/completions`）：兼容中转站仅开放 Chat 端点的 `nano-banana-2.1`、`*-preview` 等模型，自动解析并下载保存返回图片。
- **支持自定义 `baseUrl`**：既可直连 Google AI Studio，也可无缝接入各类中转站 / 反代服务。
- **本机零依赖 2× 超分与边缘锐化（Windows）**：内置 `upscale.ps1`（`System.Drawing` 高质量双三次插值 + 线条锐化），支持生成时顺带 `upscale: "2"` / `"4K"` 或通过 `banana_upscale_image` 对已有图片超分。

---

## 快速安装

### 环境要求
- **Node.js >= 20**
- **Google Antigravity**

### 一键安装

```bash
git clone https://github.com/<your-username>/ai-studio-banana.git
cd ai-studio-banana
node setup.mjs
```

`setup.mjs` 会自动将插件部署到 `~/.gemini/config/plugins/ai-studio-banana/`，并自动写入当前机器的 `node` 可执行文件路径到 `mcp_config.json`。

安装完成后，**重启一次 Antigravity** 即可生效。

---

## 配置与使用

重启后，直接在 Antigravity 对话中告诉助手即可：

1. **配置 API Key（支持 AI Studio 官方或中转站）**：
   > 「帮我配置 AI Studio Banana，API Key 是 `...`，baseUrl 是 `https://...`（直连官方可不填）」
   *(配置将保存在插件目录下的 `config.json`，也可通过系统环境变量 `GEMINI_API_KEY` 提供。)*

2. **指定比例、分辨率与参考图生图**：
   > 「用 Banana 画一张 4K、16:9 的赛博朋克城市夜景，参考图见 `...`」

3. **使用 `gpt-image-*` 或 2× 超分**：
   > 「用 `gpt-image-2.6-flare` 结合参考图生成一张 16:9 的图，并做 2x 超分」

---

## MCP 工具列表

| 工具名 | 说明 |
| :--- | :--- |
| `banana_configure` | 配置/更新 `apiKey`、`baseUrl`、`defaultModel`、`outputDir` |
| `banana_list_models` | 查看支持的模型列表与当前脱敏配置状态 |
| `banana_generate_image` | 文生图 / 参考图改图（支持 `model`、`protocol`、`aspectRatio`、`imageSize`、`size`、`quality`、`style`、`n`、`referenceImages`、`upscale`） |
| `banana_upscale_image` | 对本地已有图片执行 2× 超分或 4K（3840px 宽）缩放与锐化 |

---

## License

[MIT](./LICENSE)
