import { chromium } from "playwright";
import { Config } from "./config.js";
import { logger } from "./logger.js";
import { sleep, writeCookies, readCookies, getProfilePath, createDirectory } from "./utils.js";
import { getLocalHwTimeDiff, calcCountdownMsDiff, calcCountdownTimes, formatCountdownTime } from "./timeUtils.js";
import * as constants from "./constants.js";

export class HuaWei {
  constructor(profilePath = null) {
    this.config = new Config(constants.CONFIG_FILE);
    this.browser = null;
    this.page = null;
    this.context = null;
    this.isLogin = false;
    this.isWaiting = true;
    this.isCountdown = true;
    this.isStartBuying = false;
    this.isCanSubmitOrder = false;
    this.isBuyNow = false;
    this.needRetryWaiting = false;
    this.secKillTime = null;
    this.msDiff = 0;
    this.profilePath = profilePath;
    this.threadBrowsers = [];
  }

  async init() {
    createDirectory(constants.LOG_PATH);
    const threadCount = Math.max(this.config.getInt("process", "thread", constants.DEFAULT_THREAD_NUM), 1);
    for (let i = 1; i <= threadCount; i++) {
      createDirectory(getProfilePath(constants.BASE_PROFILE_PATH, "chromium", i));
    }
    if (!this.profilePath) {
      this.profilePath = getProfilePath(constants.BASE_PROFILE_PATH, "chromium", 1);
    }
    const headless = this.config.getBoolean("browser", "headless", false);
    this.browser = await chromium.launch({ headless, slowMo: 50 });
    this.context = await this.browser.newContext({
      userAgent: this.config.get("browser", "userAgent", undefined),
      viewport: { width: 1920, height: 1080 },
    });
    this.page = await this.context.newPage();
    const { msDiff } = await getLocalHwTimeDiff();
    this.msDiff = msDiff;
  }

  async startProcess() {
    logger.info("开启抢购华为手机");
    await this.visitOfficialWebsite();
    await this.login();
    if (this.isLogin) {
      await this.visitProductPage();
      await this.chooseProduct();
      while (true) {
        await this.waitingCount();
        await this.countdown();
        await this.startBuying();
        if (!this.needRetryWaiting) break;
        logger.info("准备等待下一轮抢购...");
        this.resetForNextRound();
        await this.page.reload();
        await this.chooseProduct();
      }
      await this.buyNow();
    }
  }

  resetForNextRound() {
    this.isWaiting = true;
    this.isCountdown = true;
    this.isStartBuying = false;
    this.needRetryWaiting = false;
    this.secKillTime = null;
  }

  async stopProcess() {
    logger.info("结束抢购华为手机");
    await sleep(120000);
    await this.browser.close();
  }

  async visitOfficialWebsite() {
    logger.info("开始进入华为官网");
    await this.page.goto("https://www.vmall.com/");
    await this.page.waitForLoadState("networkidle");
    logger.info("已进入华为官网");
  }

  async login() {
    logger.info("开始登录华为账号");
    // 先尝试加载本地 cookies
    await this.loadCookiesIfExists();
    this.isLogin = await this.checkIsLoggedIn();
    if (!this.isLogin) {
      await this.gotoLoginPage();
      await this.doLogin();
      this.isLogin = await this.checkIsLoggedIn();
    }
    if (!this.isLogin) {
      logger.warn("登录华为账号失败，程序将在3秒后退出...");
      await sleep(3000);
      process.exit(1);
    }
    writeCookies(await this.context.cookies());
    logger.info(`当前登录账号昵称为：${await this.getLoggedNickname()}`);
  }

  async gotoLoginPage() {
    const menuLinks = await this.page.$$(".css-146c3p1.r-1a7l8x0.r-1enofrn.r-ueyrd6.r-is05cd.r-gy4na3");
    for (const link of menuLinks) {
      if ((await link.textContent()) === "请登录") {
        await link.click();
        break;
      }
    }
    await this.page.waitForURL(/id1\.cloud\.huawei\.com/, { timeout: 30000 });
    logger.info("已跳转登录页面");
  }

