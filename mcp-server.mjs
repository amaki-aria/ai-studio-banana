#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPSCALE_SCRIPT = path.join(__dirname, "upscale.ps1");
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".gemini", "antigravity", "scratch", "banana-images");
const DEFAULT_MODEL = "gemini-3.1-flash-image";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

const KNOWN_MODELS = [
  { id: "gemini-3.1-flash-image", protocol: "gemini", label: "Nano Banana 2 (Gemini 3.1 Flash Image)", notes: "Gemini 原生协议，支持 16:9 / 2K+ 高清出图与参考图" },
  { id: "gemini-3-pro-image", protocol: "gemini", label: "Nano Banana Pro (Gemini 3 Pro Image)", notes: "Gemini 原生协议，高质量复杂构图" },
  { id: "gemini-3.1-flash-lite-image", protocol: "gemini", label: "Nano Banana 2 Lite", notes: "Gemini 原生协议，轻量快速出图" },
  { id: "gemini-nano-banana-2.1", protocol: "gemini", label: "Nano Banana 2.1 (官方)", notes: "Google AI Studio 官方模型 ID" },
  { id: "nano-banana-2.1", protocol: "openai-chat", label: "Nano Banana 2.1 (中转 OpenAI Chat)", notes: "走 /v1/chat/completions" },
  { id: "gemini-3.1-flash-image-preview", protocol: "openai-chat", label: "Gemini 3.1 Flash Image Preview", notes: "中转 OpenAI Chat 协议" },
  { id: "gemini-3-pro-image-preview", protocol: "openai-chat", label: "Gemini 3 Pro Image Preview", notes: "中转 OpenAI Chat 协议" },
  { id: "gpt-image-2", protocol: "openai-images", label: "GPT Image 2", notes: "走 /v1/images/generations (或 edits)" },
  { id: "gpt-image-2.5-flare", protocol: "openai-images", label: "GPT Image 2.5 Flare", notes: "走 /v1/images/generations" },
  { id: "gpt-image-2.6-flare", protocol: "openai-images", label: "GPT Image 2.6 Flare", notes: "走 /v1/images/generations" },
];

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const ASPECT_TO_OPENAI_SIZE = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "3:2": "1536x1024",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
  "2:3": "1024x1536",
  "3:4": "1024x1536",
};

