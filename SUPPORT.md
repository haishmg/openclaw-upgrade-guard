# Support

Use GitHub issues for:

- Clawback bugs
- false positives or false negatives
- upgrade regression cases
- feature requests
- documentation fixes

Before opening an issue, run:

```sh
npm run ci
```

For live OpenClaw upgrade problems, include:

- current version
- target version
- command used
- redacted error summary
- whether the failure occurred in container rehearsal, guarded update, or post-upgrade validation

Do not post raw credentials, raw `~/.openclaw`, private reports, phone numbers, auth stores, or workspace contents.
