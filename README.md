# 节点伪装 + 多协议代理（Node.js 单文件容器版）

> **把 Node.js 容器伪装成 Hacker News 资讯站，Key 揭示真实节点订阅，单文件 index.js 开箱即用。**

部署到 Hugging Face Spaces / Koyeb / Render / Zeabur / Railway 等免费 Node.js 容器平台，自动下载 sing-box + cloudflared + 哪吒探针二进制，跑 Argo 隧道 + VLESS/VMess/Hysteria2/TUIC/AnyTLS/SOCKS5 多协议节点。

## ✨ 特性

- 📰 **伪装页**：默认返回 Hacker News 风格资讯聚合页，与正常技术站点不可区分
- 🔑 **Key 鉴权**：`/sub?key=xxx` 与 `/node?key=xxx` 携带正确 Key 才返回真实节点
- 🤐 **静默失败**：错误 Key 一律返回 200 + 伪装页（禁止 403/404，不暴露端点）
- 🔌 **多协议**：VLESS+Reality / VMess+WS+TLS / Hysteria2 / TUIC / AnyTLS / SOCKS5
- 🚇 **Argo 隧道**：临时隧道自动申请 + 固定隧道 token 两种模式
- 📊 **哪吒探针**：v0 agent + v1 client 双版本支持
- 📱 **Telegram 推送**：节点自动推送到 TG 频道
- 🔄 **自动保活**：访问 PROJECT_URL 防止容器休眠
- 🧹 **90 秒自清理**：二进制文件运行后自动删除，防被检测
- 🔒 **WARP 出站**：Netflix/OpenAI/YouTube 走 Cloudflare WARP

## 📁 项目结构

```
node-camouflage-node-single/
├── index.js          # ⭐ 单文件主程序（约 700 行）
├── index.html        # 伪装页 HTML
├── package.json      # express + axios + dotenv
├── Dockerfile        # Docker 部署（HF Spaces / Render）
├── README.md         # 本文件
└── README_HF.md      # Hugging Face Spaces 专用 README
```

## 🚀 部署到 Hugging Face Spaces（推荐，免费）

### 步骤 1：上传代码

