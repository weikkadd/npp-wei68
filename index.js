#!/usr/bin/env node
/**
 * index.js - 节点伪装 + 多协议代理 + Argo 隧道（单文件 Node.js 容器版）
 *
 * 部署平台：Hugging Face Spaces / Koyeb / Render / Zeabur / Railway / Serv00
 * 运行方式：Dockerfile / package.json start 脚本
 *
 * 核心特性：
 *   1. 默认访问 / → 返回 Hacker News 资讯伪装页
 *   2. 访问 /sub?key=xxx → 才返回真实节点订阅
 *   3. 错误 Key → 静默返回伪装页（不返回 403/404）
 *   4. 自动下载 sing-box + cloudflared + 哪吒探针
 *   5. 支持 VLESS+Reality / VMess+WS+TLS / Hysteria2 / TUIC / AnyTLS / SOCKS5
 *   6. Cloudflare Argo 临时隧道 / 固定隧道 token
 *   7. 哪吒探针 v0/v1 监控
 *   8. Telegram 节点推送
 *   9. 自动保活
 *  10. 90 秒后自动清理二进制文件
 */

const express = require("express");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
require('dotenv').config();
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// ──────────────────────────────────────────────────────────────
// 环境变量
// ──────────────────────────────────────────────────────────────
const UPLOAD_URL = process.env.UPLOAD_URL || '';         // 订阅自动上传地址（部署 Merge-sub 后的首页）
const PROJECT_URL = process.env.PROJECT_URL || '';       // 项目分配 URL，保活用
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;    // 自动保活
const YT_WARPOUT = process.env.YT_WARPOUT || false;      // 强制 WARP 出站访问 YouTube
const FILE_PATH = process.env.FILE_PATH || '.npm';       // 工作目录
const SUB_PATH = process.env.SUB_PATH || 'sub';          // 订阅路径
const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d63';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const S5_PORT = process.env.S5_PORT || '';
const TUIC_PORT = process.env.TUIC_PORT || '';
const HY2_PORT = process.env.HY2_PORT || '';
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';
const REALITY_PORT = process.env.REALITY_PORT || '';
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';
const CFIP = process.env.CFIP || 'saas.sin.fan';
const CFPORT = process.env.CFPORT || 443;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const NAME = process.env.NAME || '';
const CHAT_ID = process.env.CHAT_ID || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const DISABLE_ARGO = process.env.DISABLE_ARGO || false;

// ⭐ 新增：Key 鉴权（节点页 / 订阅页访问控制）
// 多 Key 逗号分隔，例: KEYS=manggu,lele2026secret
// 留空时关闭鉴权（任何人可访问 /sub）
const ACCESS_KEYS = (process.env.KEYS || process.env.ACCESS_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);

const app = express();

// ──────────────────────────────────────────────────────────────
// 创建运行目录
// ──────────────────────────────────────────────────────────────
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log('Cache directory initialized');
} else {
  console.log('Cache directory ready');
}

let privateKey = '';
let publicKey = '';

// 随机文件名（防检测）
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

const npmRandomName = generateRandomName();
const webRandomName = generateRandomName();
const botRandomName = generateRandomName();
const phpRandomName = generateRandomName();

let npmPath = path.join(FILE_PATH, npmRandomName);
let phpPath = path.join(FILE_PATH, phpRandomName);
let webPath = path.join(FILE_PATH, webRandomName);
let botPath = path.join(FILE_PATH, botRandomName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

// ──────────────────────────────────────────────────────────────
// Key 恒定时间校验（防时序侧信道）
// ──────────────────────────────────────────────────────────────
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isValidKey(input) {
  if (!input || typeof input !== 'string') return false;
  if (ACCESS_KEYS.length === 0) return true;  // 未配置 KEYS 时关闭鉴权
  let matched = false;
  for (const k of ACCESS_KEYS) {
    if (constantTimeCompare(input, k)) matched = true;
  }
  return matched;
}

// ──────────────────────────────────────────────────────────────
// 删除已上传的节点（部署 Merge-sub 时使用）
// ──────────────────────────────────────────────────────────────
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;
    const fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic|anytls|socks):\/\//.test(line)
    );
    if (nodes.length === 0) return;
    axios.post(`${UPLOAD_URL}/api/delete-nodes`, JSON.stringify({ nodes }), {
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => null);
  } catch (err) {}
}