  async doLogin() {
    logger.info("请在登录界面扫码登录，等待扫码完成...");
    const startTime = Date.now();
    const timeout = 60000; // 1分钟超时
    // 循环条件：只要当前页面URL包含登录页面的URL标识，就继续等待
    while (this.page.url().includes(constants.LOGIN_PAGE_URL)) {
      if (Date.now() - startTime > timeout) {
        logger.warn("扫码超时，程序将在3秒后退出...");
        await sleep(3000);
        process.exit(1);
      }
      await sleep(2000);
    }
    logger.info("扫码登录成功");
  }

  async checkIsLoggedIn() {
    await sleep(3000);
    return (await this.getLoggedNickname()) !== "游客";
  }

  async getLoggedNickname() {
    const cookies = await this.context.cookies();
    const c = cookies.find((c) => c.name === "displayName");
    return c ? decodeURIComponent(c.value) : "游客";
  }

  async visitProductPage() {
    const productId = this.config.get("product", "id");
    logger.info(`开始进入产品详情页`);
    await this.page.goto(`https://${constants.PRODUCT_PAGE_URL}?prdId=${productId}`);
    await this.page.waitForLoadState("networkidle");
    logger.info("已进入产品详情页");
  }

  async waitingCount() {
    let times = 1;
    while (this.isWaiting && times <= constants.RETRY_TIMES) {
      try {
        const btnText = await this.page.$eval("#prd-botnav-rightbtn", (el) => el.textContent);
        if (btnText?.includes("暂不售卖") || btnText?.includes("暂时缺货")) {
          logger.info(`【${btnText}】倒计时未开始，等待中...`);
          await sleep(120000);
          await this.page.reload();
          await this.chooseProduct();
        } else if (btnText?.includes("开始")) {
          await this.getSecKillTime();
          if (this.secKillTime) this.isWaiting = false;
        } else {
          logger.info("当前可立即购买");
          this.setEndCountdown();
          this.isBuyNow = true;
        }
      } catch {
        await sleep(1000);
        times++;
      }
    }
  }

  async chooseProduct() {
    const sets = this.config.get("product", "sets", "");
    const skuColor = this.config.get("product", "color");
    const skuVersion = this.config.get("product", "version");
    const skuButtons = await this.page.$$(".css-175oi2r.r-1loqt21.r-1otgn73");
    for (const btn of skuButtons) {
      const text = await btn.textContent();
      if (
        sets &&
        sets
          .split(",")
          .map((s) => s.trim())
          .includes(text)
      ) {
        await btn.click();
      } else if (text === skuColor || text === skuVersion) {
        await btn.click();
      }
    }
    logger.info("选择规格完成");
  }

  async countdown() {
    // 当 this.isCountdown 为 true 时，每10秒检查一次
    // 如果距离抢购时间还 超过3分钟（countdownMsDiff > 180000），继续10秒循环
    // 如果距离抢购时间 ≤3分钟，调用 setEndCountdown() 设置 this.isCountdown = false，退出循环开始执行下一个函数
    while (this.isCountdown) {
      const countdownMsDiff = calcCountdownMsDiff(this.secKillTime, this.msDiff);
      if (countdownMsDiff > 180000) {
        logger.info(`距离抢购开始还剩：${formatCountdownTime(calcCountdownTimes(this.secKillTime, this.msDiff))}`);
        await sleep(10000);
      } else {
        this.setEndCountdown();
      }
    }
  }

  async startBuying() {
    logger.info("进入抢购活动最后排队下单环节");
    await this.createAndStartThreads();
    let clickTimes = 1;
    while (this.isStartBuying) {
      const countdownMsDiff = calcCountdownMsDiff(this.secKillTime, this.msDiff);
      if (countdownMsDiff > 1000) {
        await sleep(1000);
      } else if (countdownMsDiff > 100) {
        await sleep(100);
      } else if (countdownMsDiff > 10) {
        await sleep(10);
      } else {
        logger.info(`进行第 ${clickTimes} 次尝试立即下单`);
        await this.doStartBuying();
        await this.checkCanSubmitOrder();
        await this.submitOrder();
        clickTimes++;
        await sleep(this.config.getFloat("process", "interval", 0.001) * 1000);
      }
    }
  }

  async doStartBuying() {
    if (this.isCanSubmitOrder) return;
    try {
      const btn = await this.page.$("#prd-botnav-rightbtn");
      if ((await btn?.textContent()) === "立即购买") await btn.click();
    } catch {
      logger.warn("立即下单按钮不可点击");
    }
  }

