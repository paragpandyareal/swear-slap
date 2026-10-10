# Security

Please report a security problem privately through GitHub: **Security → Report a vulnerability** on https://github.com/paragpandyareal/swear-slap. Don't open a public issue for it.

## What the mod can do (threat model)

- It reads the message you are about to send and can stop it or let it through. It never changes what Claude receives except to remove a leading `~ `.
- It starts a few fixed programs, only to play its sound: `uname -s` once per session (to tell Mac from Linux), and, when a slap happens, `powershell.exe` on Windows or `sh` with `paplay`/`aplay` on Linux. The commands are fixed text in `hooks/register.ts`; nothing you type is passed to them. The only input is the bundled sound.
- It reads three environment variables: `OS`, `DISPLAY` and `WAYLAND_DISPLAY`. It reads no credentials.
- It makes no network requests and writes no files (the Linux player uses one temporary file for the sound and deletes it).
