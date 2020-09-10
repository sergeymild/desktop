import * as React from 'react'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { FoldoutType, RebaseConflictState } from '../../lib/app-state'
import { WorkingDirectoryStatus } from '../../models/status'
import { isRepositoryWithGitHubRepository, Repository } from '../../models/repository'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { DiffSelectionType } from '../../models/diff'
import { hasWritePermission } from '../../models/github-repository'
import { getIncludeAllValue } from '../changes/changes-list'
import { dispatcher } from '../index'
import { Commit, ICommitContext } from '../../models/commit'
import { getLargeFilePaths } from '../../lib/large-files'
import { filesNotTrackedByLFS } from '../../lib/git/lfs'
import { PopupType } from '../../models/popup'
import { hasUnresolvedConflicts, isConflictedFile } from '../../lib/status'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import { AutocompletingInput } from '../autocompletion'
import { startTimer } from '../lib/timing'
import { PermissionsCommitWarning } from '../changes/permissions-commit-warning'
import { LinkButton } from '../lib/link-button'
import { getAvatarUserFromAuthor, IAvatarUser } from '../../models/avatar'
import { Avatar } from '../lib/avatar'
import classNames from 'classnames'

interface IProps {
  readonly onDismissed: () => void
  readonly rebaseConflictState: RebaseConflictState | null
  readonly workingDirectory: WorkingDirectoryStatus
  readonly repository: Repository
  readonly isCommitting: boolean
  readonly currentBranchProtected: boolean
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly commitMessage: ICommitMessage
  readonly focusCommitMessage: boolean
  readonly mostRecentLocalCommit: Commit | null
  readonly lastCommit: Commit | null
}

interface IState {
  readonly summary: string
  readonly description: string | null
  readonly amend: CheckboxValue
  readonly isInputEnabled: boolean
}

export class CommitMessagePopup extends React.Component<IProps, IState> {
  private summaryTextInput: HTMLInputElement | null = null
  public constructor(props: IProps) {
    super(props)

    const { commitMessage } = this.props

    this.state = {
      summary: commitMessage ? commitMessage.summary : '',
      description: commitMessage ? commitMessage.description : null,
      amend: CheckboxValue.Off,
      isInputEnabled: true,
    }
  }

  public componentDidMount() {
    this.focusSummary()
  }

  private onSummaryInputRef = (elem: HTMLInputElement | null) => {
    this.summaryTextInput = elem
  }

  private focusSummary() {
    if (this.summaryTextInput !== null) {
      this.summaryTextInput.focus()
      dispatcher.setCommitMessageFocus(false)
    }
  }

  private onSummaryChanged = (summary: string) => {
    this.setState({ summary })
  }

  private canCommit(): boolean {
    return this.anyFilesSelected() && this.state.summary.length > 0
  }

  private onKeyDown = (event: React.KeyboardEvent<Element>) => {
    if (event.defaultPrevented) {
      return
    }

    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    if (isShortcutKey && event.key === 'Enter') {
      this.onCreateCommit()
      event.preventDefault()
    }
  }


