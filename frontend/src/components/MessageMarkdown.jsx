import React from 'react'

const LINK_PATTERN = /^https?:\/\/[^\s]+$/i
const INLINE_PATTERN = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/gi

const trimTrailingUrlPunctuation = (value) => {
  const match = value.match(/^(.+?)([.,!?;:)]+)?$/)
  return {
    url: match?.[1] || value,
    suffix: match?.[2] || '',
  }
}

const renderInline = (text, keyPrefix) => {
  const parts = []
  let lastIndex = 0

  text.replace(INLINE_PATTERN, (match, _unused, offset) => {
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset))
    }

    if (match.startsWith('[')) {
      const linkMatch = match.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i)
      if (linkMatch) {
        parts.push(
          <a key={`${keyPrefix}-link-${offset}`} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>,
        )
      } else {
        parts.push(match)
      }
    } else if (LINK_PATTERN.test(match)) {
      const { url, suffix } = trimTrailingUrlPunctuation(match)
      parts.push(
        <React.Fragment key={`${keyPrefix}-url-${offset}`}>
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
          {suffix}
        </React.Fragment>,
      )
    } else if ((match.startsWith('**') && match.endsWith('**')) || (match.startsWith('__') && match.endsWith('__'))) {
      parts.push(<strong key={`${keyPrefix}-strong-${offset}`}>{match.slice(2, -2)}</strong>)
    } else if (match.startsWith('`') && match.endsWith('`')) {
      parts.push(<code key={`${keyPrefix}-code-${offset}`}>{match.slice(1, -1)}</code>)
    } else {
      parts.push(match)
    }

    lastIndex = offset + match.length
    return match
  })

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

const renderTextWithBreaks = (text, keyPrefix) =>
  text.split('\n').flatMap((line, index, lines) => {
    const nodes = renderInline(line, `${keyPrefix}-${index}`)
    if (index < lines.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />)
    }
    return nodes
  })

const parseBlocks = (content) => {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const heading = lines[index].match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (/^>\s?/.test(lines[index])) {
      const items = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        items.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: items.join('\n') })
      continue
    }

    if (/^\s*[-*]\s+/.test(lines[index])) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(lines[index])) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const paragraph = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
  }

  return blocks
}

export default function MessageMarkdown({ children }) {
  const blocks = parseBlocks(children)

  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.5,
      }}
    >
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const fontSize = block.level === 1 ? 16 : block.level === 2 ? 15 : 14
          return (
            <div key={index} style={{ fontWeight: 700, fontSize, lineHeight: 1.35 }}>
              {renderInline(block.text, `h-${index}`)}
            </div>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={index}
              style={{
                margin: 0,
                padding: '2px 0 2px 10px',
                borderLeft: '3px solid currentColor',
                opacity: 0.82,
              }}
            >
              {renderTextWithBreaks(block.text, `q-${index}`)}
            </blockquote>
          )
        }

        if (block.type === 'ul' || block.type === 'ol') {
          const ListTag = block.type
          return (
            <ListTag key={index} style={{ margin: 0, paddingLeft: 18 }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, `${block.type}-${index}-${itemIndex}`)}</li>
              ))}
            </ListTag>
          )
        }

        return <div key={index}>{renderTextWithBreaks(block.text, `p-${index}`)}</div>
      })}
    </div>
  )
}
