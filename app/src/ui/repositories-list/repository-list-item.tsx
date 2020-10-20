import * as React from 'react'
import { Repository } from '../../models/repository'
import { Octicon, iconForRepository, OcticonSymbol } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { Repositoryish } from './group-repositories'
import { IMenuItem } from '../../lib/menu-item'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAheadBehind } from '../../models/branch'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
} from '../lib/context-menu'
import { shell } from '../../lib/app-shell'
import { dispatcher } from '../index'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The label for the user's preferred shell. */
  readonly shellLabel: string

  /** The characters in the repository name to highlight */
  readonly matches: IMatches

  /** Number of commits this local repo branch is behind or ahead of its remote branch */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes */
  readonly changedFilesCount: number
}

/** A repository item. */
export class RepositoryListItem extends React.Component<
  IRepositoryListItemProps,
  {}
> {
  public render() {
    const repository = this.props.repository
    const path = repository.path
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const hasChanges = this.props.changedFilesCount > 0

    const repoTooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + path
      : path

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    return (
      <div
        onContextMenu={this.onContextMenu}
        className="repository-list-item"
        title={repoTooltip}
      >
        <Octicon
          className="icon-for-repository"
          symbol={iconForRepository(repository)}
        />
        <div className="name">
          {prefix ? <span className="prefix">{prefix}</span> : null}
          <HighlightText
            text={repository.name}
            highlight={this.props.matches.title}
          />
        </div>

        {repository instanceof Repository &&
          renderRepoIndicators({
            aheadBehind: this.props.aheadBehind,
            hasChanges: hasChanges,
          })}
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.id !== this.props.repository.id ||
        nextProps.matches !== this.props.matches
      )
    } else {
      return true
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const repository = this.props.repository
    const missing = repository instanceof Repository && repository.missing
    const openInExternalEditor = this.props.externalEditorLabel
      ? `Open in ${this.props.externalEditorLabel}`
      : DefaultEditorLabel

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: `Open in ${this.props.shellLabel}`,
        action: this.openInShell,
        enabled: !missing,
      },
      {
        label: RevealInFileManagerLabel,
        action: this.showRepository,
        enabled: !missing,
      },
      {
        label: openInExternalEditor,
        action: this.openInExternalEditor,
        enabled: !missing,
      },
      { type: 'separator' },
      {
        label: this.props.askForConfirmationOnRemoveRepository
          ? 'Remove…'
          : 'Remove',
        action: this.removeRepository,
      },
    ]
    showContextualMenu(items)
  }

  private removeRepository = () => {
    dispatcher.removeRepository(this.props.repository)
  }

  private showRepository = () => {
    shell.showFolderContents(this.props.repository.path)
  }

  private openInShell = () => {
    dispatcher.openShell(this.props.repository.path)
  }

  private openInExternalEditor = () => {
    dispatcher.openInExternalEditor(this.props.repository.path)
  }
}

const renderRepoIndicators: React.FunctionComponent<{
  aheadBehind: IAheadBehind | null
  hasChanges: boolean
}> = props => {
  return (
    <div className="repo-indicators">
      {props.aheadBehind && renderAheadBehindIndicator(props.aheadBehind)}
      {props.hasChanges && renderChangesIndicator()}
    </div>
  )
}

const renderAheadBehindIndicator = (aheadBehind: IAheadBehind) => {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0) {
    return null
  }

  const aheadBehindTooltip =
    'The currently checked out branch is' +
    (behind ? ` ${commitGrammar(behind)} behind ` : '') +
    (behind && ahead ? 'and' : '') +
    (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
    'its tracked branch.'

  return (
    <div className="ahead-behind" title={aheadBehindTooltip}>
      {ahead > 0 && <Octicon symbol={OcticonSymbol.arrowUp} />}
      {behind > 0 && <Octicon symbol={OcticonSymbol.arrowDown} />}
    </div>
  )
}

const renderChangesIndicator = () => {
  return (
    <div
      className="change-indicator-wrapper"
      title="There are uncommitted changes in this repository"
    >
      <Octicon symbol={OcticonSymbol.dotFill} />
    </div>
  )
}

const commitGrammar = (commitNum: number) =>
  `${commitNum} commit${commitNum > 1 ? 's' : ''}` // english is hard
