import * as React from 'react'
import { Commit } from '../../models/commit'
import { GitHubRepository } from '../../models/github-repository'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { RelativeTime } from '../relative-time'
import { getDotComAPIEndpoint } from '../../lib/api'
import { clipboard } from 'electron'
import { showContextualMenu } from '../main-process-proxy'
import { CommitAttribution } from '../lib/commit-attribution'
import { AvatarStack } from '../lib/avatar-stack'
import { IMenuItem } from '../../lib/menu-item'
import { Octicon, OcticonSymbol } from '../octicons'
import { enableGitTagsCreation, enableGitTagsDisplay } from '../../lib/feature-flag'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { dispatcher } from '../index'
import { PopupType } from '../../models/popup'
import { ResetCommitType } from '../../lib/git'

interface ICommitProps {
  readonly gitHubRepository: GitHubRepository | null
  readonly commit: Commit
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly dispatcher?: Dispatcher
  readonly repository?: Repository
  readonly onRevertCommit?: (commit: Commit) => void
  readonly onViewCommitOnGitHub?: (sha: string) => void
  readonly onCreateTag?: (targetCommitSha: string) => void
  readonly onDeleteTag?: (tagName: string) => void
  readonly showUnpushedIndicator: boolean
  readonly unpushedIndicatorTitle?: string
  readonly unpushedTags?: ReadonlyArray<string>
}

