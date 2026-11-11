# paseo-plugin-later

Schedule one message to a Paseo agent and send it later. Use it when a usage limit stops a session and you want to continue after the reset without waiting at the keyboard.

## Install

```bash
paseo plugin add paseo-plugin-later
```

Requires Paseo 0.15.1 or later.

## Usage

Type `/later` in an agent's composer:

```
/later 16m continue
/later 1h30m re-run the failing test
/later 14:30 pick this up after the meeting
```

The first word is the delay: `45s`, `16m`, `2h`, `1h30m`, a bare number of minutes, or a clock time. The rest is the message, sent to the same agent when the time comes.

A row appears in the conversation with the message and its time. While it says Scheduled you can cancel it. After delivery the row changes to Sent, or to Not sent with the reason.

## How it works

The daemon plugin stores pending jobs in `~/.paseo/plugin-data/later/jobs.json` and arms a timer for each one. At the due time it sends the message through the normal agent API, so the provider session, model, and tools stay the same. Jobs survive a plugin reload and a daemon restart.

Limits: at most 24 hours ahead, one message per command, and the message must be 8000 characters or less. Delivery waits up to 30 minutes if the plugin has no Paseo session yet after a restart. A message is not delivered if the agent is archived or deleted.

## Development

```bash
npm install
npm run typecheck
paseo plugin install /path/to/paseo-plugin-later
paseo plugin reload paseo-plugin-later
```