  private onCreateCommit = async (
  ): Promise<void> => {
    if (!this.canCommit()) { return }

    const timer = startTimer('create commit', this.props.repository)

    const { workingDirectory } = this.props

    const overSizedFiles = await getLargeFilePaths(
      this.props.repository,
      workingDirectory,
      100
    )
    const filesIgnoredByLFS = await filesNotTrackedByLFS(
      this.props.repository,
      overSizedFiles
    )

    const context: ICommitContext = {
      amend: this.state.amend === CheckboxValue.On,
      description: this.state.description,
      summary: this.state.summary
    }

    if (filesIgnoredByLFS.length !== 0) {
      dispatcher.showPopup({
        type: PopupType.OversizedFiles,
        oversizedFiles: filesIgnoredByLFS,
        context: context,
        repository: this.props.repository,
      })

      return
    }

    // are any conflicted files left?
    const conflictedFilesLeft = workingDirectory.files.filter(
      f =>
        isConflictedFile(f.status) &&
        f.selection.getSelectionType() === DiffSelectionType.None
    )

    if (conflictedFilesLeft.length === 0) {
      dispatcher.clearBanner()
    }

    // which of the files selected for committing are conflicted (with markers)?
    const conflictedFilesSelected = workingDirectory.files.filter(
      f =>
        isConflictedFile(f.status) &&
        hasUnresolvedConflicts(f.status) &&
        f.selection.getSelectionType() !== DiffSelectionType.None
    )

    if (conflictedFilesSelected.length > 0) {
      return dispatcher.showPopup({
        type: PopupType.CommitConflictsWarning,
        files: conflictedFilesSelected,
        repository: this.props.repository,
        context,
      })
    }

    const commitCreated = dispatcher.commitIncludedChanges(this.props.repository, context)
    timer.done()

    if (commitCreated) {
      dispatcher.closePopup(PopupType.Commit)
    }
  }

  private anyFilesSelected = (): boolean => {
    const fileCount = this.props.workingDirectory.files.length
    const includeAllValue = getIncludeAllValue(
      this.props.workingDirectory,
      this.props.rebaseConflictState,
    )

    return fileCount > 0 && includeAllValue !== CheckboxValue.Off
  }

  private renderPermissionsCommitWarning() {
    const {
      repository,
      branch,
    } = this.props

    // if this is not a github repo, we don't want to
    // restrict what the user can do at all
    const hasWritePermissionForRepository =
      this.props.repository.gitHubRepository === null ||
      hasWritePermission(this.props.repository.gitHubRepository)

    const fileCount = this.props.workingDirectory.files.length
    const showBranchProtected = fileCount > 0 && this.props.currentBranchProtected

    if (!hasWritePermissionForRepository) {
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
    }

    return null
  }

  private onSwitchBranch = () => {
    dispatcher.showFoldout({
      type: FoldoutType.Branch,
    })
  }

  private onMakeFork = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      dispatcher.showCreateForkDialog(this.props.repository)
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

  private onAmendChange = (event: React.FormEvent<HTMLInputElement>) => {
    const amend = this.state.amend === CheckboxValue.Off
      ? CheckboxValue.On
      : CheckboxValue.Off
    let summary: string
    if (amend === CheckboxValue.On) {
      summary = this.props.lastCommit?.summary || ''
    } else {
      summary = this.state.summary
    }
    this.setState({
      summary: summary,
      isInputEnabled: amend === CheckboxValue.Off,
      amend,
    })
  }

  public render() {
    const commitVerb = this.props.isCommitting ? 'Committing' : 'Commit'
    const commitTitle =
      this.props.branch !== null ? `${commitVerb} to ${this.props.branch}` : commitVerb

    const summaryInputClassName = classNames('summary-field', 'nudge-arrow')

    return <Dialog
      id="commit-message"
      title="Type message to commit"
      onSubmit={this.onCreateCommit}
      onDismissed={this.props.onDismissed}
    >
      <DialogContent>
        <div
          id="commit-message"
          role="group"
          aria-label="Create commit"
          onKeyDown={this.onKeyDown}
        >
          <div className="summary">
            {this.renderAvatar()}

            <AutocompletingInput
              isRequired={true}
              className={summaryInputClassName}
              placeholder="Summary (required)"
              value={this.state.summary}
              onValueChanged={this.onSummaryChanged}
              onElementRef={this.onSummaryInputRef}
              autocompletionProviders={[]}
              disabled={this.props.isCommitting || !this.state.isInputEnabled}
            />
          </div>
          {this.props.lastCommit && <Checkbox
            value={this.state.amend}
            label="Amend"
            onChange={this.onAmendChange}
          />}

          {this.renderPermissionsCommitWarning()}
        </div>
      </DialogContent>
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={commitTitle}/>
      </DialogFooter>
    </Dialog>
  }
}