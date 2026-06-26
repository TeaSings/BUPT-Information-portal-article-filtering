# BUPT Portal Monitor

北邮信息门户日报脚本：抓取前一天新闻和通知，读取正文与图片 OCR 文本，用 DeepSeek Pro 精简成邮件，并按收件人去重发送。

## Features

- 新闻、通知抓取
- 图片 OCR
- DeepSeek Pro 筛选与摘要
- QQ/SMTP 邮件发送
- 按收件人避免重复发送
- 支持 headless 门户登录和服务器每小时运行

## Setup

```bash
npm install
cp .env.example .env
npm run doctor
```

编辑 `.env`，至少填写：

- SMTP：`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`、`MAIL_TO`
- DeepSeek：`DEEPSEEK_API_KEY`
- 自动登录：`BUPT_AUTO_LOGIN`、`BUPT_USERNAME`、`BUPT_PASSWORD`

本地手动登录：

```bash
npm run login
```

headless 自动登录：

```bash
npm run login:auto
```

## Usage

```bash
npm run daily
npm run hourly
npm run netcheck
```

常用辅助命令：

```bash
npm run check
npm run review
npm run report
npm run send -- --force
npm run queue -- --retry-failed
npm run cleanup
```

指定日期：

```bash
npm run daily -- --date 2026-06-24 --force
```

## Deploy

Ubuntu/systemd 部署见 [deploy/ubuntu-deploy.md](deploy/ubuntu-deploy.md)。

运行数据位于 `state/`、`data/`、`reports/`、`daily/`，默认不进入 git。
