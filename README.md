# 节点伪装 + 多协议代理（Node.js 单文件容器版）

> **把 Node.js 容器伪装成 Hacker News 资讯站，Key 揭示真实节点订阅，单文件 index.js 开箱即用。**

部署到 Hugging Face Spaces / Koyeb / Render / Zeabur / Railway / **Weirdhost** 等免费 Node.js 容器平台，自动下载 sing-box + cloudflared + 哪吒探针二进制，跑 Argo 隧道 + VLESS/VMess/Hysteria2/TUIC/AnyTLS/SOCKS5 多协议节点。

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
node-camouflage-node/
├── index.js          # ⭐ 单文件主程序（约 700 行）
├── index.html        # 伪装页 HTML
├── start.js          # Pterodactyl Egg 入口包装（解决 ts-node glob bug）
├── package.json      # express + axios + dotenv
├── Dockerfile        # Docker 部署（HF Spaces / Render）
├── .env.example      # 环境变量模板（复制为 .env 使用）
├── README.md         # 本文件
└── README_HF.md      # Hugging Face Spaces 专用 README
```

## 🚀 快速开始

### 方式 1：Weirdhost / Pterodactyl 面板（已验证可用 ✅）

1. 创建服务器，Egg 选 **Node.js 20**
2. 「启动服务器」标签配置：
   - **Git Repo Address**: `https://github.com/weikkadd/npp-wei68`
   - **Install Branch**: `main`
   - **Auto Update**: 开启
   - **User Uploaded Files**: 关闭
   - **Main file**: `start.js` ⚠️（不是 index.js，原因见下方 FAQ）
3. 「文件管理」上传 `.env`（从 `.env.example` 复制并修改）
4. 「安慰」标签 → Start → 等 30 秒看 Console
5. 复制 Console 输出的绿色 Base64 节点链接

### 方式 2：Hugging Face Spaces（免费）

1. 注册 https://huggingface.co
2. 创建 Space，SDK 选 **Docker**
3. 上传所有文件（含 `README_HF.md` 覆盖 `README.md`）
4. Settings → Repository secrets 添加环境变量
5. 等 1-2 分钟构建完成

### 方式 3：Koyeb（支持多协议）

1. https://koyeb.com → Create Service → GitHub → 选本仓库
2. Builder: Buildpack，Build: `npm install`，Run: `node index.js`
3. Port: 3000，按需开放多协议端口

### 方式 4：本地运行

```bash
git clone https://github.com/weikkadd/npp-wei68.git
cd node-camouflage-node
cp .env.example .env && vim .env
npm install && npm start
```

## 🔧 配置说明

复制 `.env.example` 为 `.env`，修改以下必填项：

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `UUID` | ✅ | VLESS/VMess UUID | `0a6568ff-ea3c-...` |
| `KEYS` | ✅ | 访问 Key，逗号分隔 | `manggu2026,leleSecret99` |
| `ARGO_DOMAIN` | ✅ | Cloudflare Tunnel 子域名 | `node.your-domain.com` |
| `ARGO_AUTH` | ✅ | Cloudflare Tunnel Token | `eyJhIjoi...` |
| `CFIP` | ⭐ | CF 优选 IP/域名 | 见下方建议 |
| `PORT` | 否 | HTTP 端口 | `3000` / `7860` |

### ⭐ CFIP 配置建议（重要！）

| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **用 Argo 域名**（如 `CFIP=wei.gkc.ccwu.cc`） | 永远可用，CF 自动选最优 IP | 可能比最优 IP 慢一点 | ⭐⭐⭐⭐⭐ |
| 用 CFST 测出的最快 IP | 速度最快 | IP 会失效，需定期更新 | ⭐⭐⭐⭐ |
| 用固定优选 IP（如 `104.16.155.78`） | 简单 | 可能不通或被限速 | ⭐⭐ |

**新手推荐用 Argo 域名作为 CFIP**，最稳定，不会因为 IP 失效导致节点不通。

### 获取 ARGO_DOMAIN 和 ARGO_AUTH