  async checkCanSubmitOrder() {
    if (this.isCanSubmitOrder) return;
    await this.checkBoxCtPopStage();
    const isOrderPage = this.page.url().includes(constants.ORDER_PAGE_URL) || this.page.url().includes(constants.RUSH_ORDER_PAGE_URL);
    if (isOrderPage) {
      this.isStartBuying = false;
      this.isCanSubmitOrder = true;
    } else {
      const pages = this.context.pages();
      if (pages.length <= 1) {
        await this.checkIframeBoxPopExists();
      }
    }
  }

  // 弹窗处理
  async checkBoxCtPopExists() {
    try {
      return !!(await this.page.$('iframe[src*="queue.html"]'));
    } catch {
      return false;
    }
  }

  async checkBoxCtPopStage() {
    if (await this.checkBoxCtPopExists()) {
      await this.checkBoxCtPopActIsStarted();
      await this.checkBoxCtPopProductIsNotBuy();
      await this.checkBoxCtPopAddressNotSelected();
    }
  }

  async checkBoxCtPopActIsStarted() {
    try {
      const frameLocator = this.page.frameLocator('iframe[src*="queue.html"]');
      const text = await frameLocator.locator(".queue-tips p:not(.hide)").textContent({ timeout: 3000 }).catch(() => "");
      if (text?.includes("活动暂未开始")) {
        logger.warn("活动暂未开始，等待下一轮抢购");
        await frameLocator.locator(".queue-btn .btn-cancel").click().catch(() => {});
        this.isStartBuying = false;
        this.needRetryWaiting = true;
      }
    } catch {
      /* ignore */
    }
  }

  async checkBoxCtPopProductIsNotBuy() {
    try {
      const frameLocator = this.page.frameLocator('iframe[src*="queue.html"]');
      const text = await frameLocator.locator(".queue-tips p:not(.hide)").textContent({ timeout: 3000 }).catch(() => "");

      if (text?.includes("抱歉，已售完")) {
        logger.warn("抱歉，已售完，等待下一轮抢购");
        await frameLocator.locator(".queue-btn .btn-cancel").click().catch(() => {});
        this.isStartBuying = false;
        this.needRetryWaiting = true;
      }
    } catch {
      /* ignore */
    }
  }

  async checkBoxCtPopAddressNotSelected() {
    try {
      const text = await this.page.$eval(".box-ct .box-cc .box-content", (el) => el.textContent);
      if (text?.includes("请您选择收货地址")) {
        logger.warn("收货地址未完全加载");
        const btn = await this.page.$(".box-ct .box-cc .box-content .box-button .box-ok");
        if ((await btn?.textContent()) === "确定") await btn.click();
      }
    } catch {
      /* ignore */
    }
  }