// ──────────────────────────────────────────────────────────────
// 端口校验
// ──────────────────────────────────────────────────────────────
function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return false;
    return true;
  } catch { return false; }
}

// 清理历史文件
const pathsToDelete = [webRandomName, botRandomName, npmRandomName, 'boot.log', 'list.txt'];
function cleanupOldFiles() {
  pathsToDelete.forEach(file => fs.unlink(path.join(FILE_PATH, file), () => {}));
}

// ──────────────────────────────────────────────────────────────
// Argo 隧道配置
// ──────────────────────────────────────────────────────────────
function argoType() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) {
    console.log("Tunnel disabled");
    return;
  }
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("Using default tunnel");
    return;
  }
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
tunnel: ${ARGO_AUTH.split('"')[11]}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("Using token auth");
  }
}

// ──────────────────────────────────────────────────────────────
// 系统架构识别 + 二进制下载
// ──────────────────────────────────────────────────────────────
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') return 'arm';
  return 'amd';
}

function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(filePath);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        writer.close();
        console.log(`Asset loaded: ${fileName}`);
        callback(null, fileName);
      });
      writer.on('error', err => {
        fs.unlink(filePath, () => {});
        callback(`Download ${fileName} failed: ${err.message}`);
      });
    })
    .catch(err => callback(`Download ${fileName} failed: ${err.message}`));
}

function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: "web", fileUrl: "https://arm64.ssss.nyc.mn/sb" },
      { fileName: "bot", fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: "web", fileUrl: "https://amd64.ssss.nyc.mn/sb" },
      { fileName: "bot", fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: "npm", fileUrl: npmUrl });
    } else {
      const phpUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/v1"
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ fileName: "php", fileUrl: phpUrl });
    }
  }
  return baseFiles;
}

async function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout || stderr);
    });
  });
}

// ──────────────────────────────────────────────────────────────
// 主下载与启动流程
// ──────────────────────────────────────────────────────────────
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  if (filesToDownload.length === 0) {
    console.log('No file for current architecture');
    return;
  }

  // 重命名为随机名
  const renamedFiles = filesToDownload.map(file => {
    let newFileName = file.fileName;
    if (file.fileName === 'npm') newFileName = npmRandomName;
    else if (file.fileName === 'web') newFileName = webRandomName;
    else if (file.fileName === 'bot') newFileName = botRandomName;
    else if (file.fileName === 'php') newFileName = phpRandomName;
    return { ...file, fileName: newFileName };
  });

  const downloadPromises = renamedFiles.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
        if (err) reject(err);
        else resolve(fileName);
      });
    });
  });

  try { await Promise.all(downloadPromises); }
  catch (err) { console.error('Download error:', err); return; }

  // 授权
  const filesToAuthorize = NEZHA_PORT
    ? [npmRandomName, webRandomName, botRandomName]
    : [phpRandomName, webRandomName, botRandomName];
  filesToAuthorize.forEach(relativeFilePath => {
    const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);
    if (fs.existsSync(absoluteFilePath)) {
      fs.chmod(absoluteFilePath, 0o775, (err) => {
        if (err) console.error(`Permission error: ${err}`);
        else console.log(`Permission set: ${absoluteFilePath}`);
      });
    }
  });

  // 哪吒 v1 config.yaml
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
    }
  }

  // 生成 Reality 密钥对
  const keyFilePath = path.join(FILE_PATH, 'key.txt');
  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    privateKey = (content.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
    publicKey = (content.match(/PublicKey:\s*(.*)/) || [])[1] || '';
    if (privateKey && publicKey) {
      console.log('Auth keys loaded');
      continueExecution();
    } else {
      console.error('Invalid cached keys, regenerating');
      fs.unlinkSync(keyFilePath);
      await generateRealityKeys();
    }
  } else {
    await generateRealityKeys();
  }
}

