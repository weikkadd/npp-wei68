# Node.js 20 容器部署 - Dockerfile
# 适用于 Hugging Face Spaces / Render / 自建 Docker 部署
# 不适用于 Koyeb（Koyeb 用 Dockerfile 或 buildpack）

FROM node:20-slim

# 安装必要工具（cloudflared 下载需要 ca-certificates，sing-box 运行需要 libc6）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package.json 并安装依赖
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 复制源码
COPY . .

# 暴露端口（HF Spaces 默认 7860，其他平台默认 3000）
ENV PORT=7860
EXPOSE 7860

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:7860/ || exit 1

CMD ["node", "index.js"]
