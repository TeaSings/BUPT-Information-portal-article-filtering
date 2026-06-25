# BUPT Portal Monitor

每天汇总北京邮电大学信息门户前一天发布的新闻和通知，让 DeepSeek 阅读全部内容，只把真正值得关注的事项写成精简邮件并通过队列发送。

## 工作方式

1. `npm run login`：手动登录一次门户，保存本机登录态到 `state/bupt-auth.json`。
2. `npm run daily`：自动抓取昨天发布的新闻和通知，调用 DeepSeek 阅读全文，生成报告，写入 `daily/pending/`，然后尝试发送邮件。
3. Codex 自动化或 macOS 定时任务每天运行 `npm run daily`。

登录态、抓取数据、报告和邮箱授权码都不会进入 git。

## 队列目录

```text
daily/
  pending/  # 已生成、等待发送的日报任务
  sent/     # 发送成功的任务记录
  failed/   # 发送失败的任务记录
```

邮件服务短暂失败时，任务会进入 `failed/`，不会直接丢失。修好邮箱配置后可以重新入队：

```bash
npm run queue -- --retry-failed
```

清理旧队列文件：

```bash
npm run cleanup
```

默认保留：`sent` 30 天，`failed` 14 天，`pending` 45 天。可以在 `config/monitor.config.json` 里改 `queue.retentionDays`。

## 初次配置

```bash
cd "/Users/chensanya/Google Drive/我的云端硬盘/bupt-portal-monitor"
npm install
cp .env.example .env
```

然后编辑 `.env`：

```bash
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的发件邮箱
SMTP_PASS=邮箱授权码
MAIL_FROM=你的发件邮箱
MAIL_TO=你的收件邮箱
DEEPSEEK_API_KEY=你的DeepSeek API key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

很多邮箱不允许直接使用登录密码发信，需要在邮箱设置里生成“SMTP 授权码”或“应用专用密码”。

## 手动登录门户

```bash
npm run login
```

脚本会打开浏览器。你在浏览器里正常输入校园账号、验证码或二次验证。确认已经进入信息门户首页后，回到终端按回车，脚本会保存登录态。

请不要把校园账号密码写进脚本、`.env` 或聊天里。

## 测试抓取

```bash
npm run check
npm run review
npm run report
```

默认目标日期是“昨天”。也可以指定日期：

```bash
npm run check -- --date 2026-06-24
npm run review -- --date 2026-06-24
npm run report -- --date 2026-06-24
```

## 测试发邮件

```bash
npm run send -- --date 2026-06-24
```

正式每日运行：

```bash
npm run daily
```

如果只想生成队列任务但不发送：

```bash
npm run daily -- --no-send
```

## Codex 自动化建议

等你完成 `npm install`、`.env` 和 `npm run login` 后，可以创建一个 Codex 本地自动化：

> 每天北京时间 8:30，在 `/Users/chensanya/Google Drive/我的云端硬盘/bupt-portal-monitor` 运行 `npm run daily`。任务应抓取前一天发布的新闻和通知，让 DeepSeek 阅读全部文章，写入 daily 队列并发送精简邮件；如果登录态过期、DeepSeek 调用失败或邮件发送失败，请明确告诉我需要处理哪一项配置。

## Ubuntu 部署

服务端依赖以 Node.js 为主：

```bash
bash deploy/ubuntu-setup.sh
```

`requirements.txt` 只是给服务器环境的说明占位；真正的 npm 依赖请使用 `package-lock.json`：

```bash
npm ci
```

完整部署步骤见 `deploy/ubuntu-deploy.md`。
