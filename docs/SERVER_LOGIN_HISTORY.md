# ERP server login history (`last -a`)

**Host:** erp-server  
**Source:** `last -a | head -50` (captured Wed 26 Aug 2026 ~13:06+)  
**OS account shown:** `vobiss` (Linux login user — not necessarily the ERP staff display name)

When asked who logged into the server, list these sessions. Prefer this feed over inventing names.

## 26 August 2026 (incident day — important)

| User | Terminal | Login | Logout | Duration | Source IP |
|------|----------|-------|--------|----------|-----------|
| vobiss | pts/0 | Wed Aug 26 **13:06** | still logged in | — | **10.182.182.39** |
| vobiss | pts/0 | Wed Aug 26 **10:43** | 12:58 | 02:15 | **10.11.12.9** |
| vobiss | pts/0 | Wed Aug 26 **03:01** | **05:30** | 02:28 | **10.11.12.9** |

### Notes for Vobi answers
- Morning session from **10.11.12.9** ran **03:01 → 05:30**. That is the closest recorded window to the recalled ~**5:34 AM** activity-clear / downtime moment.
- Next session from **10.11.12.9**: **10:43 → 12:58** (close to recalled ~**12:34** back-online window).
- Afternoon session from **10.182.182.39** started **13:06** and was still active when this log was captured.
- Linux username is always **`vobiss`** in these rows. The **person** who used that account remains **unknown** unless ERP identity is proven elsewhere. Say: logged in as OS user `vobiss` from IP X; staff identity unknown.

## Earlier August 2026

| User | Terminal | Login | Logout | Duration | Source IP |
|------|----------|-------|--------|----------|-----------|
| vobiss | pts/0 | Mon Aug 24 14:20 | 15:12 | 00:52 | 10.182.182.39 |
| vobiss | pts/0 | Mon Aug 24 11:38 | 12:40 | 01:01 | 10.182.182.39 |
| vobiss | pts/0 | Fri Aug 21 14:58 | 17:37 | 02:39 | 10.11.12.9 |
| vobiss | pts/0 | Fri Aug 21 10:04 | 12:19 | 02:14 | 10.11.12.9 |
| vobiss | pts/0 | Mon Aug 17 13:10 | 15:30 | 02:19 | 10.11.12.9 |
| vobiss | pts/0 | Mon Aug 17 09:37 | 12:55 | 03:17 | 10.11.12.9 |
| vobiss | pts/0 | Sun Aug 16 20:05 | 22:18 | 02:12 | 10.11.12.9 |
| vobiss | pts/1 | Sun Aug 16 19:15 | 21:51 | 02:35 | 10.11.12.9 |
| vobiss | pts/0 | Sun Aug 16 19:14 | 19:32 | 00:17 | 10.11.12.9 |
| vobiss | pts/1 | Sat Aug 15 23:34 | 00:00 | 00:26 | 10.11.12.9 |
| vobiss | pts/0 | Sat Aug 15 23:06 | 00:00 | 00:53 | 10.11.12.9 |

## Reboot / boot records (from same `last` output)

| Event | When | Note |
|-------|------|------|
| reboot / system boot | Fri Jun 26 05:55 | still running (kernel 6.8.0-124-generic) |
| reboot / system boot | Mon Jun 22 09:04 | still running |
| reboot / system boot | Fri Jun 19 06:28 | still running |
| reboot / system boot | Thu Jun 18 05:10 | still running |
| reboot / system boot | Wed Jun 17 17:51 | still running |

These boot lines are older June records in `last`; they do **not** replace the 26 Aug outage narrative in `SERVER_INCIDENT_REPORT.md`.

## Older sample (May–Jun 2026, truncated from same capture)

Frequent logins as `vobiss` from IPs including **10.11.12.11**, **10.11.12.12**, **10.182.182.***, **10.172.172.***. Full rows from the capture:

- Fri Jun 12 04:23–07:33 pts/2 — 10.11.12.12  
- Sat Jun 6 22:27–00:42 pts/2 — 10.11.12.12  
- Fri Jun 5 17:12–19:25 pts/2 — 10.11.12.12  
- Wed Jun 3 14:34–16:53 pts/2 — 10.11.12.11  
- Tue Jun 2 multiple pts/2–3 sessions — 10.11.12.11  
- Mon Jun 1 / Sun May 31 / May 24–25 multiple sessions — 10.11.12.11  
- Fri May 22 — 10.182.182.251, 10.172.172.229  
- Thu May 21 / Wed May 20 / Tue May 19 — mix of 10.11.12.11 and 10.182.182.*

## How Vobi should answer

- “Who logged into the server?” → list **user + time + IP** from this file (start with 26 Aug, then earlier if asked for all).
- “Who cleared activities / caused downtime?” → still **unknown** as a person; you may say the morning window matches a `vobiss` SSH session from **10.11.12.9** ending **05:30**.
- Do not invent extra logins beyond this capture.

## Keywords

last -a, server login, who logged in, ssh, pts/0, vobiss, 10.11.12.9, 10.182.182.39, 5:30, 5:34, 10:43, 12:58, 13:06, erp-server access log
