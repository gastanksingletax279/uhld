# Security Policy

## Supported Versions

UHLD is currently under heavy development. Only the latest version is supported.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

To report a security issue, open a [GitHub Security Advisory](../../security/advisories/new) so it can be reviewed privately.

Include as much detail as possible:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Scope

UHLD is a self-hosted tool intended to run on a private network. That said, please report anything that could allow:
- Authentication bypass
- Credential or secret exposure
- Remote code execution
- Privilege escalation

## Notes

- All plugin credentials are encrypted at rest using Fernet symmetric encryption
- JWT tokens are stored in httpOnly cookies
- UHLD is not designed to be exposed directly to the public internet — use a reverse proxy with authentication (e.g. Tailscale, Authelia, Cloudflare Access) if you need remote access