function loadConfig() {
  let fileCfg = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch {
    fileCfg = {};
  }
  const envKey = process.env.GEMINI_API_KEY || process.env.AI_STUDIO_API_KEY || "";
  return {
    apiKey: fileCfg.apiKey || envKey,
    apiKeySource: fileCfg.apiKey ? "config.json" : envKey ? "environment" : "none",
    defaultModel: fileCfg.defaultModel || DEFAULT_MODEL,
    outputDir: fileCfg.outputDir || DEFAULT_OUTPUT_DIR,
    baseUrl: (fileCfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

function saveConfig(patch) {
  let current = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      current = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch {
    current = {};
  }
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      next[k] = typeof v === "string" ? v.trim() : v;
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  return loadConfig();
}

function maskKey(key) {
  if (!key) return "(未配置)";
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function resolveProtocol(model, requestedProtocol, baseUrl) {
  if (requestedProtocol && requestedProtocol !== "auto") {
    return requestedProtocol;
  }
  const m = model.toLowerCase();
  if (m.startsWith("gpt-image") || m.startsWith("dall-e")) {
    return "openai-images";
  }
  const isOfficialGoogle = baseUrl.includes("generativelanguage.googleapis.com");
  if (!isOfficialGoogle && (m === "nano-banana-2.1" || m.endsWith("-preview"))) {
    return "openai-chat";
  }
  return "gemini";
}

function buildOutputPath(baseOutputPath, outputDir, stamp, index, ext) {
  if (baseOutputPath && index === 1) {
    return path.resolve(baseOutputPath);
  }
  if (baseOutputPath) {
    const parsed = path.parse(path.resolve(baseOutputPath));
    return path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext || ext}`);
  }
  return path.join(outputDir, `banana_${stamp}_${index}${ext}`);
}

function writeImageBuffer(outPath, buf) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

async function saveFromUrlOrDataUri(urlOrData, baseOutputPath, outputDir, stamp, index) {
  if (urlOrData.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(urlOrData);
    if (!match) return null;
    const ext = EXT_BY_MIME[match[1]] || ".png";
    const outPath = buildOutputPath(baseOutputPath, outputDir, stamp, index, ext);
    writeImageBuffer(outPath, Buffer.from(match[2], "base64"));
    return outPath;
  }
  const res = await fetch(urlOrData);
  if (!res.ok) {
    throw new Error(`下载生成图片失败 (HTTP ${res.status}): ${urlOrData}`);
  }
  const contentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
  const ext = EXT_BY_MIME[contentType] || ".png";
  const outPath = buildOutputPath(baseOutputPath, outputDir, stamp, index, ext);
  const buf = Buffer.from(await res.arrayBuffer());
  writeImageBuffer(outPath, buf);
  return outPath;
}

function readReferenceImages(refPaths) {
  const loaded = [];
  if (!Array.isArray(refPaths)) return loaded;
  for (const imgPath of refPaths) {
    if (!imgPath || typeof imgPath !== "string") continue;
    const resolved = path.resolve(imgPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`参考图片不存在：${resolved}`);
    }
    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || "image/png";
    const buffer = fs.readFileSync(resolved);
    loaded.push({ resolved, mimeType, buffer, base64: buffer.toString("base64") });
  }
  return loaded;
}

async function generateViaGemini(cfg, model, prompt, refs, args, stamp) {
  const parts = refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.base64 } }));
  parts.push({ text: prompt });

  const imageSize = args.imageSize ? String(args.imageSize).trim() : "";
  const generationConfig = {
    responseModalities: imageSize === "2K" || imageSize === "4K" ? ["IMAGE"] : ["TEXT", "IMAGE"],
  };
  const imageConfig = {};
  if (args.aspectRatio) imageConfig.aspectRatio = String(args.aspectRatio).trim();
  if (imageSize) imageConfig.imageSize = imageSize;
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }

  const endpoint = `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { isError: true, content: [{ type: "text", text: `Gemini 接口返回非 JSON (HTTP ${res.status}): ${rawText.slice(0, 500)}` }] };
  }
  if (!res.ok) {
    return { isError: true, content: [{ type: "text", text: `Gemini API 请求失败 (HTTP ${res.status}, model=${model}): ${json?.error?.message || rawText.slice(0, 500)}` }] };
  }

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const resParts = candidates[0]?.content?.parts || [];
  const savedFiles = [];
  const texts = [];
  let imgIndex = 0;

  for (const part of resParts) {
    if (part.text) {
      texts.push(part.text);
    } else if (part.inlineData?.data) {
      imgIndex += 1;
      const ext = EXT_BY_MIME[part.inlineData.mimeType || "image/png"] || ".png";
      const outPath = buildOutputPath(args.outputPath, cfg.outputDir, stamp, imgIndex, ext);
      writeImageBuffer(outPath, Buffer.from(part.inlineData.data, "base64"));
      savedFiles.push(outPath);
    }
  }

  if (savedFiles.length === 0) {
    const blockReason = json?.promptFeedback?.blockReason || candidates[0]?.finishReason || "unknown";
    return {
      isError: true,
      content: [{ type: "text", text: `模型未返回图片数据（原因: ${blockReason}）。${texts.length ? "模型文本回复：\n" + texts.join("\n") : ""}` }],
    };
  }
  return { savedFiles, texts, protocol: "gemini" };
}

async function generateViaOpenAIImages(cfg, model, prompt, refs, args, stamp) {
  const size = args.size
    ? String(args.size).trim()
    : args.aspectRatio && ASPECT_TO_OPENAI_SIZE[String(args.aspectRatio).trim()]
      ? ASPECT_TO_OPENAI_SIZE[String(args.aspectRatio).trim()]
      : "1024x1024";

  let res;
  if (refs.length > 0) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    if (args.quality) form.append("quality", String(args.quality).trim());
    if (args.n) form.append("n", String(args.n));
    for (const r of refs) {
      const blob = new Blob([r.buffer], { type: r.mimeType });
      form.append(refs.length > 1 ? "image[]" : "image", blob, path.basename(r.resolved));
    }
    res = await fetch(`${cfg.baseUrl}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
    });
  } else {
    const payload = { model, prompt, size };
    if (args.quality) payload.quality = String(args.quality).trim();
    if (args.style) payload.style = String(args.style).trim();
    if (args.n) payload.n = Number(args.n);
    res = await fetch(`${cfg.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  }

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { isError: true, content: [{ type: "text", text: `OpenAI Images 接口返回非 JSON (HTTP ${res.status}): ${rawText.slice(0, 500)}` }] };
  }
  if (!res.ok) {
    return { isError: true, content: [{ type: "text", text: `OpenAI Images 请求失败 (HTTP ${res.status}, model=${model}): ${json?.error?.message || rawText.slice(0, 500)}` }] };
  }

  const items = Array.isArray(json.data) ? json.data : [];
  const savedFiles = [];
  const texts = [];
  let imgIndex = 0;

  for (const item of items) {
    if (item.revised_prompt) texts.push(`优化后提示词：${item.revised_prompt}`);
    if (item.b64_json) {
      imgIndex += 1;
      const outPath = buildOutputPath(args.outputPath, cfg.outputDir, stamp, imgIndex, ".png");
      writeImageBuffer(outPath, Buffer.from(item.b64_json, "base64"));
      savedFiles.push(outPath);
    } else if (item.url) {
      imgIndex += 1;
      const outPath = await saveFromUrlOrDataUri(item.url, args.outputPath, cfg.outputDir, stamp, imgIndex);
      if (outPath) savedFiles.push(outPath);
    }
  }

  if (savedFiles.length === 0) {
    return { isError: true, content: [{ type: "text", text: `OpenAI Images 接口未返回图片数据：${rawText.slice(0, 500)}` }] };
  }
  return { savedFiles, texts, protocol: "openai-images" };
}

async function generateViaOpenAIChat(cfg, model, prompt, refs, args, stamp) {
  const contentParts = refs.map((r) => ({
    type: "image_url",
    image_url: { url: `data:${r.mimeType};base64,${r.base64}` },
  }));
  const hintParts = [];
  if (args.aspectRatio) hintParts.push(`aspect ratio ${args.aspectRatio}`);
  if (args.imageSize) hintParts.push(`resolution ${args.imageSize}`);
  const finalPrompt = hintParts.length ? `${prompt}\n\n[Image parameters: ${hintParts.join(", ")}]` : prompt;
  contentParts.push({ type: "text", text: finalPrompt });

  const payload = {
    model,
    messages: [{ role: "user", content: refs.length ? contentParts : finalPrompt }],
  };

  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { isError: true, content: [{ type: "text", text: `OpenAI Chat 接口返回非 JSON (HTTP ${res.status}): ${rawText.slice(0, 500)}` }] };
  }
  if (!res.ok) {
    return { isError: true, content: [{ type: "text", text: `OpenAI Chat 请求失败 (HTTP ${res.status}, model=${model}): ${json?.error?.message || rawText.slice(0, 500)}` }] };
  }

  const msg = json?.choices?.[0]?.message || {};
  const savedFiles = [];
  const texts = [];
  let imgIndex = 0;

  if (Array.isArray(msg.images)) {
    for (const img of msg.images) {
      const url = img?.image_url?.url || img?.url;
      if (url) {
        imgIndex += 1;
        const outPath = await saveFromUrlOrDataUri(url, args.outputPath, cfg.outputDir, stamp, imgIndex);
        if (outPath) savedFiles.push(outPath);
      }
    }
  }

  const textBody = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((p) => p?.text || "").join("\n")
      : "";

  if (textBody) {
    const mdRegex = /!\[[^\]]*\]\(((?:data:image\/[^;]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^)\s]+))\)/g;
    let m;
    while ((m = mdRegex.exec(textBody)) !== null) {
      imgIndex += 1;
      const outPath = await saveFromUrlOrDataUri(m[1], args.outputPath, cfg.outputDir, stamp, imgIndex);
      if (outPath) savedFiles.push(outPath);
    }
    if (savedFiles.length === 0) {
      const urlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s"'<>]*)?)/gi;
      while ((m = urlRegex.exec(textBody)) !== null) {
        imgIndex += 1;
        const outPath = await saveFromUrlOrDataUri(m[1], args.outputPath, cfg.outputDir, stamp, imgIndex);
        if (outPath) savedFiles.push(outPath);
      }
    }
    const cleaned = textBody.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, "[图片]").trim();
    if (cleaned) texts.push(cleaned);
  }

  if (savedFiles.length === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: `OpenAI Chat 响应中未解析出图片。模型返回内容：\n${(textBody || rawText).slice(0, 600)}` }],
    };
  }
  return { savedFiles, texts, protocol: "openai-chat" };
}

