Later schedules one message to the agent you are looking at, then sends it at the time you give. Use it when a usage limit stops a session and you want to continue after the reset without staying at the keyboard.

Type `/later 16m continue` in the composer. The first word is the delay: `45s`, `16m`, `2h`, `1h30m`, a bare number of minutes, or a clock time such as `14:30`. The rest is the message, sent word for word to the same agent. The command clears the composer and adds a row to the conversation showing the message and its time.

While the row says Scheduled you can cancel it. After delivery the row changes to Sent, or to Not sent with the reason: for example the agent was archived, or the provider rejected the prompt. A message waits up to 24 hours.

Pending messages are kept in `~/.paseo/plugin-data/later/jobs.json`, so they survive a plugin reload and a daemon restart. Delivery starts once the plugin receives a command or lifecycle event, which is normally immediate. The plugin reads no credentials and makes no network requests of its own.
