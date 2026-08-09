// ─── GraphQL Utilities ────────────────────────────────────────────────────

const GQL_KEYWORDS = new Set([
  'query', 'mutation', 'subscription', 'fragment', 'on', 'type', 'input',
  'enum', 'union', 'interface', 'scalar', 'extend', 'implements', 'schema',
  'directive', 'repeatable',
])

interface GqlToken {
  type: 'keyword' | 'type' | 'string' | 'blockstring' | 'number' | 'boolean' | 'null'
    | 'comment' | 'variable' | 'directive' | 'spread' | 'punc' | 'name' | 'argname' | 'ws'
  value: string
}

function graphqlTokenize(text: string): GqlToken[] {
  const tokens: GqlToken[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let ws = ''
      while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) {
        ws += text[i]; i++
      }
      tokens.push({ type: 'ws', value: ws })
      continue
    }

    // Comment
    if (ch === '#') {
      let comment = ''
      while (i < len && text[i] !== '\n') { comment += text[i]; i++ }
      tokens.push({ type: 'comment', value: comment })
      continue
    }

    // String (single-line or block)
    if (ch === '"') {
      if (text.slice(i, i + 3) === '"""') {
        let s = '"""'
        i += 3
        while (i < len) {
          if (text.slice(i, i + 3) === '"""') { s += '"""'; i += 3; break }
          s += text[i]; i++
        }
        tokens.push({ type: 'blockstring', value: s })
      } else {
        let s = '"'
        i++
        while (i < len && text[i] !== '"') {
          if (text[i] === '\\') { s += '\\'; i++; if (i < len) { s += text[i]; i++ } }
          else { s += text[i]; i++ }
        }
        if (i < len) { s += '"'; i++ }
        tokens.push({ type: 'string', value: s })
      }
      continue
    }

    // Numbers
    if (/\d/.test(ch) || (ch === '-' && /\d/.test(text[i + 1]))) {
      let num = ''
      if (ch === '-') { num += '-'; i++ }
      while (i < len && /\d/.test(text[i])) { num += text[i]; i++ }
      if (text[i] === '.') { num += '.'; i++; while (i < len && /\d/.test(text[i])) { num += text[i]; i++ } }
      if (text[i] === 'e' || text[i] === 'E') {
        num += text[i]; i++
        if (text[i] === '+' || text[i] === '-') { num += text[i]; i++ }
        while (i < len && /\d/.test(text[i])) { num += text[i]; i++ }
      }
      tokens.push({ type: 'number', value: num })
      continue
    }

    // Spread operator
    if (text.slice(i, i + 3) === '...') {
      tokens.push({ type: 'spread', value: '...' }); i += 3; continue
    }

    // Variable
    if (ch === '$') {
      let v = '$'; i++
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { v += text[i]; i++ }
      tokens.push({ type: 'variable', value: v })
      continue
    }

    // Directive
    if (ch === '@') {
      let d = '@'; i++
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { d += text[i]; i++ }
      tokens.push({ type: 'directive', value: d })
      continue
    }

    // Punctuation
    if ('{}()[]:,!='.includes(ch)) {
      tokens.push({ type: 'punc', value: ch }); i++; continue
    }

    // Identifiers & keywords
    if (/[A-Za-z_]/.test(ch)) {
      let word = ''
      while (i < len && /[A-Za-z0-9_]/.test(text[i])) { word += text[i]; i++ }

      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word })
      } else if (word === 'null') {
        tokens.push({ type: 'null', value: word })
      } else if (GQL_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word })
      } else if (/[A-Z]/.test(word[0])) {
        tokens.push({ type: 'type', value: word })
      } else {
        // Check if this is an argument name (identifier followed by colon, ignoring whitespace)
        // We'll do a lookahead for this
        let j = i
        while (j < len && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++
        if (j < len && text[j] === ':') {
          tokens.push({ type: 'argname', value: word })
        } else {
          tokens.push({ type: 'name', value: word })
        }
      }
      continue
    }

    // Skip any other character
    tokens.push({ type: 'punc', value: ch }); i++
  }

  return tokens
}

