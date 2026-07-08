/**
 * index.ts - TypeScript 入口包装文件
 *
 * Pterodactyl Node.js Egg 的启动脚本 glob 匹配有 bug:
 *   [[ "${MAIN_FILE}" == "*.js" ]]  (引号导致通配符不生效)
 * 永远走 ts-node 分支，导致 .js 文件无法直接运行。
 *
 * 解决方案：用 .ts 文件包装，ts-node 加载本文件后 require('./index.js')
 * 面板 Main file 设置为 index.ts 即可。
 */

// @ts-ignore - 加载同目录的 index.js 主程序
require('./index.js');
