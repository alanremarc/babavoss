// Loaded before every spec: no spec asks the repository for the latest release. One that needs an answer sets its own.
process.env.BABAVOSS_LATEST ??= ""
