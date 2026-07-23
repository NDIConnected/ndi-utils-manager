# Security Policy

## Sample software notice

NDI Manager is **reference sample software** provided under the MIT license. It is **not officially supported** as a production product. Use at your own risk.

## Supported versions

Security fixes are applied on the `main` branch. There is no separate long-term support channel for older releases.

## Reporting a vulnerability

If you believe you have found a security issue, please **do not** open a public GitHub issue with exploit details.

Instead, report it through one of:

- [GitHub Security Advisories](https://github.com/NDIConnected/ndi-utils-manager/security/advisories/new) for this repository (preferred)
- Contact the maintainers via the channels listed in [CONTRIBUTING.md](CONTRIBUTING.md)

Include steps to reproduce, affected version, and impact if known.

## Known security posture

This sample hosts a **local Web UI / HTTP API** (default `http://localhost:5000`) and controls **NDI discovery and routing** on the LAN. There is **no authentication** on the Web UI or API by default. Anyone who can reach the listening port can view topology and create or remove NDI connections.

Treat the host and NDI network as a trusted production LAN. Do not expose the Web UI, discovery, or media traffic to untrusted networks without appropriate isolation (bind to localhost only where possible, VLAN, firewall, NDI Bridge policy, etc.).

For deployment guidance see [README.md](README.md) and [DOCS/USER_MANUAL.md](DOCS/USER_MANUAL.md).
