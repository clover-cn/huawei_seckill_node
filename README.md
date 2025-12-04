# 华为商城抢购脚本 - Node.js 版本

基于 Playwright 的华为商城抢购脚本，从 Python + Selenium 版本移植而来。

## 环境要求

- Node.js >= 18.0.0
- npm 或 yarn

## 安装

```bash
cd nodejs
npm install
npx playwright install chromium
```

## 配置

编辑 `config.ini` 文件：

```ini
[product]
name=HUAWEI Mate 80 Pro    # 产品名称（仅用于日志显示）
id=10086476013098          # 产品ID（从商品页面URL获取）
color=曜石黑               # 颜色规格
version=16GB+512GB         # 版本规格
sets=                      # 套装规格（多个用逗号分隔，为空则抢单品）

[browser]
type=chromium              # 浏览器类型：chromium/firefox/webkit
headless=no                # 是否无头模式
userAgent=...              # 自定义 User-Agent

[process]
thread=1                   # 并发数量
interval=0.001             # 下单间隔（秒）
```

## 运行

```bash
npm start
# 或
node main.js
```

## 使用流程

1. 运行程序后会自动打开浏览器
2. 跳转到登录页面后，使用手机扫码登录
3. 登录成功后自动进入商品页面
4. 等待抢购时间到达后自动点击购买
5. 自动提交订单

## 与 Python 版本的区别

| 特性 | Python 版本 | Node.js 版本 |
|------|------------|--------------|
| 浏览器驱动 | Selenium | Playwright |
| 多线程 | threading.Thread | Promise.all (异步并发) |
| 配置解析 | configparser | ini |
| 日志 | loguru | winston |

## 注意事项

- 请确保网络稳定
- 提前登录并保持登录状态
- 抢购前确认商品规格配置正确
- 本脚本仅供学习交流使用