import * as React from 'react'
import classNames from 'classnames'
import { AutocompletingInput, IAutocompletionProvider } from '../autocompletion'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { Dispatcher } from '../dispatcher'
import { isRepositoryWithGitHubRepository, Repository } from '../../models/repository'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { ICommitContext } from '../../models/commit'
import { startTimer } from '../lib/timing'
import { PermissionsCommitWarning } from './permissions-commit-warning'
import { LinkButton } from '../lib/link-button'
import { FoldoutType } from '../../lib/app-state'
import { getAvatarUserFromAuthor, IAvatarUser } from '../../models/avatar'
import { Avatar } from '../lib/avatar'

interface ICommitMessageProps {
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly anyFilesSelected: boolean
  readonly focusCommitMessage: boolean
  readonly commitMessage: ICommitMessage | null
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>
  readonly isCommitting: boolean
  readonly placeholder: string
  readonly prepopulateCommitSummary: boolean
  readonly showBranchProtected: boolean
  readonly showNoWriteAccess: boolean

  /** Whether this component should show its onboarding tutorial nudge arrow */
  readonly shouldNudge: boolean
}

interface ICommitMessageState {
  readonly summary: string
  readonly description: string | null
}

export class CommitMessage extends React.Component<
  ICommitMessageProps,
  ICommitMessageState
