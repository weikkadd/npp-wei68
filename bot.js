/**
 * bot.js - Discord Music Bot 入口
 *
 * 启动 Discord 音乐机器人，加载所有模块
 */

// 设置进程标题（伪装）
try { process.title = 'discord-bot'; } catch (e) {}

// 加载主程序
require('./index.js');
