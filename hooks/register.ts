// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Swear Slap: https://github.com/paragpandyareal/swear-slap

import type { CoreEngineInterface, Register } from 'claude-code'

import { DURATION, renderFrame, toCells } from './art'
import { SLAP_WAV } from './sound'
import { check } from './words'

// Starting a message with "~ " skips the check (Claude Code already uses "!" for shell mode).
const BYPASS = /^~\s+/

const CENTS_PER_SWEAR = 50

const ROASTS = [
  'Strewth. Language, mate.',
  'Wash your mouth out, ya galah.',
  'Claude felt that one in its weights.',
  'Your nan reads these logs, you know.',
  'Bold words from someone with 47 open tabs.',
  "That bug didn't deserve that. Neither did I.",
  "Settle down, it's only JavaScript.",
  'Rage typing detected. Have a glass of water.',
  "That's going in the jar, champ.",
  'Deep breaths. In through the nose, out through the code review.',
  'The keyboard is crying. Hope you are happy.',
  'Manners cost nothing. Swearing costs fifty cents.',
]

type Slap = {
  startedAt: number
  roast: string
  coins: number
  seed: number
  jarCents: number
}

function base64(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer)
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const SOUND_HELP: Record<string, string> = {
  auto: 'Sound is auto: the thwack plays on Mac, Windows and Linux. Over SSH it rings your terminal bell instead.',
  bell: 'Sound is bell: each slap rings your terminal bell. In Windows Terminal, point the profile\'s bell sound at slap.wav for a real thwack.',
  off: 'Sound is off.',
}

// Where Claude Code is running decides how the thwack can be heard.
type Player = 'mac' | 'windows' | 'linux' | 'ssh'

// Windows: PowerShell's built-in player. It waits until SLAP_AT (epoch ms) so
// the sound lands on the impact however long PowerShell takes to start.
const WINDOWS_PLAY =
  '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());' +
  '$w=[long]$env:SLAP_AT-[DateTimeOffset]::Now.ToUnixTimeMilliseconds();' +
  'if($w -gt 0){Start-Sleep -Milliseconds $w};' +
  '(New-Object Media.SoundPlayer (New-Object IO.MemoryStream(,$b))).PlaySync()'

// Linux: PulseAudio/PipeWire's paplay, else ALSA's aplay; silent if neither.
const LINUX_PLAY =
  'f=$(mktemp) || exit 0; base64 -d > "$f"; ' +
  '(paplay "$f" || aplay -q "$f") >/dev/null 2>&1; rm -f "$f"'

const IMPACT_MS = 620

// Plays the thwack the way this machine can, and says what it did.
async function thwack($: CoreEngineInterface, sound: string, player: Player): Promise<string> {
  const how = sound === 'bell' || (sound === 'auto' && player === 'ssh') ? 'bell' : sound === 'auto' ? player : 'off'
  if (how === 'off') return 'Sound is off.'
  if (how === 'bell') {
    const r = await $.ui.notify('SLAP!', { title: 'Swear Slap' })
    if (r.isSent) return 'Rang your terminal bell (' + r.channel + '). If you heard nothing, turn on the bell sound in your terminal\'s settings.'
    return 'Could not ring the bell (' + r.reason + '). Open /config and set notifications to Terminal Bell, then try /slap sound test again.'
  }
  if (how === 'mac') {
    await $.audio.play({ asset: 'sounds/slap.wav' })
    return 'Played the thwack.'
  }
  if (how === 'windows') {
    const at = String((await $.clock.now()) + 50)
    const r = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_PLAY], { stdin: SLAP_WAV, env: { SLAP_AT: at }, timeoutMs: 15000 })
    return r.exitCode === 0 ? 'Played the thwack.' : 'Windows could not play it: ' + r.stderr.trim().slice(0, 200)
  }
  const r = await $.process.run(['sh', '-c', LINUX_PLAY + '; echo $?'], { stdin: SLAP_WAV, timeoutMs: 10000 })
  return r.exitCode === 0 ? 'Played the thwack (or tried: needs paplay or aplay).' : 'Linux could not play it.'
}