> {
  private summaryTextInput: HTMLInputElement | null = null

  public constructor(props: ICommitMessageProps) {
    super(props)

    const { commitMessage } = this.props

    this.state = {
      summary: commitMessage ? commitMessage.summary : '',
      description: commitMessage ? commitMessage.description : null,
    }
  }

  public componentWillUnmount() {
    // We're unmounting, likely due to the user switching to the history tab.
    // Let's persist our commit message in the dispatcher.
    this.props.dispatcher.setCommitMessage(this.props.repository, {
      summary: this.state.summary,
      description: this.state.description,
    })
  }

  /**
   * Special case for the summary/description being reset (empty) after a commit
   * and the commit state changing thereafter, needing a sync with incoming props.
   * We prefer the current UI state values if the user updated them manually.
   *
   * NOTE: although using the lifecycle method is generally an anti-pattern, we
   * (and the React docs) believe it to be the right answer for this situation, see:
   * https://reactjs.org/docs/react-component.html#unsafe_componentwillreceiveprops
   */
  public componentWillReceiveProps(nextProps: ICommitMessageProps) {
    const { commitMessage } = nextProps
    if (!commitMessage || commitMessage === this.props.commitMessage) {
      return
    }

    if (this.state.summary === '' && !this.state.description) {
      this.setState({
        summary: commitMessage.summary,
        description: commitMessage.description,
      })
    }
  }

  public componentDidUpdate(prevProps: ICommitMessageProps) {
    if (this.props.focusCommitMessage) {
      this.focusSummary()
    }
  }

  private clearCommitMessage() {
    this.setState({ summary: '', description: null })
  }

  private focusSummary() {
    if (this.summaryTextInput !== null) {
      this.summaryTextInput.focus()
      this.props.dispatcher.setCommitMessageFocus(false)
    }
  }

  private onSummaryChanged = (summary: string) => {
    this.setState({ summary })
  }

  private onSubmit = () => {
    this.createCommit()
  }

  private async createCommit() {
    const { summary, description } = this.state

    if (!this.canCommit()) {
      return
    }

    const summaryOrPlaceholder =
      this.props.prepopulateCommitSummary && !this.state.summary
        ? this.props.placeholder
        : summary

    const commitContext = {
      summary: summaryOrPlaceholder,
      description,
    }

    const timer = startTimer('create commit', this.props.repository)
    const commitCreated = await this.props.onCreateCommit(commitContext)
    timer.done()

    if (commitCreated) {
      this.clearCommitMessage()
    }
  }

  private canCommit(): boolean {
    return (
      (this.props.anyFilesSelected && this.state.summary.length > 0) ||
      this.props.prepopulateCommitSummary
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<Element>) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (isShortcutKey && event.key === 'Enter' && this.canCommit()) {
      this.createCommit()
      event.preventDefault()
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    if (event.defaultPrevented) {
      return
    }
    event.preventDefault()
    showContextualMenu([])
  }

  private onAutocompletingInputContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const items: IMenuItem[] = [
      { type: 'separator' },
      { role: 'editMenu' },
    ]

    showContextualMenu(items)
  }

  private onSummaryInputRef = (elem: HTMLInputElement | null) => {
    this.summaryTextInput = elem
  }

  private renderPermissionsCommitWarning() {
    const {
      showBranchProtected,
      showNoWriteAccess,
      repository,
      branch,
    } = this.props

    if (showNoWriteAccess) {
      return (
        <PermissionsCommitWarning>
          You don't have write access to <strong>{repository.name}</strong>.
          Want to{' '}
          <LinkButton onClick={this.onMakeFork}>create a fork</LinkButton>?
        </PermissionsCommitWarning>
      )
    } else if (showBranchProtected) {
      if (branch === null) {
        // If the branch is null that means we haven't loaded the tip yet or
        // we're on a detached head. We shouldn't ever end up here with
        // showBranchProtected being true without a branch but who knows
        // what fun and exiting edge cases the future might hold
        return null
      }

      return (
        <PermissionsCommitWarning>
          <strong>{branch}</strong> is a protected branch. Want to{' '}
          <LinkButton onClick={this.onSwitchBranch}>switch branches</LinkButton>
          ?
        </PermissionsCommitWarning>
      )
    } else {
      return null
    }
  }

  private onSwitchBranch = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Branch,
    })
  }

  private onMakeFork = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      this.props.dispatcher.showCreateForkDialog(this.props.repository)
    }
  }

  private renderAvatar() {
    const { commitAuthor, repository } = this.props
    const { gitHubRepository } = repository
    const avatarTitle = commitAuthor
      ? `Committing as ${commitAuthor.name} <${commitAuthor.email}>`
      : undefined
    const avatarUser: IAvatarUser | undefined =
      commitAuthor !== null
        ? getAvatarUserFromAuthor(commitAuthor, gitHubRepository)
        : undefined

    return <Avatar user={avatarUser} title={avatarTitle} />
  }

  public render() {
    const isSummaryWhiteSpace = this.state.summary.match(/^\s+$/g)
    const buttonEnabled =
      this.canCommit() && !this.props.isCommitting && !isSummaryWhiteSpace

    const loading = this.props.isCommitting ? <Loading /> : undefined

    const summaryInputClassName = classNames('summary-field', 'nudge-arrow', {
      'nudge-arrow-left': this.props.shouldNudge,
    })

    const branchName = this.props.branch
    const commitVerb = loading ? 'Committing' : 'Commit'
    const commitTitle =
      branchName !== null ? `${commitVerb} to ${branchName}` : commitVerb
    const commitButtonContents =
      branchName !== null ? (
        <>
          {commitVerb} to <strong>{branchName}</strong>
        </>
      ) : (
        commitVerb
      )

    return (
      <div
        id="commit-message"
        role="group"
        aria-label="Create commit"
        onContextMenu={this.onContextMenu}
        onKeyDown={this.onKeyDown}
      >
        <div className="summary">
          {this.renderAvatar()}

          <AutocompletingInput
            isRequired={true}
            className={summaryInputClassName}
            placeholder={this.props.placeholder}
            value={this.state.summary}
            onValueChanged={this.onSummaryChanged}
            onElementRef={this.onSummaryInputRef}
            autocompletionProviders={this.props.autocompletionProviders}
            onContextMenu={this.onAutocompletingInputContextMenu}
            disabled={this.props.isCommitting}
          />
        </div>

        {this.renderPermissionsCommitWarning()}

        <Button
          type="submit"
          className="commit-button"
          onClick={this.onSubmit}
          disabled={!buttonEnabled}
        >
          {loading}
          <span title={commitTitle}>{commitButtonContents}</span>
        </Button>
      </div>
    )
  }
}
