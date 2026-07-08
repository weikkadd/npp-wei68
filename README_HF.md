# Hugging Face Spaces 配置
# 文件路径：根目录 README.md，前置 frontmatter 配置 Spaces 元数据

---
title: Node Camouflage
emoji: 📰
colorFrom: gray
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Daily Tech Brief & Node Config
---

# Node Camouflage

Daily tech brief aggregator with VLESS/VMess/Trojan/Hysteria2 node configuration management.

## 部署步骤

1. Fork 本仓库到你的 Hugging Face 账号
2. 创建新 Space，SDK 选 Docker
3. 在 Space Settings → Repository secrets 添加环境变量
4. 等待构建完成，访问 `https://<user>-node-camouflage.hf.space/`

## 环境变量

详见仓库 README.md