async function runUpscale(inputPath, outputPath, { scale = 2, targetWidth = 0, targetHeight = 0, sharpen = true } = {}) {
  const resolvedIn = path.resolve(inputPath);
  if (!fs.existsSync(resolvedIn)) {
    throw new Error(`找不到要超分的图片：${resolvedIn}`);
  }
  const parsed = path.parse(resolvedIn);
  const resolvedOut = outputPath
    ? path.resolve(outputPath)
    : path.join(parsed.dir, `${parsed.name}_${targetWidth ? `${targetWidth}px` : `${scale}x`}${parsed.ext || ".png"}`);

  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    UPSCALE_SCRIPT,
    "-InputPath",
    resolvedIn,
    "-OutputPath",
    resolvedOut,
    "-Scale",
    String(scale),
    "-TargetWidth",
    String(targetWidth),
    "-TargetHeight",
    String(targetHeight),
    "-Sharpen",
    sharpen ? "1" : "0",
  ];
  const { stdout } = await execFileAsync("powershell.exe", psArgs, { windowsHide: true });
  return { outputPath: resolvedOut, summary: stdout.trim() };
}

async function handleGenerateImage(args) {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    return {
      isError: true,
      content: [{ type: "text", text: "尚未配置 API Key。请先提供你的 AI Studio 或中转站 API Key 并调用 `banana_configure` 保存。" }],
    };
  }

  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    return { isError: true, content: [{ type: "text", text: "参数错误：prompt 不能为空。" }] };
  }

  let refs = [];
  try {
    refs = readReferenceImages(args.referenceImages);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: err.message }] };
  }

  const model = (args.model || cfg.defaultModel).trim();
  const protocol = resolveProtocol(model, args.protocol, cfg.baseUrl);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  let outcome;
  if (protocol === "openai-images") {
    outcome = await generateViaOpenAIImages(cfg, model, prompt, refs, args, stamp);
  } else if (protocol === "openai-chat") {
    outcome = await generateViaOpenAIChat(cfg, model, prompt, refs, args, stamp);
  } else {
    outcome = await generateViaGemini(cfg, model, prompt, refs, args, stamp);
  }

  if (outcome.isError) return outcome;

  const finalFiles = [];
  const upscaleNotes = [];
  const upscaleRaw = args.upscale ? String(args.upscale).trim().toLowerCase() : "";
  if (upscaleRaw && upscaleRaw !== "false" && upscaleRaw !== "0") {
    const is4k = upscaleRaw === "4k";
    const scaleNum = is4k ? 2 : Number(upscaleRaw) || 2;
    for (const f of outcome.savedFiles) {
      const up = await runUpscale(f, null, {
        scale: scaleNum,
        targetWidth: is4k ? 3840 : 0,
        sharpen: true,
      });
      finalFiles.push(up.outputPath);
      upscaleNotes.push(`超分：${up.summary} -> ${up.outputPath}`);
    }
  } else {
    finalFiles.push(...outcome.savedFiles);
  }

  const summaryLines = [
    `✅ 已通过 ${outcome.protocol} (${model}) 生成 ${finalFiles.length} 张图片：`,
    ...finalFiles.map((f) => `- ${f}`),
  ];
  if (upscaleNotes.length) {
    summaryLines.push("", ...upscaleNotes);
  }
  if (outcome.texts?.length) {
    summaryLines.push("", "附言：", ...outcome.texts);
  }
  return { content: [{ type: "text", text: summaryLines.join("\n") }] };
}