  // 排队检测
  async checkIframeBoxPopExists() {
    logger.info("开始检查是否出现排队弹窗");
    try {
      const iframe = await this.page.$('iframe[src*="queue.html"]');
      if (!iframe) {
        logger.info("结束检查是否出现排队弹窗，结果：否");
        return false;
      }
      logger.info("结束检查是否出现排队弹窗，结果：是");
      
      const frameLocator = this.page.frameLocator('iframe[src*="queue.html"]');
      const tipText = await frameLocator.locator(".queue-tips").textContent({ timeout: 3000 }).catch(() => "");
      
      for (const tipMsg of constants.TIP_MSGS) {
        if (tipText.includes(tipMsg)) {
          if (tipMsg === "排队中") {
            logger.warn(`排队状态：${tipMsg}`);
          } else if (tipMsg === "当前排队人数过多，是否继续排队等待？") {
            logger.warn(`排队状态：${tipMsg}`);
            await frameLocator.locator(".queue-btn .btn-ok").click().catch(() => {});
          } else {
            logger.warn(`当前提醒内容：${tipMsg}`);
          }
          break;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async buyNow() {
    if (!this.isBuyNow) return;
    logger.info("开始立即购买");
    try {
      const btn = await this.page.$("#prd-botnav-rightbtn");
      if ((await btn?.textContent()) === "立即购买") {
        await btn.click();
        await sleep(1000);
        if (this.context.pages().length > 1) {
          this.page = this.context.pages()[this.context.pages().length - 1];
        }
        await this.submitOrder();
      }
    } catch (e) {
      logger.error(`立即购买失败：${e}`);
    }
  }

  async submitOrder() {
    if (!this.isCanSubmitOrder) return;
    const currentUrl = this.page.url();
    while (this.isCanSubmitOrder) {
      const clickSuccess = await this.clickSubmitOrder(currentUrl);
      if (clickSuccess) this.isCanSubmitOrder = false;
      await sleep(this.config.getFloat("process", "interval", 0.001) * 1000);
    }
  }

  async clickSubmitOrder(currentUrl) {
    try {
      await this.checkBoxCtPopStage();
      const submitBtn = await this.page.$("#checkoutSubmit");
      const btnText = await submitBtn?.textContent();

      if (btnText === "提交订单") {
        await submitBtn.click();
      } else if (btnText === "提交预约申购单") {
        const checkbox = await this.page.$("#agreementChecked");
        if (checkbox && !(await checkbox.isChecked())) await checkbox.click();
        await submitBtn.click();
      } else {
        logger.info("未找到提交订单按钮，尝试使用脚本提交");
        await this.page.evaluate(() => {
          if (typeof ec !== "undefined") ec.order.submit();
        });
      }

      await this.checkBoxCtPopStage();
      const newUrl = this.page.url();
      if (newUrl !== currentUrl && newUrl.includes(constants.PAYMENT_PAGE_URL)) {
        logger.info("提交订单成功");
        return true;
      }
    } catch (e) {
      logger.error(`点击提交订单异常：${e}`);
    }
    return false;
  }

  setEndCountdown() {
    this.isWaiting = false;
    this.isCountdown = false;
    this.isStartBuying = true;
  }

  async getSecKillTime() {
    logger.info("开始获取抢购开始时间");
    try {
      const elements = await this.page.$$("#prd-detail .css-175oi2r.r-14lw9ot .css-175oi2r.r-14lw9ot.r-18u37iz.r-1wtj0ep .css-175oi2r.r-1wtj0ep .css-146c3p1.r-13uqrnb.r-oxtfae");
      if (elements.length > 3) {
        const text = await elements[3].textContent();
        const year = new Date().getFullYear();
        const match = text.match(/(\d+)月(\d+)日\s+(\d+):(\d+)/);
        if (match) {
          this.secKillTime = new Date(year, parseInt(match[1]) - 1, parseInt(match[2]), parseInt(match[3]), parseInt(match[4]));
          logger.info(`抢购开始时间为：${this.secKillTime}`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 多线程支持
  async createAndStartThreads() {
    const threadCount = Math.max(this.config.getInt("process", "thread", constants.DEFAULT_THREAD_NUM), 1);
    if (threadCount <= 1) return;

    logger.info(`开始创建多线程，需要创建线程数：${threadCount}`);
    for (let i = 2; i <= threadCount; i++) {
      const profilePath = getProfilePath(constants.BASE_PROFILE_PATH, "chromium", i);
      const thread = new HuaWei(profilePath);
      await thread.init();
      thread.secKillTime = this.secKillTime;
      thread.msDiff = this.msDiff;
      this.threadBrowsers.push(thread);
      thread.threadProcess(); // 不await，并发执行
    }
  }

  async threadProcess() {
    await this.visitProductPage();
    await this.loadCookies();
    await this.page.reload();
    await this.chooseProduct();
    await this.getSecKillTime();
    this.setEndCountdown();
    await this.startBuying();
  }

  async loadCookies() {
    const cookies = readCookies();
    if (cookies) {
      await this.context.addCookies(cookies);
    } else {
      logger.warn("未读取到 Cookie 数据");
      process.exit(1);
    }
  }

  async loadCookiesIfExists() {
    const cookies = readCookies();
    if (cookies) {
      logger.info("检测到本地 cookies，尝试使用...");
      await this.context.addCookies(cookies);
      await this.page.reload();
    }
  }

  // 关闭浏览器
  async closeBrowser() {
    await this.browser?.close();
    for (const thread of this.threadBrowsers) {
      await thread.browser?.close();
    }
  }
}