1. 注册 [Hugging Face](https://huggingface.co/join) 账号
2. 创建新 Space：https://huggingface.co/new-space
   - Owner：你的用户名
   - Space name：`node-camouflage`
   - License：MIT
   - SDK：**Docker**
   - Hardware：CPU basic Free
   - Visibility：**Private**（推荐私有）
3. 在 Space 页面 → Files → Add file → Upload files，上传本项目所有文件
4. 把 `README_HF.md` 的内容覆盖到根目录 `README.md`（HF 需要 frontmatter 才能识别 SDK）

### 步骤 2：配置环境变量

在 Space → **Settings** → **Repository secrets** 添加以下变量：

#### 必填变量

| Key | Value 示例 | 说明 |
|-----|-----------|------|
| `UUID` | `0a6568ff-ea3c-4271-9020-450560e10d63` | VLESS UUID，`uuidgen` 生成 |
| `KEYS` | `manggu,lele2026secret` | 多 Key 逗号分隔，访问 `/sub` `/node` 用 |
| `NAME` | `HF-Node` | 节点显示名 |

#### Argo 隧道（二选一）

**临时隧道**（无需配置）：
- 留空 `ARGO_DOMAIN` 和 `ARGO_AUTH`
- 每次重启域名会变

**固定隧道**（推荐）：
1. 在 Cloudflare 控制台 → Zero Trust → Networks → Tunnels → Create a tunnel
2. 选择 `Cloudflared`，获取 Token
3. 配置 Public hostname 指向 `localhost:8001`
4. 在 Space Secrets 添加：
   - `ARGO_DOMAIN` = `your-domain.com`
   - `ARGO_AUTH` = Token 字符串

#### 哪吒探针（可选）

| Key | Value 示例 | 说明 |
|-----|-----------|------|
| `NEZHA_SERVER` | `nz.example.com:8008` | v0；v1 不带端口 |
| `NEZHA_PORT` | `8008` | v0 端口；v1 留空 |
| `NEZHA_KEY` | `xxxxxxx` | v0 agent 密钥 / v1 NZ_CLIENT_SECRET |

#### 多协议端口（可选，HF Spaces 仅支持 7860 端口）

⚠️ HF Spaces 仅暴露单个端口（7860），多协议端口（REALITY_PORT / HY2_PORT / TUIC_PORT 等）需要直连端口，HF Spaces 不支持。**只跑 VMess+WS+Argo**。

如需多协议，请部署到 **Render / Koyeb / VPS**。

#### 其他可选

| Key | Value | 说明 |
|-----|-------|------|
| `CFIP` | `saas.sin.fan` | CF 优选域名 |
| `CFPORT` | `443` | CF 优选端口 |
| `YT_WARPOUT` | `true` | 强制 YouTube 走 WARP |
| `AUTO_ACCESS` | `true` | 自动保活（需同时填 PROJECT_URL） |
| `PROJECT_URL` | `https://your-space.hf.space` | 容器 URL，保活用 |
| `UPLOAD_URL` | `https://merge.example.com` | Merge-sub 订阅器地址 |
| `CHAT_ID` | `123456789` | TG chat_id |
| `BOT_TOKEN` | `1234:ABC...` | TG bot token |
| `DISABLE_ARGO` | `true` | 禁用 Argo 隧道 |

### 步骤 3：等待构建

Space 会自动构建（约 1-2 分钟），状态变为 `Running` 后访问：

```
https://<your-username>-node-camouflage.hf.space/
```

应看到 Hacker News 风格伪装页。

### 步骤 4：获取节点

```
https://<your-username>-node-camouflage.hf.space/sub?key=YOUR_KEY
```

返回 Base64 编码的订阅内容，直接导入 v2rayN / Clash.Meta / Shadowrocket。

## 🚢 部署到 Koyeb（免费，支持多协议）

1. 注册 [Koyeb](https://app.koyeb.com) 账号（GitHub 登录）
2. Create Service → GitHub → 选择本仓库
3. Builder：Buildpack
4. Build command：`npm install`
5. Run command：`node index.js`
6. Port：`3000`
7. Environment variables：同 HF Spaces
8. Exposed ports：3000（HTTP）+ 你配置的 REALITY_PORT / HY2_PORT 等

Koyeb 支持多端口暴露，适合跑完整多协议。

## 🚢 部署到 Render（免费）

1. 注册 [Render](https://render.com)
2. New → Web Service → 连接 GitHub 仓库
3. Runtime：Node
4. Build Command：`npm install`
5. Start Command：`node index.js`
6. Environment variables：同上

Render 免费版会休眠，需配合 `AUTO_ACCESS=true` + `PROJECT_URL` 保活。

## 🚢 部署到 Zeabur（付费，但稳定）

1. 注册 [Zeabur](https://zeabur.com)
2. New Project → Git → 连接仓库
3. 自动识别 Node.js 项目
4. Variables 添加环境变量
5. 自动分配域名

## 🔧 本地运行

```bash
git clone https://github.com/your-username/node-camouflage-node.git
cd node-camouflage-node
npm install
npm start
# 访问 http://localhost:3000
```

## 🧪 验证部署

### 1. 伪装页验证

```bash
curl https://your-space.hf.space/
# 应返回 Hacker News 风格 HTML
```

### 2. 错误 Key 静默失败

```bash
curl "https://your-space.hf.space/sub?key=wrong"
# 返回 200 + 伪装页 HTML（不是 403）
```

### 3. 正确 Key 获取订阅

```bash
curl "https://your-space.hf.space/sub?key=YOUR_KEY" | base64 -d
# 返回 vmess://... vless://... 等节点链接
```

### 4. 节点列表页

浏览器访问 `https://your-space.hf.space/node?key=YOUR_KEY`，可看到带复制按钮的节点列表。

## 📱 客户端导入

### v2rayN

1. 复制订阅地址：`https://your-space.hf.space/sub?key=YOUR_KEY`
2. v2rayN → 订阅 → 订阅设置 → 添加 → 粘贴 URL
3. 更新订阅，选中节点

### Clash.Meta

1. 复制订阅地址
2. Profiles → Add → 粘贴 URL
3. User-Agent 字段填 Key（后备鉴权）

### Shadowrocket

1. Safari 打开节点页：`https://your-space.hf.space/node?key=YOUR_KEY`
2. 长按节点行 → 复制
3. Shadowrocket → 添加节点

## 🔐 安全设计

### Key 恒定时间比较

```javascript
// 防止时序侧信道攻击
function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

### 静默失败

| 请求 | 错误做法 | 本方案 |
|------|---------|--------|
| `/sub?key=wrong` | 403 | 200 + 伪装页 |
| `/node?key=wrong` | 403 | 200 + 伪装页 |
| `/random/path` | 404 | 200 + 伪装页 |

### 90 秒自清理

启动 90 秒后自动删除所有下载的二进制（sing-box / cloudflared / 哪吒），仅保留运行中的进程，防止被文件扫描检测。

## 🆚 与原版（无伪装）区别

| 维度 | 原版 | 本版（伪装+Key） |
|------|------|---------------|
| `/` 路径 | 返回 "Hello world" | 返回 HN 资讯伪装页 |
| `/sub` 访问 | 任何人可获取 | 需要 Key |
| 错误 Key | 返回空订阅 | 返回伪装页（不可区分） |
| 端点存在性 | 易被探测 | 静默失败，不可探测 |
| 二进制清理 | 90 秒清理 | 90 秒清理（同原版） |

## ❓ FAQ

<details>
<summary><b>Q: 为什么 HF Spaces 上只跑 VMess？</b></summary>

A: HF Spaces 只暴露 7860 端口（HTTP），不支持 UDP / 多端口。VMess+WS+TLS+Argo 走 7860 端口可以工作，其他协议（Hysteria2 / TUIC 等 UDP 协议）需要 VPS 或 Koyeb 等支持多端口的平台。

</details>

<details>
<summary><b>Q: 临时隧道域名会变，怎么解决？</b></summary>

A: 配置 `ARGO_DOMAIN` 和 `ARGO_AUTH`（Cloudflare Tunnel token），使用固定隧道域名。

</details>

<details>
<summary><b>Q: 容器休眠怎么办？</b></summary>

A: 设置 `AUTO_ACCESS=true` 和 `PROJECT_URL=https://your-space.hf.space`，脚本会自动注册到 keep.gvrander.eu.org 保活服务。

</details>

<details>
<summary><b>Q: 节点不通怎么排查？</b></summary>

A:
1. 看 Space Logs 是否有 `sing-box running` 和 `cloudflared running`
2. 访问 `/sub?key=xxx` 看是否有节点返回
3. 客户端 UUID 与 `UUID` 环境变量一致
4. 客户端 Host/SNI 与 `ARGO_DOMAIN` 一致（临时隧道时为 trycloudflare.com 域名）

</details>

<details>
<summary><b>Q: 如何启用多协议？</b></summary>

A: 在环境变量中添加端口配置：
- `REALITY_PORT=8443` 启用 VLESS+Reality
- `HY2_PORT=8444` 启用 Hysteria2
- `TUIC_PORT=8445` 启用 TUIC
- `ANYTLS_PORT=8446` 启用 AnyTLS
- `S5_PORT=8447` 启用 SOCKS5

需要平台支持对应端口暴露（Koyeb / VPS）。

</details>

## ⚖️ 合规声明

本方案仅用于网络通信技术研究与学习交流目的。使用者应自行确认遵守所在地法律法规及云服务商服务条款。

在部分国家或地区，绕过网络审查可能违反当地法律，使用前请咨询专业法律意见。

## 📄 License

MIT