interface ICommitListItemState {
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.PureComponent<
  ICommitProps,
  ICommitListItemState
> {
  public constructor(props: ICommitProps) {
    super(props)

    this.state = {
      avatarUsers: getAvatarUsersForCommit(
        props.gitHubRepository,
        props.commit
      ),
    }
  }

  public componentWillReceiveProps(nextProps: ICommitProps) {
    if (nextProps.commit !== this.props.commit) {
      this.setState({
        avatarUsers: getAvatarUsersForCommit(
          nextProps.gitHubRepository,
          nextProps.commit
        ),
      })
    }
  }

  public render() {
    const commit = this.props.commit
    const {
      author: { date },
    } = commit

    return (
      <div className="commit" onContextMenu={this.onContextMenu}>
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="description">
            <AvatarStack users={this.state.avatarUsers} />
            <div className="byline">
              <CommitAttribution
                gitHubRepository={this.props.gitHubRepository}
                commit={commit}
              />
              {renderRelativeTime(date)}
            </div>
          </div>
        </div>
        {this.renderCommitIndicators()}
      </div>
    )
  }

  private renderCommitIndicators() {
    const tagIndicator = enableGitTagsDisplay()
      ? renderCommitListItemTags(this.props.commit.tags)
      : null

    const unpushedIndicator = this.renderUnpushedIndicator()

    if (tagIndicator || unpushedIndicator) {
      return (
        <div className="commit-indicators">
          {tagIndicator}
          {unpushedIndicator}
        </div>
      )
    }

    return null
  }

  private renderUnpushedIndicator() {
    if (!this.props.showUnpushedIndicator) {
      return null
    }

    return (
      <div
        className="unpushed-indicator"
        title={this.props.unpushedIndicatorTitle}
      >
        <Octicon symbol={OcticonSymbol.arrowUp} />
      </div>
    )
  }

  private onCopySHA = () => {
    clipboard.writeText(this.props.commit.sha)
  }

  private checkoutToCommit = () => {
    const dispatcher = this.props.dispatcher
    const repository = this.props.repository
    if (!dispatcher && !repository) { return }
    dispatcher!.checkoutToCommit(repository!, this.props.commit.sha)
  }

  private resetToCommit = (type: ResetCommitType) => {
    const dispatcher = this.props.dispatcher
    const repository = this.props.repository
    if (!dispatcher && !repository) { return }
    dispatcher!.resetToCommit(repository!, this.props.commit.sha, type)
  }

  private onViewOnGitHub = () => {
    if (this.props.onViewCommitOnGitHub) {
      this.props.onViewCommitOnGitHub(this.props.commit.sha)
    }
  }

  private onCreateTag = () => {
    if (this.props.onCreateTag) {
      this.props.onCreateTag(this.props.commit.sha)
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    let viewOnGitHubLabel = 'View on GitHub'
    const gitHubRepository = this.props.gitHubRepository

    if (
      gitHubRepository &&
      gitHubRepository.endpoint !== getDotComAPIEndpoint()
    ) {
      viewOnGitHubLabel = 'View on GitHub Enterprise'
    }

    const items: IMenuItem[] = []

    items.push(
      {
        label: 'Checkout to this commit',
        action: this.checkoutToCommit,
      }
    )

    items.push({type: 'separator'})

    const repository = this.props.repository
    if (repository !== undefined) {
      items.push({
        label: "Create branch here",
        action: () => {
          dispatcher.showPopup({
            type: PopupType.CreateBranchFromCommit,
            commitSha: this.props.commit.sha,
            repository: repository
          })
        }
      })
    }
    items.push({
      label: 'Revert commit',
      action: () => {
        if (this.props.onRevertCommit) {
          this.props.onRevertCommit(this.props.commit)
        }
      },
      enabled: this.props.onRevertCommit !== undefined,
    })
    items.push(
      {
        label: 'Reset to this commit',
        submenu: [
          {
            label: 'Soft - keep all changes',
            action: () => this.resetToCommit(ResetCommitType.soft),
          },
          {
            label: 'Mixed - keep working copy but reset index',
            action: () => this.resetToCommit(ResetCommitType.mixed),
          },
          {
            label: 'Hard - discard all changes',
            action: () => this.resetToCommit(ResetCommitType.hard),
          }
        ]
      }
    )
    items.push({type: 'separator'})

    if (enableGitTagsCreation()) {

      items.push({
        label: 'Create tag here',
        action: this.onCreateTag,
        enabled: this.props.onCreateTag !== undefined,
      })

      const deleteTagsMenuItem = this.getDeleteTagsMenuItem()
      if (deleteTagsMenuItem !== null) {
        items.push({ type: 'separator' })
        items.push(deleteTagsMenuItem)
      }

    }

    items.push(
      { type: 'separator' },
      {
        label: 'Copy commit id to clipboard',
        action: this.onCopySHA,
      },
      {
        label: viewOnGitHubLabel,
        action: this.onViewOnGitHub,
        enabled: !this.props.isLocal && !!gitHubRepository,
      }
    )

    showContextualMenu(items)
  }

  private getDeleteTagsMenuItem(): IMenuItem | null {
    const { unpushedTags, onDeleteTag, commit } = this.props

    if (
      onDeleteTag === undefined ||
      unpushedTags === undefined ||
      commit.tags.length === 0
    ) {
      return null
    }

    if (commit.tags.length === 1) {
      const tagName = commit.tags[0]

      return {
        label: `Delete tag ${tagName}`,
        action: () => onDeleteTag(tagName),
        enabled: unpushedTags.includes(tagName),
      }
    }

    // Convert tags to a Set to avoid O(n^2)
    const unpushedTagsSet = new Set(unpushedTags)

    return {
      label: 'Delete tag…',
      submenu: commit.tags.map(tagName => {
        return {
          label: tagName,
          action: () => onDeleteTag(tagName),
          enabled: unpushedTagsSet.has(tagName),
        }
      }),
    }
  }
}

function renderRelativeTime(date: Date) {
  return (
    <>
      {` • `}
      <RelativeTime date={date} abbreviate={true} />
    </>
  )
}

function renderCommitListItemTags(tags: ReadonlyArray<string>) {
  if (tags.length === 0) {
    return null
  }
  const [firstTag] = tags
  return (
    <span className="tag-indicator">
      <span className="tag-name" key={firstTag}>
        {firstTag}
      </span>
      {tags.length > 1 && (
        <span key={tags.length} className="tag-indicator-more" />
      )}
    </span>
  )
}
