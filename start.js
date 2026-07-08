/**
 * start.js - Pterodactyl Egg 入口包装文件
 *
 * Pterodactyl Node.js Egg 的启动脚本 glob 匹配有 bug:
 *   [[ "${MAIN_FILE}" == "*.js" ]]
 * 引号导致通配符不生效，永远走 ts-node --esm 分支（ts-node 在该容器中损坏）。
 *
 * 解决方案：MAIN_FILE 填 "start.js"（字面 .js 结尾）
 * 让 glob 匹配意外生效（虽然引号本应阻止匹配，但 == 的简单字符串比较
 * 在某些 bash 版本中会忽略引号进行 glob），走 node 分支。
 *
 * 如果 glob 仍然失效（走 ts-node），start.js 也是合法的 CommonJS 文件，
 * ts-node 也能加载 .js CommonJS 文件。
 *
 * 面板 MAIN_FILE 设置为: start.js
 */

// 加载主程序
require('./index.js');
