# Running the app on a server

The app runs on the NinjaWrekcs DigitalOcean server (`159.89.193.93`, Ubuntu 24.04, 1 CPU, 1 GB) at **https://amcgh.iftikharahmed.site**, next to the NinjaWrekcs site. That site's nginx, MySQL and PHP are left untouched.

**Photo reading (OCR) is off.** It needs about 2 GB of memory while reading a page, and this server has 1 GB. Photos are still uploaded and kept; doctors fill those forms by hand. To switch it on, resize the server to about 4 GB and 2 CPUs, then set `CAPTURE_EXTRACTION_ENABLED=true` and add the worker (`uv sync --extra ocr`, `python -m capture.worker` as a second service).

## What is where on the server

| What | Where |
| --- | --- |
| App code (last three releases) | `/srv/capture/releases/`, live one at `/srv/capture/current` |
| Website files | `/srv/capture/web` |
| Photos and the stand-in hospital file | `/srv/capture/storage` |
| Settings and secrets | `/etc/capture/capture.env` |
| First admin password | `/root/capture-admin-password.txt` |
| Database | PostgreSQL 16, database `capture` (small settings in `conf.d/capture-small.conf`) |
| Backups | `/var/backups/capture`: database every night at 02:30 (14 kept), photos on Sundays (2 kept) |
| Web server entry | `/etc/nginx/sites-available/capture` |
| App service | `capture-api` (port 8100 on the server only), memory capped at 400 MB |

The backups protect against mistakes, not against losing the server. For that, switch on DigitalOcean's droplet backups, or copy `/var/backups/capture` elsewhere now and then.

## Everyday commands

From the repo root on the PC, in Git Bash:

```bash
bash deploy/release.sh          # put what is committed on the server
```

On the server (`ssh root@159.89.193.93`):

```bash
systemctl status capture-api            # is it running
journalctl -u capture-api -n 100        # its log
cat /root/capture-admin-password.txt    # the first admin login
systemctl start capture-backup          # back up now
```

## Once only

1. `DOMAIN=amcgh.iftikharahmed.site bash deploy/server-setup.sh` on the server, as root. It is done already, and safe to repeat.
2. **DNS:** where `iftikharahmed.site` is managed, add an **A** record: name `amcgh`, value `159.89.193.93`.
3. **HTTPS**, once the record works (`nslookup amcgh.iftikharahmed.site` shows the IP):
   `certbot --nginx -d amcgh.iftikharahmed.site`. Logins need HTTPS: the login cookie is only sent over it.
4. Rebuild the Android and Windows apps with `--dart-define=APP_URL=https://amcgh.iftikharahmed.site`.

## Moving to the real hospital system

Edit `/etc/capture/capture.env`: `CAPTURE_HOSPITAL=http`, `CAPTURE_HOSPITAL_URL=...`, `CAPTURE_HOSPITAL_TOKEN=...`. Then run `systemctl restart capture-api`. The contract is in `docs/hospital-api.md`.
