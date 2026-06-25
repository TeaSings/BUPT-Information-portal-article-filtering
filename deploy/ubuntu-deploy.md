# Ubuntu Deployment

## 1. Clone

```bash
sudo mkdir -p /opt/bupt-portal-monitor
sudo chown "$USER":"$USER" /opt/bupt-portal-monitor
git clone git@github.com:TeaSings/BUPT-Information-portal-article-filtering.git /opt/bupt-portal-monitor
cd /opt/bupt-portal-monitor
```

## 2. Install Dependencies

```bash
bash deploy/ubuntu-setup.sh
```

Node dependencies are locked in `package-lock.json`, so use `npm ci` on the server.

## 3. Configure Secrets

Create `.env` on the server:

```bash
cp .env.example .env
nano .env
```

Required values:

```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@qq.com
SMTP_PASS=your_qq_mail_authorization_code
MAIL_FROM=your@qq.com
MAIL_TO=teasings@qq.com,1983856855@qq.com

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

Keep `.env` out of git, even for private repositories.

## 4. Portal Login State

Copy a valid local login state if it still works on the server:

```bash
mkdir -p state
scp state/bupt-auth.json user@server:/opt/bupt-portal-monitor/state/bupt-auth.json
```

If the portal binds sessions to IP or device, you need to run `npm run login` on the server through a GUI/Xvfb/browser session, or refresh the state from a machine that can access the portal.

## 5. Test

```bash
npm run doctor
npm run check
npm run review
npm run report
npm run send -- --force
```

## 6. Enable systemd Timer

```bash
sudo cp deploy/bupt-portal-monitor.service /etc/systemd/system/
sudo cp deploy/bupt-portal-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bupt-portal-monitor.timer
systemctl list-timers | grep bupt
```

Logs:

```bash
journalctl -u bupt-portal-monitor.service -n 200 --no-pager
```
