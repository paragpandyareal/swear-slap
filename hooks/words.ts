// Copyright (c) 2026 Parag Pandya. MIT License, see LICENSE.
// Swear Slap: https://github.com/paragpandyareal/swear-slap

// The swear list. Each rule is a pattern and the polite word that replaces it.
// Edit freely: add a line to catch a new word, delete a line to allow one.
// Patterns only match whole words, so "class" never trips "ass".

type Rule = { pattern: string; polite: string }

export const RULES: Rule[] = [
  { pattern: 'mother\\s*f\\w*', polite: 'mother hubbard' },
  { pattern: 'god\\s*damn(ed|it)?', polite: 'gosh darn' },
  { pattern: 'f+u+c+k+i+n+g*|f+u+c+k+e+n|f[*#@]+k?ing|fking|fkn|fuckin', polite: 'fudging' },
  { pattern: 'f+u+c+k+e+d|f[*#@]+ked', polite: 'fudged' },
  { pattern: 'f+u+c+k+e+r+s?', polite: 'fudger' },
  { pattern: 'f+u+c+k+s?|f[*#@]{2,}k?|fuk|fck', polite: 'fudge' },
  { pattern: 'bull\\s*sh+[i1!]+t+', polite: 'baloney' },
  { pattern: 'sh+[i1!]+t+t+y', polite: 'crummy' },
  { pattern: 'sh+[i1!]+t+s?|sh[*]t', polite: 'shoot' },
  { pattern: 'bitch(es|ing|y)?', polite: 'biscuit' },
  { pattern: '(ass|arse)holes?', polite: 'pickle' },
  { pattern: 'bastards?', polite: 'rascal' },
  { pattern: 'dick(head)?s?', polite: 'dingus' },
  { pattern: 'cunts?', polite: 'clown' },
  { pattern: 'wank(er|ers|ing)?', polite: 'wally' },
  { pattern: 'pissed', polite: 'peeved' },
  { pattern: 'piss', polite: 'wee' },
  { pattern: 'bollocks', polite: 'nonsense' },
  { pattern: 'damn(ed|it)?', polite: 'darn' },
  { pattern: 'crappy', polite: 'cruddy' },
  { pattern: 'crap', polite: 'crud' },
  { pattern: 'bloody', polite: 'flipping' },
  { pattern: '(ass|arse)(es)?', polite: 'butt' },
  { pattern: 'wtf', polite: 'what the fudge' },
  { pattern: 'ffs', polite: "for fudge's sake" },
  { pattern: 'stfu', polite: 'hush' },
  { pattern: 'omfg', polite: 'omg' },
]

const ANY = new RegExp(
  '(?<![a-z0-9])(' + RULES.map(r => r.pattern).join('|') + ')(?![a-z0-9])',
  'gi',
)
const EACH = RULES.map(r => ({
  re: new RegExp('^(' + r.pattern + ')$', 'i'),
  polite: r.polite,
}))

// Parts of a message that are never checked: pasted blocks and code blocks.
// You didn't write those swears, so you don't get slapped for them.
const PROTECTED = /```[\s\S]*?```|<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g

function matchCase(original: string, polite: string): string {
  const letters = original.replace(/[^a-z]/gi, '')
  if (letters.length > 1 && letters === letters.toUpperCase()) return polite.toUpperCase()
  if (/^[A-Z]/.test(original)) return polite.charAt(0).toUpperCase() + polite.slice(1)
  return polite
}

function politeFor(word: string): string {
  for (const r of EACH) if (r.re.test(word)) return matchCase(word, r.polite)
  return word
}

// Runs fn over the parts of the text a person typed, leaving pasted and
// code blocks exactly as they were.
function overTyped(text: string, fn: (part: string) => string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(PROTECTED)) {
    out += fn(text.slice(last, m.index)) + m[0]
    last = (m.index ?? 0) + m[0].length
  }
  return out + fn(text.slice(last))
}

export type Verdict = { swears: number; polite: string }

export function check(text: string): Verdict {
  let swears = 0
  const polite = overTyped(text, part =>
    part.replace(ANY, word => {
      swears += 1
      return politeFor(word)
    }),
  )
  return { swears, polite }
}
