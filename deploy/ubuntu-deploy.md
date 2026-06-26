# Ubuntu Deployment

每小时运行一次 `npm run hourly`。脚本会按收件人去重，已收到日报的邮箱不会重复收到。

## Install

```bash
sudo mkdir -p /opt/bupt-portal-monitor
sudo chown "$USER":"$USER" /opt/bupt-portal-monitor
git clone git@github.com:TeaSings/BUPT-Information-portal-article-filtering.git /opt/bupt-portal-monitor
cd /opt/bupt-portal-monitor
bash deploy/ubuntu-setup.sh
```

## Configure

```bash
cp .env.example .env
nano .env
```

服务器建议设置：

```env
BUPT_AUTO_LOGIN=true
BUPT_USERNAME=your_bupt_username
BUPT_PASSWORD=your_bupt_password
```

同时填写 SMTP、`MAIL_TO` 和 `DEEPSEEK_API_KEY`。

## VPN

先在服务器上连接北邮 VPN/aTrust，再跑脚本。连接后检查：

```bash
npm run netcheck
```

如果服务器没有图形界面，先用 VNC/RDP/控制台完成 aTrust 登录。VPN 保持在线后再启用 timer。

## Verify

```bash
npm run doctor
npm run netcheck
npm run login:auto
npm run hourly
```

## Enable Timer

```bash
sudo cp deploy/bupt-portal-monitor.service /etc/systemd/system/
sudo cp deploy/bupt-portal-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bupt-portal-monitor.timer
systemctl list-timers | grep bupt
```

日志：

```bash
journalctl -u bupt-portal-monitor.service -n 200 --no-pager
```
