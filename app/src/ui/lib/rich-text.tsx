import * as React from 'react'

import { LinkButton } from './link-button'
import { Repository } from '../../models/repository'
import { Tokenizer, TokenType, TokenResult } from '../../lib/text-token-parser'
import { assertNever } from '../../lib/fatal-error'
import memoizeOne from 'memoize-one'

interface IRichTextProps {
  readonly className?: string

  /**
   * The raw text to inspect for things to highlight or an array
   * of tokens already compiled by the `Tokenizer` class in
   * `text-token-parser.ts`. If a string is provided the component
   * will call upon the Tokenizer to product a list of tokens.
   */
  readonly text: string | ReadonlyArray<TokenResult>

  /** Should URLs be rendered as clickable links. Default true. */
  readonly renderUrlsAsLinks?: boolean

  /**
   * The repository to use as the source for URLs for the rich text.
   *
   * If not specified, or the repository is a non-GitHub repository,
   * no link highlighting is performed.
   */
  readonly repository?: Repository
}

function getElements(
  repository: Repository | undefined,
  renderUrlsAsLinks: boolean | undefined,
  text: string | ReadonlyArray<TokenResult>
) {
  const tokenizer = new Tokenizer(repository)
  const tokens = typeof text === 'string' ? tokenizer.tokenize(text) : text

  return tokens.map((token, index) => {
    switch (token.kind) {
      case TokenType.Link:
        if (renderUrlsAsLinks !== false) {
          return (
            <LinkButton key={index} uri={token.url} title={token.url}>
              {token.text}
            </LinkButton>
          )
        } else {
          return <span key={index}>{token.text}</span>
        }
      case TokenType.Text:
        return <span key={index}>{token.text}</span>
      default:
        return assertNever(token, `Unknown token type: ${token}`)
    }
  })
}

/**
 * A component which replaces any shortcuts (e.g., :+1:) in its child text
 * with the appropriate image tag, and also highlights username and issue mentions
 * with hyperlink tags if it has a repository to read.
 */
export class RichText extends React.Component<IRichTextProps, {}> {
  private getElements = memoizeOne(getElements)
  private getTitle = memoizeOne((text: string | ReadonlyArray<TokenResult>) =>
    typeof text === 'string' ? text : text.map(x => x.text).join('')
  )

  public render() {
    const { repository, renderUrlsAsLinks, text } = this.props

    // If we've been given an empty string then return null so that we don't end
    // up introducing an extra empty <span>.
    if (text.length === 0) {
      return null
    }

    return (
      <div className={this.props.className} title={this.getTitle(text)}>
        {this.getElements(repository, renderUrlsAsLinks, text)}
      </div>
    )
  }
}