async function generateRealityKeys() {
  exec(`${path.join(FILE_PATH, webRandomName)} generate reality-keypair`, async (err, stdout) => {
    if (err) { console.error(`reality-keypair error: ${err.message}`); return; }
    privateKey = (stdout.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
    publicKey = (stdout.match(/PublicKey:\s*(.*)/) || [])[1] || '';
    if (!privateKey || !publicKey) { console.error('Failed to extract keys'); return; }
    fs.writeFileSync(path.join(FILE_PATH, 'key.txt'),
      `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
    console.log('Auth keys generated');
    continueExecution();
  });
}

// ──────────────────────────────────────────────────────────────
// 生成 sing-box 配置（含多协议 inbound）
// ──────────────────────────────────────────────────────────────
async function continueExecution() {
  exec('which openssl || where.exe openssl', async (err, stdout) => {
    if (err || stdout.trim() === '') {
      // 预定义证书
      fs.writeFileSync(path.join(FILE_PATH, 'private.key'),
        `-----BEGIN EC PARAMETERS-----
BggqhkjOPQMBBw==
-----END EC PARAMETERS-----
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49
AwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa
/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==
-----END EC PRIVATE KEY-----`);
      fs.writeFileSync(path.join(FILE_PATH, 'cert.pem'),
        `-----BEGIN CERTIFICATE-----
MIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw
EzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy
MDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h
aD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR
BfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB
Af8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+
eQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==
-----END CERTIFICATE-----`);
    } else {
      try {
        await execPromise(`openssl ecparam -genkey -name prime256v1 -out "${path.join(FILE_PATH, 'private.key')}"`);
        await execPromise(`openssl req -new -x509 -days 3650 -key "${path.join(FILE_PATH, 'private.key')}" -out "${path.join(FILE_PATH, 'cert.pem')}" -subj "/CN=bing.com"`);
      } catch (err) { console.error(`openssl error: ${err.message}`); return; }
    }

    if (!privateKey || !publicKey) { console.error('Keys missing'); return; }

    // sing-box 配置
    const config = {
      "log": { "disabled": true, "level": "error", "timestamp": true },
      "inbounds": [
        {
          "tag": "vmess-ws-in",
          "type": "vmess",
          "listen": "::",
          "listen_port": parseInt(ARGO_PORT),
          "users": [{ "uuid": UUID }],
          "transport": {
            "type": "ws",
            "path": "/vmess-argo",
            "early_data_header_name": "Sec-WebSocket-Protocol"
          }
        }
      ],
      "endpoints": [
        {
          "type": "wireguard",
          "tag": "wireguard-out",
          "mtu": 1280,
          "address": ["172.16.0.2/32", "2606:4700:110:8dfe:d141:69bb:6b80:925/128"],
          "private_key": "YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=",
          "peers": [{
            "address": "engage.cloudflareclient.com",
            "port": 2408,
            "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
            "allowed_ips": ["0.0.0.0/0", "::/0"],
            "reserved": [78, 135, 76]
          }]
        }
      ],
      "outbounds": [{ "type": "direct", "tag": "direct" }],
      "route": {
        "rule_set": [
          { "tag": "netflix", "type": "remote", "format": "binary",
            "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs",
            "download_detour": "direct" },
          { "tag": "openai", "type": "remote", "format": "binary",
            "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs",
            "download_detour": "direct" }
        ],
        "rules": [{ "rule_set": ["openai", "netflix"], "outbound": "wireguard-out" }],
        "final": "direct"
      }
    };

    // 各协议 inbound（按端口存在性添加）
    if (isValidPort(REALITY_PORT)) {
      config.inbounds.push({
        "tag": "vless-in", "type": "vless", "listen": "::",
        "listen_port": parseInt(REALITY_PORT),
        "users": [{ "uuid": UUID, "flow": "xtls-rprx-vision" }],
        "tls": {
          "enabled": true, "server_name": "www.iij.ad.jp",
          "reality": {
            "enabled": true,
            "handshake": { "server": "www.iij.ad.jp", "server_port": 443 },
            "private_key": privateKey, "short_id": [""]
          }
        }
      });
    }
    if (isValidPort(HY2_PORT)) {
      config.inbounds.push({
        "tag": "hysteria-in", "type": "hysteria2", "listen": "::",
        "listen_port": parseInt(HY2_PORT),
        "users": [{ "password": UUID }],
        "masquerade": "https://bing.com",
        "tls": {
          "enabled": true, "alpn": ["h3"],
          "certificate_path": path.join(FILE_PATH, "cert.pem"),
          "key_path": path.join(FILE_PATH, "private.key")
        }
      });
    }
    if (isValidPort(TUIC_PORT)) {
      config.inbounds.push({
        "tag": "tuic-in", "type": "tuic", "listen": "::",
        "listen_port": parseInt(TUIC_PORT),
        "users": [{ "uuid": UUID }],
        "congestion_control": "bbr",
        "tls": {
          "enabled": true, "alpn": ["h3"],
          "certificate_path": path.join(FILE_PATH, "cert.pem"),
          "key_path": path.join(FILE_PATH, "private.key")
        }
      });
    }
    if (isValidPort(S5_PORT)) {
      config.inbounds.push({
        "tag": "s5-in", "type": "socks", "listen": "::",
        "listen_port": parseInt(S5_PORT),
        "users": [{ "username": UUID.substring(0, 8), "password": UUID.slice(-12) }]
      });
    }
    if (isValidPort(ANYTLS_PORT)) {
      config.inbounds.push({
        "tag": "anytls-in", "type": "anytls", "listen": "::",
        "listen_port": parseInt(ANYTLS_PORT),
        "users": [{ "password": UUID }],
        "tls": {
          "enabled": true,
          "certificate_path": path.join(FILE_PATH, "cert.pem"),
          "key_path": path.join(FILE_PATH, "private.key")
        }
      });
    }
    if (isValidPort(ANYREALITY_PORT)) {
      config.inbounds.push({
        "tag": "anyreality-in", "type": "anytls", "listen": "::",
        "listen_port": parseInt(ANYREALITY_PORT),
        "users": [{ "password": UUID }],
        "tls": {
          "enabled": true, "server_name": "www.iij.ad.jp",
          "reality": {
            "enabled": true,
            "handshake": { "server": "www.iij.ad.jp", "server_port": 443 },
            "private_key": privateKey, "short_id": [""]
          }
        }
      });
    }

    // YouTube WARP 出站检测
    try {
      let isYouTubeAccessible = true;
      if (YT_WARPOUT === true || YT_WARPOUT === 'true') {
        isYouTubeAccessible = false;
      } else {
        try {
          const r = execSync('curl -o /dev/null -m 2 -s -w "%{http_code}" https://www.youtube.com',
            { encoding: 'utf8' }).trim();
          isYouTubeAccessible = r === '200';
        } catch { isYouTubeAccessible = false; }
      }
      if (!isYouTubeAccessible) {
        if (!config.route) config.route = {};
        if (!config.route.rule_set) config.route.rule_set = [];
        if (!config.route.rules) config.route.rules = [];
        if (!config.route.rule_set.find(r => r.tag === 'youtube')) {
          config.route.rule_set.push({
            "tag": "youtube", "type": "remote", "format": "binary",
            "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs",
            "download_detour": "direct"
          });
        }
        let wgRule = config.route.rules.find(r => r.outbound === 'wireguard-out');
        if (!wgRule) {
          wgRule = { "rule_set": ["openai", "netflix", "youtube"], "outbound": "wireguard-out" };
          config.route.rules.push(wgRule);
        } else if (!wgRule.rule_set.includes('youtube')) {
          wgRule.rule_set.push('youtube');
        }
        console.log('Route rule added');
      }
    } catch (e) {}

    fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

    // 运行哪吒 v0
    if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      const NEZHA_TLS = tlsPorts.includes(NEZHA_PORT) ? '--tls' : '';
      try {
        await execPromise(`nohup ${path.join(FILE_PATH, npmRandomName)} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
        console.log('Monitor agent started');
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) { console.error(`nezha v0 error: ${e}`); }
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      // 哪吒 v1
      try {
        await exec(`nohup ${FILE_PATH}/${phpRandomName} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
        console.log('Monitor service started');
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) { console.error(`nezha v1 error: ${e}`); }
    } else {
      console.log('Monitor disabled');
    }

    // 运行 sing-box
    try {
      await execPromise(`nohup ${path.join(FILE_PATH, webRandomName)} run -c ${path.join(FILE_PATH, 'config.json')} >/dev/null 2>&1 &`);
      console.log('Worker process started');
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) { console.error(`sing-box error: ${e}`); }

    // 运行 cloudflared
    if (DISABLE_ARGO !== 'true' && DISABLE_ARGO !== true) {
      if (fs.existsSync(path.join(FILE_PATH, botRandomName))) {
        let args;
        if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
          args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
        } else if (ARGO_AUTH.match(/TunnelSecret/)) {
          args = `tunnel --edge-ip-version auto --config ${path.join(FILE_PATH, 'tunnel.yml')} run`;
        } else {
          args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${path.join(FILE_PATH, 'boot.log')} --loglevel info --url http://localhost:${ARGO_PORT}`;
        }
        try {
          await execPromise(`nohup ${path.join(FILE_PATH, botRandomName)} ${args} >/dev/null 2>&1 &`);
          console.log('Background service started');
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) { console.error(`cloudflared error: ${e}`); }
      }
    }

    await new Promise(r => setTimeout(r, 5000));
    await extractDomains();
  });
}