export function formatGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  const out: string[] = []
  let indent = 0
  const INDENT_STR = '  '

  // Helper to determine if we should add a newline before closing bracket
  const shouldBreak = (tokens: GqlToken[], idx: number): boolean => {
    // If the matching open bracket was on a different line, break
    if (idx <= 0) return false
    // Check if there's content between the brackets
    let depth = 1
    let j = idx - 1
    while (j >= 0 && depth > 0) {
      const t = tokens[j]
      if (t.type === 'punc' && (t.value === '}' || t.value === ')' || t.value === ']')) depth++
      if (t.type === 'punc' && (t.value === '{' || t.value === '(' || t.value === '[')) depth--
      if (depth === 0) break
      j--
    }
    // Found matching open bracket at j
    // Check if there are any non-ws tokens between j and idx
    let k = j + 1
    while (k < idx) {
      if (tokens[k].type !== 'ws') return true
      k++
    }
    return false
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t.type === 'ws') {
      // Skip whitespace — we'll add our own
      continue
    }

    if (t.type === 'comment') {
      out.push('\n' + INDENT_STR.repeat(indent) + t.value)
      continue
    }

    if (t.type === 'punc') {
      if (t.value === '{' || t.value === '(' || t.value === '[') {
        // Check if next non-ws token is a closing bracket
        let nextNonWs = -1
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type !== 'ws') { nextNonWs = j; break }
        }
        const closeMap: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
        if (nextNonWs >= 0 && tokens[nextNonWs].value === closeMap[t.value]) {
          // Empty brackets — keep on same line
          out.push(t.value)
          continue
        }
        out.push(t.value)
        indent++
        out.push('\n' + INDENT_STR.repeat(indent))
        continue
      }
      if (t.value === '}' || t.value === ')' || t.value === ']') {
        indent = Math.max(0, indent - 1)
        // Check if the content inside was empty
        if (shouldBreak(tokens, i)) {
          out.push('\n' + INDENT_STR.repeat(indent))
        }
        out.push(t.value)
        // Look ahead — if next non-ws is not a closing bracket/comma, add newline
        let nextNonWs = -1
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type !== 'ws') { nextNonWs = j; break }
        }
        if (nextNonWs >= 0 && tokens[nextNonWs].type === 'punc' && tokens[nextNonWs].value === ',') {
          // comma will be handled below
        } else if (nextNonWs >= 0 && tokens[nextNonWs].type !== 'punc') {
          out.push('\n' + INDENT_STR.repeat(indent))
        } else if (nextNonWs >= 0 && tokens[nextNonWs].type === 'punc' && '}])'.includes(tokens[nextNonWs].value)) {
          // Multiple closing brackets — no newline between them
        } else if (nextNonWs >= 0) {
          out.push('\n' + INDENT_STR.repeat(indent))
        }
        continue
      }
      if (t.value === ',') {
        // Skip commas in formatted output (we use newlines instead)
        continue
      }
      if (t.value === ':') {
        out.push(': ')
        continue
      }
      out.push(t.value)
      continue
    }

    // Add space before value if previous output doesn't end with whitespace or opening bracket
    const last = out[out.length - 1] || ''
    if (last.length > 0 && !last.endsWith(' ') && !last.endsWith('\n') && !last.endsWith('(') && !last.endsWith('[') && !last.endsWith('{') && !last.endsWith(':') && !last.endsWith('!') && !last.endsWith(',')) {
      out.push(' ')
    }

    out.push(t.value)
  }

  return out.join('').trim()
}

export function compressGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  const out: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'comment' || t.type === 'ws') continue

    // Add space between identifiers/keywords/types/etc
    if (out.length > 0) {
      const prev = tokens[i - 1]
      if (prev && prev.type !== 'ws' && prev.type !== 'comment') {
        const needSpace = (
          (t.type === 'name' || t.type === 'keyword' || t.type === 'type' || t.type === 'boolean' || t.type === 'null' || t.type === 'variable' || t.type === 'argname') &&
          (prev.type === 'name' || prev.type === 'keyword' || prev.type === 'type' || prev.type === 'boolean' || prev.type === 'null' || prev.type === 'variable' || prev.type === 'argname' || prev.type === 'number' || prev.type === 'string' || prev.type === 'blockstring')
        )
        if (needSpace || (t.type === 'spread' && prev.type === 'name') || (t.type === 'name' && prev.type === 'spread')) {
          out.push(' ')
        }
      }
    }

    out.push(t.value)
  }

  return out.join('').trim()
}

export function highlightGraphql(text: string): string {
  const tokens = graphqlTokenize(text)
  let html = ''

  for (const t of tokens) {
    if (t.type === 'ws') {
      html += t.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;')
      continue
    }
    const safe = t.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    html += `<span class="gql-${t.type}">${safe}</span>`
  }

  return html
}

export function unescapeString(text: string): string {
  let result = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const next = text[i + 1]
      switch (next) {
        case '"':  result += '"'; break
        case '\\': result += '\\'; break
        case 'n':  result += '\n'; break
        case 't':  result += '\t'; break
        case 'r':  result += '\r'; break
        case '/':  result += '/'; break
        case 'b':  result += '\b'; break
        case 'f':  result += '\f'; break
        default:   result += '\\' + next; break
      }
      i += 2
    } else {
      result += text[i]; i++
    }
  }
  // Check if result is valid JSON and format it
  try {
    const parsed = JSON.parse(result)
    if (typeof parsed === 'object' && parsed !== null) {
      return JSON.stringify(parsed, null, 2)
    }
  } catch { /* not JSON */ }
  return result
}
