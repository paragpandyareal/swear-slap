// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Swear Slap: https://github.com/paragpandyareal/swear-slap

import { describe, expect, mock, test } from 'claude-code/testing'
import type { PromptSubmitInput } from 'claude-code'

import { renderFrame, toCells } from './art'
import { check } from './words'

// A prompt as if the person typed it and pressed Enter
const typed = (text: string): PromptSubmitInput => ({ text, wait: false, origin: { kind: 'composer' } })
const slapCommand = (args: string) => ({ command: 'slap', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } })

describe('words', () => {
  test('finds swears and swaps in polite words', async () => {
    const v = check("why won't this fucking build work")
    expect(v.swears).toBe(1)
    expect(v.polite).toBe("why won't this fudging build work")
  })

  test('keeps capitals', async () => {
    expect(check('Shit. WTF is this?').polite).toBe('Shoot. WHAT THE FUDGE is this?')
  })

  test('leaves innocent words alone', async () => {
    const v = check('assess the class, pass the assets to Scunthorpe and grass')
    expect(v.swears).toBe(0)
  })

  test('ignores swears inside code blocks', async () => {
    const v = check('what does this do\n```\nconst shit = 1\n```')
    expect(v.swears).toBe(0)
  })
})

describe('the slap', () => {
  test('a swear is dropped and the polite version goes back in the box', async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    const filled: string[] = []
    on('prompt.fill', async (_$, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    let reachedClaude = false
    on('prompt.submit', async (_$, e) => {
      reachedClaude = true
      return { text: e.text }
    })

    const r = await $.prompt.submit(typed("why won't this fucking build work"))
    expect(typeof r.drop).toBe('string')
    expect(reachedClaude).toBe(false)

    await clock.advance(200)
    expect(filled).toEqual(["why won't this fudging build work"])
    const jar = await $.command.run(slapCommand('jar'))
    expect(jar.text).toContain('Swear jar $0.50')
  })

  test('a clean message goes straight through', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    let sent = ''
    on('prompt.submit', async (_$, e) => {
      sent = e.text
      return { text: e.text }
    })
    await $.prompt.submit(typed('please fix the build'))
    expect(sent).toBe('please fix the build')
  })

  test('starting with ~ skips the check', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    let sent = ''
    on('prompt.submit', async (_$, e) => {
      sent = e.text
      return { text: e.text }
    })
    await $.prompt.submit(typed('~ the log says "shit happened" at line 4'))
    expect(sent).toBe('the log says "shit happened" at line 4')
  })

  test('/slap off pauses it', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    let sent = ''
    on('prompt.submit', async (_$, e) => {
      sent = e.text
      return { text: e.text }
    })
    await $.command.run(slapCommand('off'))
    await $.prompt.submit(typed('damn it'))
    expect(sent).toBe('damn it')
  })
})

describe('sound', () => {
  test('/slap sound bell rings the terminal bell on impact', async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    on('prompt.fill', async () => ({ isFilled: true }))
    const rang: string[] = []
    on('ui.notify', async (_$, e) => {
      rang.push(e.text)
      return { value: { isSent: true, channel: 'terminal_bell' } }
    })
    await $.command.run(slapCommand('sound bell'))
    await $.prompt.submit(typed('oh shit'))
    await clock.advance(700)
    expect(rang).toEqual(['SLAP!'])
  })
})

describe('the art', () => {
  test('every frame packs into whole cells', async () => {
    for (const t of [0, 0.3, 0.55, 0.7, 1.2, 2.0, 2.9]) {
      const f = renderFrame(t, 160, 28, { coins: 3, seed: 42 })
      expect(toCells(f).length).toBe(80 * 14 * 3)
    }
  })
})

describe('the band above the prompt', () => {
  const BAND = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    test('draws the slap on ' + surface, async ($, on) => {
      const clock = mock.clock(on)
      mock.store(on)
      on('prompt.fill', async () => ({ isFilled: true }))
      await $.prompt.submit(typed('this is shit'))
      await clock.advance(700)

      const band = await $.ui.mount({ plugin: 'swear-slap', surface, component: 'AbovePrompt', props: BAND })
      if (surface === 'terminal') {
        const raster = await band.find({ type: 'Raster' })
        expect(raster?.props.columns).toBe(120)
      } else {
        expect(await band.find({ text: /SLAP/ })).toBeDefined()
      }
      expect(await band.find({ text: /Swear jar \$0\.50/ })).toBeDefined()
    })
  }

  test('the band is left alone when nobody swore', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    // stands in for whatever Claude Code would normally show there
    on('ui.render', async (_$, e) => _$.ui.resolve(e).Text({ children: ['usual band'] }))
    const band = await $.ui.mount({ plugin: 'swear-slap', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await band.find({ type: 'Raster' })).toBeUndefined()
    expect(await band.find({ text: 'usual band' })).toBeDefined()
  })
})