// ──────────────────────────────────────────────────────────────
// 提取 Argo 域名
// ──────────────────────────────────────────────────────────────
async function extractDomains() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) {
    await generateLinks(null);
    return;
  }
  let argoDomain;
  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('Webhook URL:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const m = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (m) argoDomains.push(m[1]);
      });
      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('Webhook URL:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('Webhook URL not found, retrying');
        fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        try { await exec(`pkill -f "${botRandomName}" > /dev/null 2>&1`); } catch {}
        await new Promise(r => setTimeout(r, 1000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${path.join(FILE_PATH, botRandomName)} ${args} >/dev/null 2>&1 &`);
          await new Promise(r => setTimeout(r, 6000));
          await extractDomains();
        } catch (e) { console.error(`retry cloudflared error: ${e}`); }
      }
    } catch (e) { console.error('read boot.log error:', e); }
  }
}

// ──────────────────────────────────────────────────────────────
// ISP 信息
// ──────────────────────────────────────────────────────────────
async function getMetaInfo() {
  try {
    const r = await axios.get('https://api.ip.sb/geoip',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
    if (r.data && r.data.country_code && r.data.isp) {
      return `${r.data.country_code}-${r.data.isp}`.replace(/\s+/g, '_');
    }
  } catch {
    try {
      const r2 = await axios.get('http://ip-api.com/json',
        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
      if (r2.data && r2.data.status === 'success' && r2.data.countryCode && r2.data.org) {
        return `${r2.data.countryCode}-${r2.data.org}`.replace(/\s+/g, '_');
      }
    } catch {}
  }
  return 'Unknown';
}

// ──────────────────────────────────────────────────────────────
// 生成节点链接
// ──────────────────────────────────────────────────────────────
async function generateLinks(argoDomain) {
  let SERVER_IP = '';
  try {
    const r = await axios.get('http://ipv4.ip.sb', { timeout: 3000 });
    SERVER_IP = r.data.trim();
  } catch {
    try { SERVER_IP = execSync('curl -sm 3 ipv4.ip.sb').toString().trim(); }
    catch {
      try {
        const r6 = await axios.get('http://ipv6.ip.sb', { timeout: 3000 });
        SERVER_IP = `[${r6.data.trim()}]`;
      } catch {
        try { SERVER_IP = `[${execSync('curl -sm 3 ipv6.ip.sb').toString().trim()}]`; }
        catch (e) { console.error('IP fetch failed:', e.message); }
      }
    }
  }

  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  return new Promise((resolve) => {
    setTimeout(() => {
      let subTxt = '';

      // VMess + WS + TLS + Argo
      if ((DISABLE_ARGO !== 'true' && DISABLE_ARGO !== true) && argoDomain) {
        const vmessNode = `vmess://${Buffer.from(JSON.stringify({
          v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0',
          scy: 'auto', net: 'ws', type: 'none', host: argoDomain,
          path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'
        })).toString('base64')}`;
        subTxt = vmessNode;
      }
      if (isValidPort(TUIC_PORT)) {
        subTxt += `\ntuic://${UUID}:@${SERVER_IP}:${TUIC_PORT}?sni=www.bing.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1#${nodeName}`;
      }
      if (isValidPort(HY2_PORT)) {
        subTxt += `\nhysteria2://${UUID}@${SERVER_IP}:${HY2_PORT}/?sni=www.bing.com&insecure=1&alpn=h3&obfs=none#${nodeName}`;
      }
      if (isValidPort(REALITY_PORT)) {
        subTxt += `\nvless://${UUID}@${SERVER_IP}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${publicKey}&type=tcp&headerType=none#${nodeName}`;
      }
      if (isValidPort(ANYTLS_PORT)) {
        subTxt += `\nanytls://${UUID}@${SERVER_IP}:${ANYTLS_PORT}?security=tls&sni=${SERVER_IP}&fp=chrome&insecure=1&allowInsecure=1#${nodeName}`;
      }
      if (isValidPort(ANYREALITY_PORT)) {
        subTxt += `\nanytls://${UUID}@${SERVER_IP}:${ANYREALITY_PORT}?security=reality&sni=www.iij.ad.jp&fp=chrome&pbk=${publicKey}&type=tcp&headerType=none#${nodeName}`;
      }
      if (isValidPort(S5_PORT)) {
        const S5_AUTH = Buffer.from(`${UUID.substring(0, 8)}:${UUID.slice(-12)}`).toString('base64');
        subTxt += `\nsocks://${S5_AUTH}@${SERVER_IP}:${S5_PORT}#${nodeName}`;
      }

      console.log('\x1b[32m' + Buffer.from(subTxt).toString('base64') + '\x1b[0m');
      console.log('Startup complete');
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(listPath, subTxt, 'utf8');
      console.log('Cache file saved');
      sendTelegram();
      uplodNodes();
      resolve(subTxt);
    }, 2000);
  });
}

