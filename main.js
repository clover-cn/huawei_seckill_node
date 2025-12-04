import { HuaWei } from './huawei.js';
import { logger } from './logger.js';

const banner = `
                _    _ _ _ 
               | |  (_) | |
  ___  ___  ___| | ___| | |
 / __|/ _ \/ __| |/ / | | |
 \__ \  __/ (__|   <| | | |
 |___/\___|\___|_|\_\_|_|_|

`;

async function main() {
  logger.info(banner);
  const huawei = new HuaWei();
  try {
    await huawei.init();
    await huawei.startProcess();
    await huawei.stopProcess();
  } catch (e) {
    if (e.message?.includes('Target closed') || e.message?.includes('Browser closed')) {
      logger.info('已关闭浏览器窗口，程序自动退出');
    } else {
      logger.error(`程序执行异常：${e}`);
    }
  }
}

main().catch(e => {
  logger.error(`程序异常退出：${e}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('程序正常退出');
  process.exit(0);
});