1. 打开 https://one.dash.cloudflare.com/
2. Networks → Tunnels → Create a tunnel
3. 选 Cloudflared → Tunnel name: `lele-node` → Save tunnel
4. 复制 `eyJhIjoi...` Token → 填到 `ARGO_AUTH`
5. Next → 配置 Public Hostname：
   - Subdomain: `node`
   - Domain: 选你的域名
   - Service: **HTTP** → `localhost:8001`（⚠️ 不是 HTTPS）
6. Save tunnel

## ❓ FAQ

### Q: 为什么 Main file 要填 `start.js` 而不是 `index.js`？

Pterodactyl Node.js Egg 的启动脚本有 glob 匹配 bug：

```bash
if [[ "${MAIN_FILE}" == "*.js" ]]; then
  node "/home/container/${MAIN_FILE}"      # ← 走这条用 node
else
  ts-node --esm "/home/container/${MAIN_FILE}"  # ← 走这条用 ts-node
fi
```

引号导致 `"*.js"` 永远不匹配，**永远走 ts-node 分支**，而 ts-node 在某些容器中损坏（`ERR_UNKNOWN_FILE_EXTENSION`）。

`start.js` 是 CommonJS 包装文件：
- 即使走 ts-node 分支，也能正常加载 `.js` CommonJS 文件
- 内部 `require('./index.js')` 启动主程序

### Q: 节点不通怎么办？

1. **检查 Console**：是否显示 `sing-box running` + `cloudflared running`
2. **检查 CFIP**：如果用 IP，换成 Argo 域名试试（`CFIP=你的ARGO_DOMAIN`）
3. **检查 UUID**：客户端 UUID 必须与 `.env` 里的一致
4. **检查 Cloudflare Tunnel**：Service Type 必须是 `HTTP`（不是 HTTPS）
5. **检查 Argo 域名**：`ARGO_DOMAIN` 与 Cloudflare Tunnel 配置的域名一致

### Q: 速度慢怎么办？

1. **CFIP 换成 Argo 域名**（最稳）
2. **跑 CloudflareSpeedTest** 找最快 IP：https://github.com/XIU2/CloudflareSpeedTest
3. **客户端开 Mux**：v2rayN → 节点编辑 → 开启 Mux 多路复用
4. **Argo 免费版有限速**（5-20 Mbps），换 HF Spaces / Koyeb 可能更快

### Q: Reality 直连模式怎么启用？

修改 `.env`：
```env
DISABLE_ARGO=true
REALITY_PORT=26577    # 平台分配的 TCP 端口
CFIP=你的域名或IP
CFPORT=26577
```

⚠️ 需要 platform 支持多端口暴露（Koyeb / VPS），Weirdhost 单端口模式不支持。

### Q: 客户端连不上 Reality 节点？

检查 PublicKey 第 2 个字符：
- ✅ 正确：`cITt...`（大写字母 I = India）
- ❌ 错误：`clTt...`（小写字母 l = lima）

这两个字符在大多数字体下看起来一样，但 Reality 协议对此敏感。

### Q: 会被 Weirdhost 封号吗？

正常使用代理**不会**封号。避免：
- ❌ BT/PT 下载
- ❌ DDoS 攻击
- ❌ 垃圾邮件
- ❌ 违法内容
- ⚠️ 月流量控制在 100GB 以内

## 🛡 安全设计

### 静默失败（最核心）

| 请求 | 错误做法 | 本方案 |
|------|---------|--------|
| `/sub?key=wrong` | 403 | 200 + 伪装页 |
| `/node?key=wrong` | 403 | 200 + 伪装页 |
| `/random/path` | 404 | 200 + 伪装页 |

### 恒定时间 Key 比较

防止时序侧信道攻击。

### 90 秒自清理

启动 90 秒后自动删除所有二进制（sing-box / cloudflared / 哪吒），仅保留运行中的进程。

## ⚖️ 合规声明

本方案仅用于网络通信技术研究与学习交流目的。使用者应自行确认遵守所在地法律法规及云服务商服务条款。

## 📄 License

MIT