// ──────────────────────────────────────────────────────────────
// 90 秒后清理二进制文件
// ──────────────────────────────────────────────────────────────
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, listPath, webPath, botPath, phpPath, npmPath];
    if (NEZHA_PORT) filesToDelete.push(npmPath);
    else if (NEZHA_SERVER && NEZHA_KEY) filesToDelete.push(phpPath);
    exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, () => {
      console.clear();
      console.log('Bot is running');
      console.log('Ready to serve');
    });
  }, 90000);
}

// ──────────────────────────────────────────────────────────────
// Telegram 推送
// ──────────────────────────────────────────────────────────────
async function sendTelegram() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('Notification disabled');
    return;
  }
  try {
    const message = fs.readFileSync(subPath, 'utf8');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const escapedName = NAME.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    await axios.post(url, null, {
      params: {
        chat_id: CHAT_ID,
        text: `**${escapedName}节点推送通知**\n\`\`\`${message}\`\`\``,
        parse_mode: 'MarkdownV2'
      }
    });
    console.log('Notification sent');
  } catch (e) { console.error('Telegram send failed', e); }
}

// ──────────────────────────────────────────────────────────────
// 上传节点到 Merge-sub
// ──────────────────────────────────────────────────────────────
async function uplodNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    try {
      const r = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`,
        { subscription: [subscriptionUrl] },
        { headers: { 'Content-Type': 'application/json' } });
      if (r.status === 200) console.log('Sync completed');
    } catch (e) {}
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic|anytls|socks):\/\//.test(line));
    if (nodes.length === 0) return;
    try {
      const r = await axios.post(`${UPLOAD_URL}/api/add-nodes`,
        JSON.stringify({ nodes }),
        { headers: { 'Content-Type': 'application/json' } });
      if (r.status === 200) console.log('Sync completed');
    } catch (e) {}
  }
}

// ──────────────────────────────────────────────────────────────
// 自动保活
// ──────────────────────────────────────────────────────────────
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log('Keep-alive disabled');
    return;
  }
  try {
    await axios.post('https://keep.gvrander.eu.org/add-url',
      { url: PROJECT_URL },
      { headers: { 'Content-Type': 'application/json' } });
    console.log('Keep-alive enabled');
  } catch (e) { console.error(`Auto access failed: ${e.message}`); }
}

// ──────────────────────────────────────────────────────────────
// 启动主流程
// ──────────────────────────────────────────────────────────────
async function startserver() {
  deleteNodes();
  cleanupOldFiles();
  argoType();
  await downloadFilesAndRun();
  await AddVisitTask();
  cleanFiles();
}
startserver();

// ══════════════════════════════════════════════════════════════
// HTTP 路由
// ══════════════════════════════════════════════════════════════

// 移除可识别响应头
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'cloudflare');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ─── 根路径：伪装页（Hacker News 资讯聚合）─────────────────
app.get("/", async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath, 'utf8');
      res.type('html').send(data);
    } else {
      res.type('html').send(getDecoyHTML());
    }
  } catch (err) {
    res.type('html').send(getDecoyHTML());
  }
});

// ─── 订阅路径 /sub?key=xxx ──────────────────────────────────
app.get(`/${SUB_PATH}`, (req, res) => {
  const key = req.query.key || '';

  // 启用鉴权时校验 Key
  if (ACCESS_KEYS.length > 0 && !isValidKey(key)) {
    // 静默失败：返回伪装页（不返回 403）
    res.status(200).type('html').send(getDecoyHTML());
    return;
  }

  // 返回订阅内容
  if (fs.existsSync(subPath)) {
    const content = fs.readFileSync(subPath, 'utf8');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Subscription-Userinfo', 'upload=0; download=0; total=107374182400; expire=0');
    res.send(content);
  } else {
    // 订阅尚未生成（启动初期），返回空 Base64
    res.set('Content-Type', 'text/plain; charset=utf-8').send(Buffer.from('').toString('base64'));
  }
});

// ─── 节点页 /node?key=xxx（查看明文节点 + 复制按钮）──────────
app.get('/node', (req, res) => {
  const key = req.query.key || '';
  if (ACCESS_KEYS.length > 0 && !isValidKey(key)) {
    res.status(200).type('html').send(getDecoyHTML());
    return;
  }
  // 返回节点展示页
  let nodes = '';
  if (fs.existsSync(listPath)) {
    nodes = fs.readFileSync(listPath, 'utf8');
  }
  res.type('html').send(getNodeListHTML(nodes));
});

// ─── 静态资源（伪装站点常见路径） ──────────────────────────
app.get(['/favicon.ico', '/robots.txt'], (req, res) => {
  if (req.path === '/favicon.ico') return res.type('ico').status(204).end();
  res.type('text').send('User-agent: *\nDisallow: /');
});

// ─── 兜底：所有未匹配路径返回伪装页（禁止 404） ─────────────
app.use((req, res) => {
  res.status(200).type('html').send(getDecoyHTML());
});

// ──────────────────────────────────────────────────────────────
// 伪装页 HTML（Hacker News 风格资讯聚合）
// ──────────────────────────────────────────────────────────────
function getDecoyHTML() {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>每日科技简讯报告</title>
<style>
*{box-sizing:border-box}
body{background:#1e2124;color:#e6e6e4;font-family:system-ui,-apple-system,sans-serif;
     max-width:820px;margin:0 auto;padding:24px;line-height:1.6}
h1{font-size:22px;margin:0 0 8px;font-weight:700}
.sub{color:#888;font-size:13px;margin-bottom:4px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 24px}
.stats span{background:#2a2d31;padding:3px 10px;border-radius:4px;font-size:12px;color:#aaa;
            font-family:ui-monospace,SFMono-Regular,monospace}
.stats .ok{color:#80b491}
h2{font-size:16px;color:#e1c36a;margin-top:28px;border-left:3px solid #e1c36a;padding-left:10px}
.news-item{margin:14px 0;padding:12px 14px;background:#2a2d31;border-radius:6px}
.news-item h3{font-size:14px;margin:0 0 6px;font-weight:600;line-height:1.4}
.news-item .rank{color:#e1c36a;font-family:monospace;margin-right:4px}
.meta{font-size:11px;color:#888;margin:0;word-break:break-all}
.meta a{color:#789dc2;text-decoration:none}
footer{margin-top:40px;padding-top:16px;border-top:1px solid #3a3d41;color:#666;
       font-size:11px;text-align:center}
</style></head><body>
<h1>每日科技简讯报告</h1>
<div class="sub">AI / 开源工具 / 云服务 / Web3 / 安全动态</div>
<div class="sub">更新时间: ${now}</div>
<div class="stats">
  <span>收录 28 条</span>
  <span>来源 6 个</span>
  <span>自动翻译 zh-CN</span>
  <span class="ok">节点状态 ONLINE</span>
  <span>Node v20.20.2</span>
</div>
<h2>今日重点</h2>
<article class="news-item">
  <h3><span class="rank">#1</span> Cloudflare 推出 Workers AI 1.0 — 边缘推理进入实用阶段</h3>
  <p class="meta">原文 · HN 讨论 · thepaper · ${now} · Points: 1247 # Comments: 312</p>
</article>
<article class="news-item">
  <h3><span class="rank">#2</span> Show HN: 用 Rust 重写的 SQLite — 速度提升 40%</h3>
  <p class="meta">原文 · HN 讨论 · github.com · ${now} · Points: 892 # Comments: 187</p>
</article>
<article class="news-item">
  <h3><span class="rank">#3</span> Linux 6.10 合并主线 — Btrfs 大幅性能优化</h3>
  <p class="meta">原文 · HN 讨论 · lwn.net · ${now} · Points: 654 # Comments: 98</p>
</article>
<footer>Powered by Daily Tech Brief · 自动抓取 · 仅供学习研究</footer>
</body></html>`;
}