const money = (cents: number) => '$' + (cents / 100).toFixed(2)

export const register: Register = on => {
  // The slap that's playing right now, if any. A reload just ends it early.
  let slap: Slap | null = null
  let showText = false
  let tick: { cancel: () => void } | null = null
  let timers: { cancel: () => void }[] = []
  let player: Player = 'mac'

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'slap',
        description: 'Slap mod: /slap on, /slap off, /slap jar, /slap reset, /slap sound',
        argumentHint: '[on|off|jar|reset|sound auto|bell|off|test]',
        immediate: true,
      })
    } catch {
      // A command of that name already exists; the slap still works without it
    }
    // Work out once how this machine can play the thwack
    try {
      if ((await $.env.get('OS')) === 'Windows_NT') player = 'windows'
      else {
        const uname = await $.process.run(['uname', '-s'], { timeoutMs: 3000 })
        if (uname.stdout.trim() === 'Darwin') player = 'mac'
        // Linux with no screen is a server reached over SSH: it has no
        // speakers, so the bell (which travels back over SSH) rings instead
        else if ((await $.env.get('DISPLAY')) || (await $.env.get('WAYLAND_DISPLAY'))) player = 'linux'
        else player = 'ssh'
      }
    } catch {
      player = 'mac'
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'slap' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await $.store.set('enabled', false)
      return { text: 'Slap paused. Swear away. Type /slap on to bring the hand back.' }
    }
    if (arg === 'on') {
      await $.store.set('enabled', true)
      return { text: 'Slap is armed. Mind your language.' }
    }
    if (arg === 'sound test') {
      const sound = String((await $.store.get('sound')) ?? 'auto')
      const where = { mac: 'a Mac', windows: 'Windows', linux: 'a Linux desktop', ssh: 'a server (bell over SSH)' }[player]
      try {
        return { text: 'Detected ' + where + ', sound ' + sound + '. ' + (await thwack($, sound, player)) }
      } catch (err) {
        return { text: 'Detected ' + where + ', sound ' + sound + '. It failed: ' + String(err).slice(0, 200) }
      }
    }
    if (arg.startsWith('sound')) {
      const mode = arg.slice(5).trim()
      if (mode === 'auto' || mode === 'bell' || mode === 'off') {
        await $.store.set('sound', mode)
        return { text: SOUND_HELP[mode] }
      }
      const now = String((await $.store.get('sound')) ?? 'auto')
      return { text: 'Sound is ' + now + '. Choose /slap sound auto (picks the right way for this machine), /slap sound bell (always the terminal bell), /slap sound off, or /slap sound test to hear it now.' }
    }
    if (arg === 'reset') {
      await $.store.set('jarCents', 0)
      await $.store.set('slaps', 0)
      return { text: 'Swear jar emptied. Fresh start.' }
    }
    const isOn = (await $.store.get('enabled')) !== false
    const jarCents = Number((await $.store.get('jarCents')) ?? 0)
    const slaps = Number((await $.store.get('slaps')) ?? 0)
    return {
      text:
        'Slap is ' + (isOn ? 'on' : 'paused') + '. Swear jar ' + money(jarCents) + ' from ' + slaps + (slaps === 1 ? ' slap' : ' slaps') + '. ' +
        'Commands: /slap on, /slap off, /slap jar, /slap reset. Start a message with ~ to skip the check once.',
    }
  }).catch(() => ({ text: 'Swear Slap could not do that just now. Try again, or /reload-plugins.' }))

  on('prompt.submit', async ($, e, next) => {
    // Only check what a person said: typed here, sent from the phone app, or
    // passed on as their own words by another mod (dictation, say). Never
    // scheduled tasks, other sessions, or Claude Code's own notices.
    const o = e.origin as typeof e.origin | undefined
    const fromPerson = !o || o.kind === 'composer' || o.kind === 'bridge' || (o.kind === 'plugin' && o.asUser === true)
    if (!fromPerson) return next(e)

    const bypass = BYPASS.exec(e.text)
    if (bypass) return next({ ...e, text: e.text.slice(bypass[0].length) })

    if ((await $.store.get('enabled')) === false) return next(e)

    const verdict = check(e.text)
    if (verdict.swears === 0) return next(e)

    const slaps = Number((await $.store.get('slaps')) ?? 0)
    const jarCents = Number((await $.store.get('jarCents')) ?? 0) + verdict.swears * CENTS_PER_SWEAR
    await $.store.set('slaps', slaps + 1)
    await $.store.set('jarCents', jarCents)

    const sound = String((await $.store.get('sound')) ?? 'auto')
    tick?.cancel()
    for (const t of timers) t.cancel()
    // PowerShell is slow to start, so it gets going now and waits for the impact itself
    if (sound === 'auto' && player === 'windows') {
      const at = String((await $.clock.now()) + IMPACT_MS)
      void $.process
        .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_PLAY], { stdin: SLAP_WAV, env: { SLAP_AT: at }, timeoutMs: 15000 })
        .catch(() => {})
    }
    slap = {
      startedAt: await $.clock.now(),
      roast: ROASTS[Math.floor(Math.random() * ROASTS.length)] ?? ROASTS[0]!,
      coins: Math.min(slaps, 8),
      seed: Math.floor(Math.random() * 100000) + 1,
      jarCents,
    }
    showText = true
    tick = $.clock.every(33, () => $.ui.invalidate('ui.render'))
    timers = [
      // Put the polite version back in the prompt box so nothing is lost
      $.clock.after(120, () => {
        void $.prompt.fill({ text: verdict.polite }).catch(() => {})
      }),
      // The thwack, on impact. Over SSH the only sound that reaches the
      // person's own computer is the terminal bell, so 'auto' rings that there.
      $.clock.after(IMPACT_MS, () => {
        if (!(sound === 'auto' && player === 'windows')) void thwack($, sound, player).catch(() => {})
      }),
      // Animation over: stop redrawing, keep the words up a little longer
      $.clock.after(DURATION * 1000 + 100, () => {
        tick?.cancel()
        tick = null
        $.ui.invalidate('ui.render')
      }),
      $.clock.after(DURATION * 1000 + 4500, () => {
        slap = null
        showText = false
        $.ui.invalidate('ui.render')
      }),
    ]
    $.ui.invalidate('ui.render')

    return { drop: 'Slapped! Not sent to Claude, so it cost nothing. A polite version is back in your prompt box.' }
  // If anything goes wrong, the message goes through untouched rather than getting lost
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!slap || !showText || e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text } = els

    const words = [
      Box({
        flexDirection: 'row',
        children: [
          Text({ bold: true, color: '#ffffff', backgroundColor: '#d70000', children: [' SLAP! '] }),
          Text({ children: [' '] }),
          Text({ bold: true, color: '#ffaf87', children: [slap.roast] }),
        ],
      }),
      Text({
        dimColor: true,
        wrap: 'truncate-end',
        children: ['Swear jar ' + money(slap.jarCents) + '  ·  not sent to Claude  ·  ~ skips the check  ·  /slap off to pause'],
      }),
    ]

    const t = ((await $.clock.now()) - slap.startedAt) / 1000
    const Raster = e.surface === 'terminal' && 'Raster' in els ? els.Raster : null
    if (!Raster || t >= DURATION) {
      return Box({
        flexDirection: 'column',
        children: words,
      })
    }

    // As big as the band allows: in fullscreen that is already capped at half
    // the screen; on the main screen it is the whole terminal, so take 60%.
    // Two rows are kept for the words underneath.
    const room = e.viewport?.isFullscreen === false ? Math.floor(e.props.maxRows * 0.6) : e.props.maxRows
    const columns = Math.max(20, Math.min(e.props.bodyColumns, 160))
    const rows = Math.max(6, Math.min(40, room - 2))
    const frame = renderFrame(t, columns * 2, rows * 2, { coins: slap.coins, seed: slap.seed })

    return Box({
      flexDirection: 'column',
      children: [Raster({ key: 'slap', columns, rows, cells: base64(toCells(frame)) }), ...words],
    })
  }).catch(($, e, next) => next(e))
}