const TOOLS = [
  {
    name: "banana_configure",
    description: "配置或更新 Google AI Studio / 中转站 API Key、默认模型、输出目录或接口地址（baseUrl）。",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string", description: "API Key（AI Studio 或中转站 Key）" },
        defaultModel: { type: "string", description: "默认模型 ID，如 gemini-3.1-flash-image 或 gpt-image-2" },
        outputDir: { type: "string", description: "默认图片保存目录" },
        baseUrl: { type: "string", description: "接口根地址，默认 https://generativelanguage.googleapis.com（中转站如 https://ai.yumeyuki.moe）" },
      },
    },
  },
  {
    name: "banana_list_models",
    description: "查看支持的 Nano Banana 与 OpenAI (gpt-image) 绘图模型列表以及当前配置状态。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "banana_generate_image",
    description: "调用 Nano Banana (Gemini) 或 OpenAI (gpt-image-*) 模型生成或编辑图片，自动兼容 Gemini 原生与 OpenAI 协议。",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "绘图或改图提示词" },
        model: { type: "string", description: "模型 ID，默认 gemini-3.1-flash-image；支持 gpt-image-2、gpt-image-2.5-flare、nano-banana-2.1 等" },
        protocol: {
          type: "string",
          enum: ["auto", "gemini", "openai-images", "openai-chat"],
          description: "可选接口协议：auto（自动识别）、gemini（原生 :generateContent）、openai-images（/v1/images/generations）、openai-chat（/v1/chat/completions）",
        },
        aspectRatio: { type: "string", description: "可选宽高比，如 1:1、16:9、9:16、4:3、3:4、3:2、2:3、21:9" },
        imageSize: { type: "string", description: "Gemini 分辨率档位：0.5K（仅 3.1-flash-image）、1K（默认）、2K、4K" },
        size: { type: "string", description: "OpenAI 图像尺寸，如 1024x1024、1536x1024、1024x1536、auto" },
        quality: { type: "string", description: "OpenAI 图像质量，如 standard、hd、low、medium、high、auto" },
        style: { type: "string", description: "OpenAI 画风，如 vivid、natural" },
        n: { type: "integer", description: "OpenAI 生成张数（1~10）" },
        referenceImages: { type: "array", items: { type: "string" }, description: "可选本机参考图片路径列表（用于图生图或编辑）" },
        upscale: { type: "string", description: "可选本机超分：填 2 做 2x 超分，或填 4K 缩放到 3840px 宽（含锐化）" },
        outputPath: { type: "string", description: "可选图片保存路径；留空则自动保存到默认输出目录" },
      },
    },
  },
  {
    name: "banana_upscale_image",
    description: "对本机已有的图片执行零依赖 2x 超分或 4K（3840px 宽）高质量缩放与锐化。",
    inputSchema: {
      type: "object",
      required: ["imagePath"],
      properties: {
        imagePath: { type: "string", description: "需要超分的本地图片路径" },
        scale: { type: "number", description: "放大倍率，默认 2（即 2x 超分）" },
        targetWidth: { type: "integer", description: "可选指定目标宽度（如 3840 表示 4K 宽），设置后按原图比例缩放" },
        sharpen: { type: "boolean", description: "是否开启边缘锐化（默认 true）" },
        outputPath: { type: "string", description: "可选输出文件路径；留空则自动在原图旁生成带 _2x 后缀的新文件" },
      },
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handleRequest(req) {
  const { id, method, params } = req;
  if (id === undefined || id === null) return;
  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "ai-studio-banana", version: "1.1.0" },
        },
      });
    }
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name === "banana_configure") {
        const updated = saveConfig(args);
        return send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `配置已保存：\n- API Key: ${maskKey(updated.apiKey)} (${updated.apiKeySource})\n- 默认模型: ${updated.defaultModel}\n- 输出目录: ${updated.outputDir}\n- Base URL: ${updated.baseUrl}`,
              },
            ],
          },
        });
      }
      if (name === "banana_list_models") {
        const cfg = loadConfig();
        const lines = [
          "当前配置状态：",
          `- API Key: ${maskKey(cfg.apiKey)} (来源: ${cfg.apiKeySource})`,
          `- 默认模型: ${cfg.defaultModel}`,
          `- 输出目录: ${cfg.outputDir}`,
          `- Base URL: ${cfg.baseUrl}`,
          "",
          "支持的常用绘图模型：",
          ...KNOWN_MODELS.map((m) => `- \`${m.id}\` [${m.protocol}] — ${m.label}：${m.notes}`),
        ];
        return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: lines.join("\n") }] } });
      }
      if (name === "banana_generate_image") {
        const result = await handleGenerateImage(args);
        return send({ jsonrpc: "2.0", id, result });
      }
      if (name === "banana_upscale_image") {
        const up = await runUpscale(args.imagePath, args.outputPath, {
          scale: args.scale ?? 2,
          targetWidth: args.targetWidth ?? 0,
          sharpen: args.sharpen ?? true,
        });
        return send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `✅ 超分完成（${up.summary}）：\n- ${up.outputPath}` }],
          },
        });
      }
      return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${name}` } });
    }
    return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    return send({ jsonrpc: "2.0", id, error: { code: -32603, message: err?.message || String(err) } });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    void handleRequest(req);
  } catch {
    // Ignore malformed lines
  }
});