// ──────────────────────────────────────────────────────────────
// 节点列表展示页（Key 正确后展示）
// ──────────────────────────────────────────────────────────────
function getNodeListHTML(nodes) {
  const now = new Date().toISOString();
  const lines = nodes.split('\n').filter(l => l.trim());
  const itemsHtml = lines.map((line, i) =>
    `<div class="node-item"><div class="node-line" id="n${i}">${escapeHtml(line)}</div>` +
    `<button onclick="copyNode('n${i}')">复制</button></div>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>节点订阅配置</title>
<style>
*{box-sizing:border-box}
body{background:#1e2124;color:#e6e6e4;font-family:system-ui,sans-serif;
     max-width:820px;margin:0 auto;padding:24px;line-height:1.6}
h1{font-size:20px;margin:0 0 4px;font-weight:700}
.desc{color:#888;font-size:12px;margin-bottom:16px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 20px}
.stats span{background:#2a2d31;padding:3px 10px;border-radius:4px;font-size:12px;color:#aaa;
            font-family:ui-monospace,SFMono-Regular,monospace}
.stats .ok{color:#80b491}
h2{font-size:14px;color:#e1c36a;margin-top:24px}
.node-item{display:flex;gap:8px;margin:8px 0;align-items:center}
.node-line{flex:1;background:#2a2d31;border:1px solid #3a3d41;color:#e6e6e4;
           padding:8px 10px;border-radius:4px;font-family:ui-monospace,monospace;
           font-size:11px;min-width:0;word-break:break-all}
button{background:#e1c36a;color:#1e2124;border:none;padding:8px 14px;border-radius:4px;
       font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
button:hover{background:#f0d078}
.note{color:#666;font-size:11px;margin:8px 0 12px}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
       background:#3d3829;color:#e1c36a;padding:8px 16px;border-radius:4px;
       font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
</style></head><body>
<h1>节点订阅配置</h1>
<div class="desc">用于查看当前节点链接，复制到客户端即可使用。</div>
<div class="stats">
  <span class="ok">状态 READY</span>
  <span class="ok">后台 ONLINE</span>
  <span>节点数 ${lines.length}</span>
  <span>更新时间 ${now}</span>
</div>
<h2>节点列表（共 ${lines.length} 条）</h2>
${itemsHtml}
<div class="note">也可以直接打开 /sub 获取订阅（需在客户端 UA 字段填入 Key）。</div>
<div class="toast" id="toast">已复制到剪贴板</div>
<script>
function copyNode(id){
  const e=document.getElementById(id);
  const range=document.createRange();range.selectNode(e);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
  try{navigator.clipboard.writeText(e.innerText).then(showToast,()=>{document.execCommand('copy');showToast();});}
  catch(e){document.execCommand('copy');showToast();}
}
function showToast(){const t=document.getElementById('toast');t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1500);}
</script>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ──────────────────────────────────────────────────────────────
// 启动 HTTP 服务
// ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('┌──────────────────────────────────────────────┐');
  console.log('│  Discord Music Bot v1.4.2                     │');
  console.log('├──────────────────────────────────────────────┤');
  console.log(`│  Listening: http://0.0.0.0:${PORT}`);
  console.log(`│  Status:    Online`);
  console.log(`│  Guilds:    1`);
  console.log(`│  Latency:   42ms`);
  console.log(`│  Node.js:   ${process.version}`);
  console.log('└──────────────────────────────────────────────┘');
});
