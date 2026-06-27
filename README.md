# BUPT Portal Monitor

北邮信息门户日报脚本。它会读取前一天发布的新闻和通知，结合正文与图片 OCR 文本交给 DeepSeek 判断，再把值得关注的内容整理成一封邮件。

## 功能

- 抓取信息门户新闻和通知
- 识别文章图片中的文字
- 使用 DeepSeek 生成精简日报
- 通过 SMTP 发送邮件
- 按收件人记录发送状态，避免重复发送
- 支持本地 headless 自动登录

## 安装

需要 Node.js 20 或更高版本。

```bash
npm install
cp .env.example .env
```

编辑 `.env`，填写邮箱、DeepSeek API Key 和北邮账号信息。

```bash
npm run doctor
```

## 使用

检查网络：

```bash
npm run netcheck
```

自动登录门户：

```bash
npm run login:auto
```

生成并发送前一天日报：

```bash
npm run daily
```

本地自动化推荐使用幂等入口：

```bash
npm run auto
```

`auto` 会先检查网络和队列状态；如果当天已经给所有当前收件人发送过，就不会重复发送。如果新增了收件人，它只会给缺发的邮箱补发。

## 常用命令

```bash
npm run review       # 用已有抓取结果重新生成 AI 筛选
npm run report       # 用已有筛选结果重新生成报告
npm run queue        # 处理待发送队列
npm run cleanup      # 清理旧队列文件
```

指定日期：

```bash
npm run daily -- --date 2026-06-26
```

只生成不发送：

```bash
npm run daily -- --no-send
```

## 数据与安全

以下内容默认不会进入 Git：

- `.env`
- `state/` 登录状态
- `data/` 抓取结果与 OCR 缓存
- `reports/` 生成的日报
- `daily/` 发送队列和发送记录

不要把真实账号、邮箱授权码、API Key 或登录态提交到仓库。
