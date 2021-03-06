import { remote } from 'electron'
import { Disposable, IDisposable } from 'event-kit'

import { IAPIOrganization, IAPIPullRequest, IAPIRepository } from '../../lib/api'
import { shell } from '../../lib/app-shell'
import {
  CompareAction,
  Foldout,
  FoldoutType, HistoryTabMode,
  ICompareFormUpdate,
  isMergeConflictState,
  RebaseConflictState,
  RepositorySectionTab, SelectionType,
} from '../../lib/app-state'
import { ExternalEditor } from '../../lib/editors'
import { assertNever, fatalError } from '../../lib/fatal-error'
import { setGenericPassword, setGenericUsername } from '../../lib/generic-git-auth'
import {
  getBranches,
  getCommitsInRange,
  isGitRepository,
  ITagItem,
  PushOptions,
  RebaseResult,
  ResetCommitType,
} from '../../lib/git'
import { isGitOnPath } from '../../lib/is-git-on-path'
import { rejectOAuthRequest, requestAuthenticatedUser, resolveOAuthRequest } from '../../lib/oauth'
import { IOpenRepositoryFromURLAction, IUnknownAction, URLActionType } from '../../lib/parse-app-url'
import { matchExistingRepository, urlsMatch } from '../../lib/repository-matching'
import { Shell } from '../../lib/shells'
import { AppStore } from '../../lib/stores'
import { validatedRepositoryPath } from '../../lib/stores/helpers/validated-repository-path'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { getTipSha } from '../../lib/tip'
import { initializeNewRebaseFlow, initializeRebaseFlowForConflictedRepository } from '../../lib/rebase'

import { Account } from '../../models/account'
import { AppMenu, ExecutableMenuItem } from '../../models/app-menu'
import { IAuthor } from '../../models/author'
import { Branch } from '../../models/branch'
import { CloneRepositoryTab } from '../../models/clone-repository-tab'
import { CloningRepository } from '../../models/cloning-repository'
import { Commit, CommitOneLine, ICommitContext } from '../../models/commit'
import { ICommitMessage } from '../../models/commit-message'
import { DiffSelection, ImageDiffType, ITextDiff } from '../../models/diff'
import { FetchType } from '../../models/fetch'
import { GitHubRepository } from '../../models/github-repository'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { Popup, PopupType } from '../../models/popup'
import { PullRequest } from '../../models/pull-request'
import {
  getGitHubHtmlUrl,
  isRepositoryWithForkedGitHubRepository,
  isRepositoryWithGitHubRepository,
  Repository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import { CommittedFileChange, WorkingDirectoryFileChange, WorkingDirectoryStatus } from '../../models/status'
import { IValidBranch, TipState } from '../../models/tip'
import { Banner, BannerType } from '../../models/banner'

import { ApplicationTheme } from '../lib/application-theme'
import { installCLI } from '../lib/install-cli'
import { executeMenuItem, showCertificateTrustDialog } from '../main-process-proxy'
import { CommitStatusStore, ICombinedRefCheck, StatusCallBack } from '../../lib/stores/commit-status-store'
import { UncommittedChangesStrategy, UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { RebaseFlowStep, RebaseStep } from '../../models/rebase-flow-step'
import { IStashEntry } from '../../models/stash-entry'
import { WorkflowPreferences } from '../../models/workflow-preferences'
import { enableForkSettings } from '../../lib/feature-flag'
import { resolveWithin } from '../../lib/path'
import { dispatcher } from '../index'

/**
 * An error handler function.
 *
 * If the returned {Promise} returns an error, it will be passed to the next
 * error handler. If it returns null, error propagation is halted.
 */
export type ErrorHandler = (
  error: Error,
  dispatcher: Dispatcher
) => Promise<Error | null>

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private readonly errorHandlers = new Array<ErrorHandler>()

  public constructor(
    private readonly appStore: AppStore,
    private readonly repositoryStateManager: RepositoryStateCache,
    private readonly commitStatusStore: CommitStatusStore
  ) {}

  /** Load the initial state for the app. */
  public loadInitialState(): Promise<void> {
    return this.appStore.loadInitialState()
  }

  /**
   * Add the repositories at the given paths. If a path isn't a repository, then
   * this will post an error to that affect.
   */
  public addRepositories(
    paths: ReadonlyArray<string>
  ): Promise<ReadonlyArray<Repository>> {
    return this.appStore._addRepositories(paths)
  }

  public removeRepository = (
    repository: Repository | CloningRepository | null
  ) => {
    if (!repository) {
      return
    }

    if (repository instanceof CloningRepository || repository.missing) {
      this.removeRepositories([repository], false)
      return
    }

    if (this.appStore.askForConfirmationOnRepositoryRemoval) {
      this.showPopup({
        type: PopupType.RemoveRepository,
        repository,
      })
    } else {
      this.removeRepositories([repository], false)
    }
  }

  public onShowRebaseConflictsBanner = (
    repository: Repository,
    targetBranch: string,
  ) => {
    this.setBanner({
      type: BannerType.RebaseConflictsFound,
      targetBranch,
      onOpenDialog: async () => {
        const { changesState } = this.repositoryStateManager.get(
          repository,
        )
        const { conflictState } = changesState

        if (conflictState === null || conflictState.kind === 'merge') {
          log.debug(`[App.onShowRebasConflictsBanner] no conflict state found, ignoring...`,)
          return
        }

        await this.setRebaseProgressFromState(repository)
        const initialStep = initializeRebaseFlowForConflictedRepository(conflictState)
        this.setRebaseFlowStep(repository, initialStep)
        this.showPopup({
          type: PopupType.RebaseFlow,
          repository,
        })
      },
    })
  }


  /** Remove the repositories represented by the given IDs from local storage. */
  public async removeRepositories(
    repositories: ReadonlyArray<Repository | CloningRepository>,
    moveToTrash: boolean
  ): Promise<void> {
    if (moveToTrash) {
      repositories.forEach(repository => {
        shell.moveItemToTrash(repository.path)
      })
    }

    return this.appStore._removeRepositories(repositories)
  }

  /** Update the repository's `missing` flag. */
  public async updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    return this.appStore._updateRepositoryMissing(repository, missing)
  }

  /** Load the next batch of history for the repository. */
  public loadNextCommitBatch(repository: Repository): Promise<void> {
    return this.appStore._loadNextCommitBatch(repository)
  }

  /** Load the next batch of history for the repository. */
  public searchCommits(repository: Repository, query: string): Promise<void> {
    return this.appStore._searchCommits(repository, query)
  }

  /** Load the changed files for the current history selection. */
  public loadChangedFilesForCurrentSelection(
    repository: Repository
  ): Promise<void> {
    return this.appStore._loadChangedFilesForCurrentSelection(repository)
  }

  /**
   * Change the selected commit in the history view.
   *
   * @param repository The currently active repository instance
   *
   * @param sha The object id of one of the commits currently
   *            the history list, represented as a SHA-1 hash
   *            digest. This should match exactly that of Commit.Sha
   */
  public changeCommitSelection(
    repository: Repository,
    sha: string
  ): Promise<void> {
    return this.appStore._changeCommitSelection(repository, sha)
  }

  /**
   * Change the selected changed file in the history view.
   *
   * @param repository The currently active repository instance
   *
   * @param file A FileChange instance among those available in
   *            IHistoryState.changedFiles
   */
  public changeFileSelection(
    repository: Repository,
    file: CommittedFileChange
  ): Promise<void> {
    return this.appStore._changeFileSelection(repository, file)
  }

  /** Set the repository filter text. */
  public setRepositoryFilterText(text: string): Promise<void> {
    return this.appStore._setRepositoryFilterText(text)
  }

  /** Select the repository. */
  public selectRepository(
    repository: Repository | CloningRepository
  ): Promise<Repository | null> {
    return this.appStore._selectRepository(repository)
  }

  /** Change the selected section in the repository. */
  public changeRepositorySection(
    repository: Repository,
    section: RepositorySectionTab
  ): Promise<void> {
    return this.appStore._changeRepositorySection(repository, section)
  }

  /**
   * Changes the selection in the changes view to the working directory and
   * optionally selects one or more files from the working directory.
   *
   *  @param files An array of files to select when showing the working directory.
   *               If undefined this method will preserve the previously selected
   *               files or pick the first changed file if no selection exists.
   */
  public selectWorkingDirectoryFiles(
    repository: Repository,
    selectedFiles?: WorkingDirectoryFileChange[]
  ): Promise<void> {
    return this.appStore._selectWorkingDirectoryFiles(repository, selectedFiles)
  }

  public updateUnifiedCount(newCount: number) {

    this.appStore.updateUnifiedCount(newCount)
  }

  /**
   * Commit the changes which were marked for inclusion, using the given commit
   * summary and description and optionally any number of commit message trailers
   * which will be merged into the final commit message.
   */
  public async commitIncludedChanges(
    repository: Repository,
    context: ICommitContext
  ): Promise<boolean> {
    return this.appStore._commitIncludedChanges(repository, context)
  }

  /** Change the file's includedness. */
  public changeFileIncluded(
    repository: Repository,
    file: WorkingDirectoryFileChange,
    include: boolean
  ): Promise<void> {
    return this.appStore._changeFileIncluded(repository, file, include)
  }

  /** Change the file's line selection state. */
  public changeFileLineSelection(
    repository: Repository,
    fileId: string,
    diffSelection: DiffSelection
  ): Promise<void> {
    return this.appStore._changeFileLineSelection(
      repository,
      fileId,
      diffSelection
    )
  }

  /** Change the Include All state. */
  public changeIncludeAllFiles(
    repository: Repository,
    includeAll: boolean
  ): Promise<void> {
    return this.appStore._changeIncludeAllFiles(repository, includeAll)
  }

  /**
   * Refresh the repository. This would be used, e.g., when the app gains focus.
   */
  public refreshRepository(repository: Repository): Promise<void> {
    return this.appStore._refreshOrRecoverRepository(repository)
  }

  /** Show the popup. This will close any current popup. */
  public showPopup(popup: Popup): Promise<void> {
    return this.appStore._showPopup(popup)
  }

  /**
   * Close the current popup, if found
   *
   * @param popupType only close the popup if it matches this `PopupType`
   */
  public closePopup(popupType?: PopupType) {
    return this.appStore._closePopup(popupType)
  }

  /** Show the foldout. This will close any current popup. */
  public showFoldout(foldout: Foldout): Promise<void> {
    return this.appStore._showFoldout(foldout)
  }

  /** Close the current foldout. If opening a new foldout use closeFoldout instead. */
  public closeCurrentFoldout(): Promise<void> {
    return this.appStore._closeCurrentFoldout()
  }

  /** Close the specified foldout */
  public closeFoldout(foldout: FoldoutType): Promise<void> {
    return this.appStore._closeFoldout(foldout)
  }

  /** Check for remote commits that could affect the rebase operation */
  private async warnAboutRemoteCommits(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch
  ): Promise<boolean> {
    if (targetBranch.upstream === null) {
      return false
    }

    // if the branch is tracking a remote branch
    const upstreamBranchesMatching = await getBranches(
      repository,
      `refs/remotes/${targetBranch.upstream}`
    )

    if (upstreamBranchesMatching.length === 0) {
      return false
    }

    // and the remote branch has commits that don't exist on the base branch
    const remoteCommits = await getCommitsInRange(
      repository,
      baseBranch.tip.sha,
      targetBranch.upstream
    )

    return remoteCommits !== null && remoteCommits.length > 0
  }

  /** Initialize and start the rebase operation */
  public async startRebase(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch,
    commits: ReadonlyArray<CommitOneLine>,
    options?: { continueWithForcePush: boolean }
  ): Promise<void> {
    const { askForConfirmationOnForcePush } = this.appStore.getState()

    const hasOverridenForcePushCheck =
      options !== undefined && options.continueWithForcePush

    if (askForConfirmationOnForcePush && !hasOverridenForcePushCheck) {
      const showWarning = await this.warnAboutRemoteCommits(
        repository,
        baseBranch,
        targetBranch
      )

      if (showWarning) {
        this.setRebaseFlowStep(repository, {
          kind: RebaseStep.WarnForcePush,
          baseBranch,
          targetBranch,
          commits,
        })
        return
      }
    }

    this.initializeRebaseProgress(repository, commits)

    const startRebaseAction = () => {
      return this.rebase(repository, baseBranch, targetBranch)
    }

    this.setRebaseFlowStep(repository, {
      kind: RebaseStep.ShowProgress,
      rebaseAction: startRebaseAction,
    })
  }

  /**
   * Initialize and launch the rebase flow for a conflicted repository
   */
  public async launchRebaseFlow(repository: Repository, targetBranch: string) {
    await this.appStore._loadStatus(repository)

    const repositoryState = this.repositoryStateManager.get(repository)
    const { conflictState } = repositoryState.changesState

    if (conflictState === null || conflictState.kind === 'merge') {
      return
    }

    const updatedConflictState = {
      ...conflictState,
      targetBranch,
    }

    this.repositoryStateManager.updateChangesState(repository, () => ({
      conflictState: updatedConflictState,
    }))

    await this.setRebaseProgressFromState(repository)

    const initialStep = initializeRebaseFlowForConflictedRepository(
      updatedConflictState
    )

    this.setRebaseFlowStep(repository, initialStep)

    this.showPopup({
      type: PopupType.RebaseFlow,
      repository,
    })
  }

  /**
   * Create a new branch from the given starting point and check it out.
   *
   * If the startPoint argument is omitted the new branch will be created based
   * off of the current state of HEAD.
   */
  public createBranch(
    repository: Repository,
    name: string,
    startPoint: string | null,
    uncommittedChangesStrategy?: UncommittedChangesStrategy,
    noTrackOption: boolean = false
  ): Promise<Repository> {
    return this.appStore._createBranch(
      repository,
      name,
      startPoint,
      uncommittedChangesStrategy,
      noTrackOption
    )
  }

  /**
   * Create a new tag on the given target commit.
   */
  public createTag(
    repository: Repository,
    name: string,
    message: string | null,
    targetCommitSha: string
  ): Promise<void> {
    return this.appStore._createTag(
      repository,
      name,
      message,
      targetCommitSha
    )
  }

  /**
   * Deletes the passed tag.
   */
  public deleteTag(
    repository: Repository,
    name: string,
    remote: boolean
  ): Promise<void> {
    return this.appStore._deleteTag(repository, name, remote)
  }

  /**
   * Show the tag creation dialog.
   */
  public showCreateTagDialog(
    repository: Repository,
    targetCommitSha: string,
    localTags: ReadonlyArray<ITagItem> | null,
    initialName?: string
  ): Promise<void> {
    return this.showPopup({
      type: PopupType.CreateTag,
      repository,
      targetCommitSha,
      initialName,
      localTags,
    })
  }

  /**
   * Show the confirmation dialog to delete a tag.
   */
  public showDeleteTagDialog(
    repository: Repository,
    tagName: string
  ): Promise<void> {
    return this.showPopup({
      type: PopupType.DeleteTag,
      repository,
      tagName,
    })
  }

  public checkoutToCommit(
    repository: Repository,
    commitSha: string
  ) {
    this.appStore._checkoutToCommit(repository, commitSha)
  }

  public resetToCommit(
    repository: Repository,
    commitSha: string,
    type: ResetCommitType
  ) {
    this.appStore._resetToCommit(repository, commitSha, type)
  }

  public checkoutToTag(
    repository: Repository,
    tagName: string
  ) {
    this.appStore._checkoutToTag(repository, tagName)
  }

  public async discardAndCheckout(
    repository: Repository,
    tagName: string
  ) {
    this.closePopup()
    this.appStore._discardAndCheckout(repository, tagName)
  }

  public async stashAndCheckout(
    repository: Repository,
    tagName: string
  ) {
    this.closePopup()
    this.appStore._stashAndCheckout(repository, tagName)
  }

  /** Check out the given branch. */
  public checkoutBranch(
    repository: Repository,
    branch: Branch,
    uncommittedChangesStrategy?: UncommittedChangesStrategy
  ): Promise<Repository> {
    return this.appStore._checkoutBranch(
      repository,
      branch,
      uncommittedChangesStrategy
    )
  }

  public pushRepository(repository: Repository) {
    this.appStore._push(repository)
  }

  /** Push the current branch. */
  public push(options?: { forceWithLease: boolean }) {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return

    if (options && options.forceWithLease) {
      this.confirmOrForcePush(state.repository)
    } else {
      this.appStore._push(state.repository)
    }
  }

  private pushWithOptions(repository: Repository, options?: PushOptions) {
    if (options !== undefined && options.forceWithLease) {
      this.dropCurrentBranchFromForcePushList(repository)
    }

    return this.appStore._push(repository, options)
  }

  public pullRepository(repository: Repository) {
    return this.appStore._pull(repository)
  }

  /** Pull the current branch. */
  public pull(): Promise<void> {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return Promise.resolve()
    }

    return this.appStore._pull(state.repository)
  }

  public async showChanges() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    await this.closeCurrentFoldout()
    return this.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Changes
    )
  }

  public async showStashes() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    await this.closeCurrentFoldout()
    return this.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Stash
    )
  }

  public async showHistory(showBranchList: boolean = false) {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    await this.closeCurrentFoldout()
    await this.initializeCompare(state.repository, {
      kind: HistoryTabMode.History,
    })

    await this.changeRepositorySection(
      state.repository,
      RepositorySectionTab.History
    )

    await this.updateCompareForm(state.repository, {
      filterText: '',
      showBranchList,
    })
  }

  public chooseRepository() {
    if (
      this.appStore.currentFoldout &&
      this.appStore.currentFoldout.type === FoldoutType.Repository
    ) {
      return this.closeFoldout(FoldoutType.Repository)
    }

    return this.showFoldout({ type: FoldoutType.Repository })
  }

  public showCreateBranch = () => {
    const state = this.appStore.getSelectedState()
    if (!state || state.type !== SelectionType.Repository) return

    // We explicitly disable the menu item in this scenario so this
    // should never happen.
    if (state.state.branchesState.tip.kind === TipState.Unknown) return

    const repository = state.repository

    const manager = this.repositoryStateManager.get(repository)
    const currentBranchProtected = manager.changesState.currentBranchProtected

    return this.showPopup({
      type: PopupType.CreateBranch,
      repository,
      currentBranchProtected,
    })
  }

  public showBranches() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (
      this.appStore.currentFoldout &&
      this.appStore.currentFoldout.type === FoldoutType.Branch
    ) {
      return this.closeFoldout(FoldoutType.Branch)
    }

    return this.showFoldout({ type: FoldoutType.Branch })
  }

  public showTags() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (
      this.appStore.currentFoldout &&
      this.appStore.currentFoldout.type === FoldoutType.Tags
    ) {
      return this.closeFoldout(FoldoutType.Tags)
    }

    return this.showFoldout({ type: FoldoutType.Tags })
  }

  public removeCurrentRepository(): any {
    const state = this.appStore.getSelectedState()
    if (state == null) return null
    if (!state.repository) return

    if (state.repository instanceof CloningRepository || state.repository.missing) {
      this.removeRepositories([state.repository], false)
      return
    }

    if (this.appStore.askForConfirmationOnRepositoryRemoval) {
      this.showPopup({
        type: PopupType.RemoveRepository,
        repository: state.repository,
      })
    } else {
      this.removeRepositories([state.repository], false)
    }
  }

  public renameDialogBranch() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip
    if (tip.kind === TipState.Valid) {
      this.showPopup({
        type: PopupType.RenameBranch,
        repository: state.repository,
        branch: tip.branch,
      })
    }
  }

  public deleteDialogBranch() {
    const state = this.appStore.getSelectedState()
    if (state === null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip

    if (tip.kind === TipState.Valid) {
      const currentPullRequest = state.state.branchesState.currentPullRequest
      if (currentPullRequest !== null) {
        this.showPopup({
          type: PopupType.DeletePullRequest,
          repository: state.repository,
          branch: tip.branch,
          pullRequest: currentPullRequest,
        })
      } else {
        const existsOnRemote = state.state.aheadBehind !== null

        this.showPopup({
          type: PopupType.DeleteBranch,
          repository: state.repository,
          branch: tip.branch,
          existsOnRemote: existsOnRemote,
        })
      }
    }
  }

  public discardAllChanges() {
    const state = this.appStore.getSelectedState()

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const { workingDirectory } = state.state.changesState

    this.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: state.repository,
      files: workingDirectory.files,
      showDiscardChangesSetting: false,
      discardingAllChanges: true,
    })
  }

  public openCurrentRepositoryWorkingDirectory() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    shell.showFolderContents(state.repository.path)
  }

  public updateBranch() {
    const selectedState = this.appStore.getSelectedState()
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return
    }

    const { state } = selectedState
    const defaultBranch = state.branchesState.defaultBranch
    if (!defaultBranch) {
      return
    }

    this.mergeBranch(
      selectedState.repository,
      defaultBranch.name,
    )
  }

  public commitMessageDialog() {
    const repository = this.appStore.getSelectedState()?.repository
    if (!repository || repository instanceof CloningRepository) return
    return dispatcher.showPopup({
      type: PopupType.Commit,
      repository
    })
  }

  public mergeBranchDialog() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.showPopup({
      type: PopupType.MergeBranch,
      repository: state.repository,
    })
  }

  public showRebaseDialog() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    const repositoryState = this.repositoryStateManager.get(repository)

    const initialStep = initializeNewRebaseFlow(repositoryState)

    this.setRebaseFlowStep(repository, initialStep)

    this.showPopup({
      type: PopupType.RebaseFlow,
      repository,
    })
  }

  public showRepositorySettings() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    this.showPopup({
      type: PopupType.RepositorySettings,
      repository,
    })
  }

  public viewRepositoryOnGitHub() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    const url = getGitHubHtmlUrl(repository)

    if (url) this.openInBrowser(url)
  }

  public openIssueCreationOnGitHub() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository
    this.openIssueCreationPage(repository)
  }

  public openCurrentRepositoryInShell = () => {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    this.openShell(repository.path)
  }

  public showCloneRepo = (cloneUrl?: string) => {
    let initialURL: string | null = null

    if (cloneUrl !== undefined) {
      this.changeCloneRepositoriesTab(
        CloneRepositoryTab.Generic
      )
      initialURL = cloneUrl
    }

    return this.showPopup({
      type: PopupType.CloneRepository,
      initialURL,
    })
  }

  public openPullRequest = () => {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return

    const currentPullRequest = state.state.branchesState.currentPullRequest

    if (currentPullRequest == null) {
      this.createPullRequest(state.repository)
    } else {
      this.showPullRequest(state.repository)
    }
  }

  public openCurrentRepositoryInExternalEditor() {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    this.openInExternalEditor(repository.path)
  }

  public selectAll() {
    const event = new CustomEvent('select-all', {
      bubbles: true,
      cancelable: true,
    })

    if (
      document.activeElement != null &&
      document.activeElement.dispatchEvent(event)
    ) {
      remote.getCurrentWebContents().selectAll()
    }
  }

  public findText() {
    const event = new CustomEvent('find-text', {
      bubbles: true,
      cancelable: true,
    })

    if (document.activeElement != null) {
      document.activeElement.dispatchEvent(event)
    } else {
      document.dispatchEvent(event)
    }
  }

  public onContinueWithUntrustedCertificate = (certificate: Electron.Certificate) => {
    showCertificateTrustDialog(
      certificate,
      'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.'
    )
  }

  public onViewCommitOnGitHub = async (SHA: string) => {
    const state = this.appStore.getSelectedState()
    if (state == null || state.type !== SelectionType.Repository) return
    const repository = state.repository

    if (
      !repository ||
      repository instanceof CloningRepository ||
      !repository.gitHubRepository
    ) {
      return
    }

    const baseURL = repository.gitHubRepository.htmlURL

    if (baseURL) {
      this.openInBrowser(`${baseURL}/commit/${SHA}`)
    }
  }


  /** Fetch a specific refspec for the repository. */
  public fetchRefspec(
    repository: Repository,
    fetchspec: string
  ): Promise<void> {
    return this.appStore._fetchRefspec(repository, fetchspec)
  }

  /** Fetch all refs for the repository */
  public fetch(repository: Repository, fetchType: FetchType): Promise<void> {
    return this.appStore._fetch(repository, fetchType)
  }

  /** Publish the repository to GitHub with the given properties. */
  public publishRepository(
    repository: Repository,
    name: string,
    description: string,
    private_: boolean,
    account: Account,
    org: IAPIOrganization | null
  ): Promise<Repository> {
    return this.appStore._publishRepository(
      repository,
      name,
      description,
      private_,
      account,
      org
    )
  }

  /**
   * Post the given error. This will send the error through the standard error
   * handler machinery.
   */
  public async postError(error: Error): Promise<void> {
    let currentError: Error | null = error
    for (let i = this.errorHandlers.length - 1; i >= 0; i--) {
      const handler = this.errorHandlers[i]
      currentError = await handler(currentError, this)

      if (!currentError) {
        break
      }
    }

    if (currentError) {
      fatalError(
        `Unhandled error ${currentError}. This shouldn't happen! All errors should be handled, even if it's just by the default handler.`
      )
    }
  }

  /**
   * Post the given error. Note that this bypasses the standard error handler
   * machinery. You probably don't want that. See `Dispatcher.postError`
   * instead.
   */
  public presentError(error: Error): Promise<void> {
    return this.appStore._pushError(error)
  }

  /** Clear the given error. */
  public clearError(error: Error): Promise<void> {
    return this.appStore._clearError(error)
  }

  /**
   * Clone a missing repository to the previous path, and update it's
   * state in the repository list if the clone completes without error.
   */
  public cloneAgain(url: string, path: string): Promise<void> {
    return this.appStore._cloneAgain(url, path)
  }

  /** Clone the repository to the path. */
  public async clone(
    url: string,
    path: string,
    options?: { branch?: string }
  ): Promise<Repository | null> {
    return this.appStore._completeOpenInDesktop(async () => {
      const { promise, repository } = this.appStore._clone(url, path, options)
      await this.selectRepository(repository)
      const success = await promise
      // TODO: this exit condition is not great, bob
      if (!success) {
        return null
      }

      const addedRepositories = await this.addRepositories([path])
      const addedRepository = addedRepositories[0]
      await this.selectRepository(addedRepository)

      if (
        enableForkSettings() &&
        isRepositoryWithForkedGitHubRepository(addedRepository)
      ) {
        this.showPopup({
          type: PopupType.ChooseForkSettings,
          repository: addedRepository,
        })
      }

      return addedRepository
    })
  }

  /** Rename the branch to a new name. */
  public renameBranch(
    repository: Repository,
    branch: Branch,
    newName: string
  ): Promise<void> {
    return this.appStore._renameBranch(repository, branch, newName)
  }

  /**
   * Delete the branch. This will delete both the local branch and the remote
   * branch, and then check out the default branch.
   */
  public deleteBranch(
    repository: Repository,
    branch: Branch,
    includeRemote: boolean
  ): Promise<void> {
    return this.appStore._deleteBranch(repository, branch, includeRemote)
  }

  /** Discard the changes to the given files. */
  public discardChanges(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): Promise<void> {
    return this.appStore._discardChanges(repository, files)
  }

  /** Discard the changes from the given diff selection. */
  public discardChangesFromSelection(
    repository: Repository,
    filePath: string,
    diff: ITextDiff,
    selection: DiffSelection
  ): Promise<void> {
    return this.appStore._discardChangesFromSelection(
      repository,
      filePath,
      diff,
      selection
    )
  }

  /** Undo the given commit. */
  public undoCommit(repository: Repository, commit: Commit): Promise<void> {
    return this.appStore._undoCommit(repository, commit)
  }

  /** Revert the commit with the given SHA */
  public revertCommit(repository: Repository, commit: Commit): Promise<void> {
    return this.appStore._revertCommit(repository, commit)
  }

  /**
   * Set the width of the repository sidebar to the given
   * value. This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   */
  public setSidebarWidth(width: number): Promise<void> {
    return this.appStore._setSidebarWidth(width)
  }

  /**
   * Set the update banner's visibility
   */
  public setUpdateBannerVisibility(isVisible: boolean) {
    return this.appStore._setUpdateBannerVisibility(isVisible)
  }

  /**
   * Set the banner state for the application
   */
  public setBanner(state: Banner) {
    return this.appStore._setBanner(state)
  }

  /**
   * Close the current banner, if found.
   *
   * @param bannerType only close the banner if it matches this `BannerType`
   */
  public clearBanner() {
    return this.appStore._clearBanner()
  }

  /**
   * Set the divering branch notification nudge's visibility
   */
  public setDivergingBranchNudgeVisibility(
    repository: Repository,
    isVisible: boolean
  ) {
    return this.appStore._updateDivergingBranchBannerState(repository, {
      isNudgeVisible: isVisible,
    })
  }

  /**
   * Hide the divering branch notification banner
   */
  public dismissDivergingBranchBanner(repository: Repository) {
    return this.appStore._updateDivergingBranchBannerState(repository, {
      isPromptDismissed: true,
    })
  }

  /**
   * Reset the width of the repository sidebar to its default
   * value. This affects the changes and history sidebar
   * as well as the first toolbar section which contains
   * repo selection on all platforms and repo selection and
   * app menu on Windows.
   */
  public resetSidebarWidth(): Promise<void> {
    return this.appStore._resetSidebarWidth()
  }

  /**
   * Set the width of the commit summary column in the
   * history view to the given value.
   */
  public setCommitSummaryWidth(width: number): Promise<void> {
    return this.appStore._setCommitSummaryWidth(width)
  }

  /**
   * Reset the width of the commit summary column in the
   * history view to its default value.
   */
  public resetCommitSummaryWidth(): Promise<void> {
    return this.appStore._resetCommitSummaryWidth()
  }

  /** Update the repository's issues from GitHub. */
  public refreshIssues(repository: GitHubRepository): Promise<void> {
    return this.appStore._refreshIssues(repository)
  }

  /** End the Welcome flow. */
  public endWelcomeFlow(): Promise<void> {
    return this.appStore._endWelcomeFlow()
  }

  /** Set the commit message input's focus. */
  public setCommitMessageFocus(focus: boolean) {
    this.appStore._setCommitMessageFocus(focus)
  }

  /**
   * Set the commit summary and description for a work-in-progress
   * commit in the changes view for a particular repository.
   */
  public setCommitMessage(
    repository: Repository,
    message: ICommitMessage
  ): Promise<void> {
    return this.appStore._setCommitMessage(repository, message)
  }

  /** Remove the given account from the app. */
  public removeAccount(account: Account): Promise<void> {
    return this.appStore._removeAccount(account)
  }

  /**
   * Ask the dispatcher to apply a transformation function to the current
   * state of the application menu.
   *
   * Since the dispatcher is asynchronous it's possible for components
   * utilizing the menu state to have an out-of-date view of the state
   * of the app menu which is why they're not allowed to transform it
   * directly.
   *
   * To work around potential race conditions consumers instead pass a
   * delegate which receives the updated application menu and allows
   * them to perform the necessary state transitions. The AppMenu instance
   * is itself immutable but does offer transformation methods and in
   * order for the state to be properly updated the delegate _must_ return
   * the latest transformed instance of the AppMenu.
   */
  public setAppMenuState(update: (appMenu: AppMenu) => AppMenu): Promise<void> {
    return this.appStore._setAppMenuState(update)
  }

  /**
   * Tell the main process to execute (i.e. simulate a click of) the given menu item.
   */
  public executeMenuItem(item: ExecutableMenuItem): Promise<void> {
    executeMenuItem(item)
    return Promise.resolve()
  }

  /**
   * Set whether or not to to add a highlight class to the app menu toolbar icon.
   * Used to highlight the button when the Alt key is pressed.
   *
   * Only applicable on non-macOS platforms.
   */
  public setAccessKeyHighlightState(highlight: boolean): Promise<void> {
    return this.appStore._setAccessKeyHighlightState(highlight)
  }

  public cherryPick(
    repository: Repository,
    commitSha: string,
    branch: string,
  ): Promise<void> {
    return this.appStore._cherryPickBranch(repository, commitSha, branch)
  }

  /** Merge the named branch into the current branch. */
  public mergeBranch(
    repository: Repository,
    branch: string,
  ): Promise<void> {
    return this.appStore._mergeBranch(repository, branch)
  }

  /**
   * Update the per-repository list of branches that can be force-pushed
   * after a rebase is completed.
   */
  private addRebasedBranchToForcePushList = (
    repository: Repository,
    tipWithBranch: IValidBranch,
    beforeRebaseSha: string
  ) => {
    // if the commit id of the branch is unchanged, it can be excluded from
    // this list
    if (tipWithBranch.branch.tip.sha === beforeRebaseSha) {
      return
    }

    const currentState = this.repositoryStateManager.get(repository)
    const { rebasedBranches } = currentState.branchesState

    const updatedMap = new Map<string, string>(rebasedBranches)
    updatedMap.set(
      tipWithBranch.branch.nameWithoutRemote,
      tipWithBranch.branch.tip.sha
    )

    this.repositoryStateManager.updateBranchesState(repository, () => ({
      rebasedBranches: updatedMap,
    }))
  }

  private dropCurrentBranchFromForcePushList = (repository: Repository) => {
    const currentState = this.repositoryStateManager.get(repository)
    const { rebasedBranches, tip } = currentState.branchesState

    if (tip.kind !== TipState.Valid) {
      return
    }

    const updatedMap = new Map<string, string>(rebasedBranches)
    updatedMap.delete(tip.branch.nameWithoutRemote)

    this.repositoryStateManager.updateBranchesState(repository, () => ({
      rebasedBranches: updatedMap,
    }))
  }

  /**
   * Update the rebase state to indicate the user has resolved conflicts in the
   * current repository.
   */
  public setConflictsResolved(repository: Repository) {
    return this.appStore._setConflictsResolved(repository)
  }

  /**
   * Initialize the progress in application state based on the known commits
   * that will be applied in the rebase.
   *
   * @param commits the list of commits that exist on the target branch which do
   *                not exist on the base branch
   */
  public initializeRebaseProgress(
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) {
    return this.appStore._initializeRebaseProgress(repository, commits)
  }

  /**
   * Update the rebase progress in application state by querying the Git
   * repository state.
   */
  public setRebaseProgressFromState(repository: Repository) {
    return this.appStore._setRebaseProgressFromState(repository)
  }

  /**
   * Move the rebase flow to a new state.
   */
  public setRebaseFlowStep(
    repository: Repository,
    step: RebaseFlowStep
  ): Promise<void> {
    return this.appStore._setRebaseFlowStep(repository, step)
  }

  /** End the rebase flow and cleanup any related app state */
  public endRebaseFlow(repository: Repository) {
    return this.appStore._endRebaseFlow(repository)
  }

  /** Starts a rebase for the given base and target branch */
  public async rebase(
    repository: Repository,
    baseBranch: Branch,
    targetBranch: Branch
  ): Promise<void> {
    const stateBefore = this.repositoryStateManager.get(repository)

    const beforeSha = getTipSha(stateBefore.branchesState.tip)

    log.info(
      `[rebase] starting rebase for ${targetBranch.name} at ${beforeSha}`
    )
    log.info(
      `[rebase] to restore the previous state if this completed rebase is unsatisfactory:`
    )
    log.info(`[rebase] - git checkout ${targetBranch.name}`)
    log.info(`[rebase] - git reset ${beforeSha} --hard`)

    const result = await this.appStore._rebase(
      repository,
      baseBranch,
      targetBranch
    )

    await this.appStore._loadStatus(repository)

    const stateAfter = this.repositoryStateManager.get(repository)
    const { tip } = stateAfter.branchesState
    const afterSha = getTipSha(tip)

    log.info(
      `[rebase] completed rebase - got ${result} and on tip ${afterSha} - kind ${tip.kind}`
    )

    if (result === RebaseResult.ConflictsEncountered) {
      const { conflictState } = stateAfter.changesState
      if (conflictState === null) {
        log.warn(
          `[rebase] conflict state after rebase is null - unable to continue`
        )
        return
      }

      if (isMergeConflictState(conflictState)) {
        log.warn(
          `[rebase] conflict state after rebase is merge conflicts - unable to continue`
        )
        return
      }

      const conflictsWithBranches: RebaseConflictState = {
        ...conflictState,
        baseBranch: baseBranch.name,
        targetBranch: targetBranch.name,
      }

      this.switchToConflicts(repository, conflictsWithBranches)
    } else if (result === RebaseResult.CompletedWithoutError) {
      if (tip.kind !== TipState.Valid) {
        log.warn(
          `[rebase] tip after completing rebase is ${tip.kind} but this should be a valid tip if the rebase completed without error`
        )
        return
      }

      await this.completeRebase(
        repository,
        {
          type: BannerType.SuccessfulRebase,
          targetBranch: targetBranch.name,
          baseBranch: baseBranch.name,
        },
        tip,
        beforeSha
      )
    } else if (result === RebaseResult.Error) {
      // we were unable to successfully start the rebase, and an error should
      // be shown through the default error handling infrastructure, so we can
      // just abandon the rebase for now
      this.endRebaseFlow(repository)
    }
  }

  /** Abort the current rebase and refreshes the repository status */
  public async abortRebase(repository: Repository) {
    await this.appStore._abortRebase(repository)
    await this.appStore._loadStatus(repository)
  }

  /**
   * Continue with the rebase after the user has resovled all conflicts with
   * tracked files in the working directory.
   */
  public async continueRebase(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    conflictsState: RebaseConflictState
  ): Promise<void> {
    const stateBefore = this.repositoryStateManager.get(repository)
    const {
      targetBranch,
      baseBranch,
      originalBranchTip,
      manualResolutions,
    } = conflictsState

    const beforeSha = getTipSha(stateBefore.branchesState.tip)

    log.info(`[continueRebase] continuing rebase for ${beforeSha}`)

    const result = await this.appStore._continueRebase(
      repository,
      workingDirectory,
      manualResolutions
    )
    await this.appStore._loadStatus(repository)

    const stateAfter = this.repositoryStateManager.get(repository)
    const { tip } = stateAfter.branchesState
    const afterSha = getTipSha(tip)

    log.info(
      `[continueRebase] completed rebase - got ${result} and on tip ${afterSha} - kind ${tip.kind}`
    )

    if (result === RebaseResult.ConflictsEncountered) {
      const { conflictState } = stateAfter.changesState
      if (conflictState === null) {
        log.warn(
          `[continueRebase] conflict state after rebase is null - unable to continue`
        )
        return
      }

      if (isMergeConflictState(conflictState)) {
        log.warn(
          `[continueRebase] conflict state after rebase is merge conflicts - unable to continue`
        )
        return
      }

      // ensure branches are persisted when transitioning back to conflicts
      const conflictsWithBranches: RebaseConflictState = {
        ...conflictState,
        baseBranch,
        targetBranch,
      }

      this.switchToConflicts(repository, conflictsWithBranches)
    } else if (result === RebaseResult.CompletedWithoutError) {
      if (tip.kind !== TipState.Valid) {
        log.warn(
          `[continueRebase] tip after completing rebase is ${tip.kind} but this should be a valid tip if the rebase completed without error`
        )
        return
      }

      await this.completeRebase(
        repository,
        {
          type: BannerType.SuccessfulRebase,
          targetBranch: targetBranch,
          baseBranch: baseBranch,
        },
        tip,
        originalBranchTip
      )
    }
  }

  /** Switch the rebase flow to show the latest conflicts */
  private switchToConflicts = (
    repository: Repository,
    conflictState: RebaseConflictState
  ) => {
    this.setRebaseFlowStep(repository, {
      kind: RebaseStep.ShowConflicts,
      conflictState,
    })
  }

  /** Tidy up the rebase flow after reaching the end */
  private async completeRebase(
    repository: Repository,
    banner: Banner,
    tip: IValidBranch,
    originalBranchTip: string
  ): Promise<void> {
    this.closePopup()

    this.setBanner(banner)

    if (tip.kind === TipState.Valid) {
      this.addRebasedBranchToForcePushList(repository, tip, originalBranchTip)
    }

    this.endRebaseFlow(repository)

    await this.refreshRepository(repository)
  }

  /** aborts an in-flight merge and refreshes the repository's status */
  public async abortMerge(repository: Repository) {
    await this.appStore._abortMerge(repository)
    await this.appStore._loadStatus(repository)
  }

  /**
   * commits an in-flight merge and shows a banner if successful
   *
   * @param repository
   * @param workingDirectory
   * @param successfulMergeBannerState information for banner to be displayed if merge is successful
   */
  public async finishConflictedMerge(
    repository: Repository,
    workingDirectory: WorkingDirectoryStatus,
    successfulMergeBanner: Banner
  ) {
    // get manual resolutions in case there are manual conflicts
    const repositoryState = this.repositoryStateManager.get(repository)
    const { conflictState } = repositoryState.changesState
    if (conflictState === null) {
      // if this doesn't exist, something is very wrong and we shouldn't proceed 😢
      log.error(
        'Conflict state missing during finishConflictedMerge. No merge will be committed.'
      )
      return
    }
    const result = await this.appStore._finishConflictedMerge(
      repository,
      workingDirectory,
      conflictState.manualResolutions
    )
    if (result !== undefined) {
      this.setBanner(successfulMergeBanner)
    }
  }

  /** Changes the URL for the remote that matches the given name  */
  public setRemoteURL(
    repository: Repository,
    name: string,
    url: string
  ): Promise<void> {
    return this.appStore._setRemoteURL(repository, name, url)
  }

  /** Open the URL in a browser */
  public openInBrowser(url: string): Promise<boolean> {
    return this.appStore._openInBrowser(url)
  }

  /** Add the pattern to the repository's gitignore. */
  public appendIgnoreRule(
    repository: Repository,
    pattern: string | string[]
  ): Promise<void> {
    return this.appStore._appendIgnoreRule(repository, pattern)
  }

  /** Opens a Git-enabled terminal setting the working directory to the repository path */
  public async openShell(
    path: string,
    ignoreWarning: boolean = false
  ): Promise<void> {
    const gitFound = await isGitOnPath()
    if (gitFound || ignoreWarning) {
      this.appStore._openShell(path)
    } else {
      this.appStore._showPopup({
        type: PopupType.InstallGit,
        path,
      })
    }
  }

  /**
   * Opens a path in the external editor selected by the user.
   */
  public async openInExternalEditor(fullPath: string): Promise<void> {
    return this.appStore._openInExternalEditor(fullPath)
  }

  /**
   * Persist the given content to the repository's root .gitignore.
   *
   * If the repository root doesn't contain a .gitignore file one
   * will be created, otherwise the current file will be overwritten.
   */
  public saveGitIgnore(repository: Repository, text: string): Promise<void> {
    return this.appStore._saveGitIgnore(repository, text)
  }

  /**
   * Clear any in-flight sign in state and return to the
   * initial (no sign-in) state.
   */
  public resetSignInState(): Promise<void> {
    return this.appStore._resetSignInState()
  }

  /**
   * Subscribe to an event which is emitted whenever the sign in store re-evaluates
   * whether or not GitHub.com supports username and password authentication.
   *
   * Note that this event may fire without the state having changed as it's
   * fired when refreshed and not when changed.
   */
  public onDotComSupportsBasicAuthUpdated(
    fn: (dotComSupportsBasicAuth: boolean) => void
  ) {
    return this.appStore._onDotComSupportsBasicAuthUpdated(fn)
  }

  /**
   * Attempt to _synchronously_ retrieve whether GitHub.com supports
   * username and password authentication. If the SignInStore has
   * previously checked the API to determine the actual status that
   * cached value is returned. If not we attempt to calculate the
   * most probably state based on the current date and the deprecation
   * timeline.
   */
  public tryGetDotComSupportsBasicAuth(): boolean {
    return this.appStore._tryGetDotComSupportsBasicAuth()
  }

  /**
   * Initiate a sign in flow for github.com. This will put the store
   * in the Authentication step ready to receive user credentials.
   */
  public beginDotComSignIn(): Promise<void> {
    return this.appStore._beginDotComSignIn()
  }

  /**
   * Initiate a sign in flow for a GitHub Enterprise instance. This will
   * put the store in the EndpointEntry step ready to receive the url
   * to the enterprise instance.
   */
  public beginEnterpriseSignIn(): Promise<void> {
    return this.appStore._beginEnterpriseSignIn()
  }

  /**
   * Attempt to advance from the EndpointEntry step with the given endpoint
   * url. This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   *
   * The provided endpoint url will be validated for syntactic correctness as
   * well as connectivity before the promise resolves. If the endpoint url is
   * invalid or the host can't be reached the promise will be rejected and the
   * sign in state updated with an error to be presented to the user.
   *
   * If validation is successful the store will advance to the authentication
   * step.
   */
  public setSignInEndpoint(url: string): Promise<void> {
    return this.appStore._setSignInEndpoint(url)
  }

  /**
   * Attempt to advance from the authentication step using a username
   * and password. This method must only be called when the store is
   * in the authentication step or an error will be thrown. If the
   * provided credentials are valid the store will either advance to
   * the Success step or to the TwoFactorAuthentication step if the
   * user has enabled two factor authentication.
   *
   * If an error occurs during sign in (such as invalid credentials)
   * the authentication state will be updated with that error so that
   * the responsible component can present it to the user.
   */
  public setSignInCredentials(
    username: string,
    password: string
  ): Promise<void> {
    return this.appStore._setSignInCredentials(username, password)
  }

  /**
   * Initiate an OAuth sign in using the system configured browser.
   * This method must only be called when the store is in the authentication
   * step or an error will be thrown.
   *
   * The promise returned will only resolve once the user has successfully
   * authenticated. If the user terminates the sign-in process by closing
   * their browser before the protocol handler is invoked, by denying the
   * protocol handler to execute or by providing the wrong credentials
   * this promise will never complete.
   */
  public requestBrowserAuthentication(): Promise<void> {
    return this.appStore._requestBrowserAuthentication()
  }

  /**
   * Initiate an OAuth sign in using the system configured browser to GitHub.com.
   *
   * The promise returned will only resolve once the user has successfully
   * authenticated. If the user terminates the sign-in process by closing
   * their browser before the protocol handler is invoked, by denying the
   * protocol handler to execute or by providing the wrong credentials
   * this promise will never complete.
   */
  public async requestBrowserAuthenticationToDotcom(): Promise<void> {
    await this.beginDotComSignIn()
    return this.requestBrowserAuthentication()
  }

  /**
   * Attempt to complete the sign in flow with the given OTP token.\
   * This method must only be called when the store is in the
   * TwoFactorAuthentication step or an error will be thrown.
   *
   * If the provided token is valid the store will advance to
   * the Success step.
   *
   * If an error occurs during sign in (such as invalid credentials)
   * the authentication state will be updated with that error so that
   * the responsible component can present it to the user.
   */
  public setSignInOTP(otp: string): Promise<void> {
    return this.appStore._setSignInOTP(otp)
  }

  /**
   * Launch a sign in dialog for authenticating a user with
   * GitHub.com.
   */
  public async showDotComSignInDialog(): Promise<void> {
    await this.appStore._beginDotComSignIn()
    await this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Launch a sign in dialog for authenticating a user with
   * a GitHub Enterprise instance.
   */
  public async showEnterpriseSignInDialog(): Promise<void> {
    await this.appStore._beginEnterpriseSignIn()
    await this.appStore._showPopup({ type: PopupType.SignIn })
  }

  /**
   * Show a dialog that helps the user create a fork of
   * their local repo.
   */
  public async showCreateForkDialog(
    repository: RepositoryWithGitHubRepository
  ): Promise<void> {
    await this.appStore._showCreateforkDialog(repository)
  }

  /**
   * Register a new error handler.
   *
   * Error handlers are called in order starting with the most recently
   * registered handler. The error which the returned {Promise} resolves to is
   * passed to the next handler, etc. If the handler's {Promise} resolves to
   * null, error propagation is halted.
   */
  public registerErrorHandler(handler: ErrorHandler): Disposable {
    this.errorHandlers.push(handler)

    return new Disposable(() => {
      const i = this.errorHandlers.indexOf(handler)
      if (i >= 0) {
        this.errorHandlers.splice(i, 1)
      }
    })
  }

  /**
   * Update the location of an existing repository and clear the missing flag.
   */
  public async relocateRepository(repository: Repository): Promise<void> {
    const window = remote.getCurrentWindow()
    const { filePaths } = await remote.dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    })

    if (filePaths.length > 0) {
      const newPath = filePaths[0]
      await this.updateRepositoryPath(repository, newPath)
    }
  }

  /**
   * Change the workflow preferences for the specified repository.
   *
   * @param repository            The repositosy to update.
   * @param workflowPreferences   The object with the workflow settings to use.
   */
  public async updateRepositoryWorkflowPreferences(
    repository: Repository,
    workflowPreferences: WorkflowPreferences
  ) {
    await this.appStore._updateRepositoryWorkflowPreferences(
      repository,
      workflowPreferences
    )
  }

  /** Update the repository's path. */
  private async updateRepositoryPath(
    repository: Repository,
    path: string
  ): Promise<void> {
    await this.appStore._updateRepositoryPath(repository, path)
  }

  public async setAppFocusState(isFocused: boolean): Promise<void> {
    await this.appStore._setAppFocusState(isFocused)

    if (isFocused) {
      this.commitStatusStore.startBackgroundRefresh()
    } else {
      this.commitStatusStore.stopBackgroundRefresh()
    }
  }

  /**
   * Find an existing repository that can be used for checking out
   * the passed pull request.
   *
   * This method will try to find an opened repository that matches the
   * HEAD repository of the PR first and if not found it will try to
   * find an opened repository that matches the BASE repository of the PR.
   * Matching in this context means that either the origin remote or the
   * upstream remote url are equal to the PR ref repository URL.
   *
   * With this logic we try to select the best suited repository to open
   * a PR when triggering a "Open PR from Desktop" action from a browser.
   *
   * @param pullRequest the pull request object received from the API.
   */
  private getRepositoryFromPullRequest(
    pullRequest: IAPIPullRequest
  ): RepositoryWithGitHubRepository | null {
    const state = this.appStore.getState()
    const repositories = state.repositories
    const headUrl = pullRequest.head.repo?.clone_url
    const baseUrl = pullRequest.base.repo?.clone_url

    // This likely means that the base repository has been deleted
    // and we don't support checking out from refs/pulls/NNN/head
    // yet so we'll bail for now.
    if (headUrl === undefined || baseUrl === undefined) {
      return null
    }

    for (const repository of repositories) {
      if (this.doesRepositoryMatchUrl(repository, headUrl)) {
        return repository
      }
    }

    for (const repository of repositories) {
      if (this.doesRepositoryMatchUrl(repository, baseUrl)) {
        return repository
      }
    }

    return null
  }

  private doesRepositoryMatchUrl(
    repo: Repository | CloningRepository,
    url: string
  ): repo is RepositoryWithGitHubRepository {
    if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
      const originRepoUrl = repo.gitHubRepository.htmlURL
      const upstreamRepoUrl = repo.gitHubRepository.parent?.htmlURL ?? null

      if (originRepoUrl !== null && urlsMatch(originRepoUrl, url)) {
        return true
      }

      if (upstreamRepoUrl !== null && urlsMatch(upstreamRepoUrl, url)) {
        return true
      }
    }

    return false
  }

  private async openRepositoryFromUrl(action: IOpenRepositoryFromURLAction) {
    const { url, pr, branch, filepath } = action

    let repository: Repository | null

    if (pr !== null) {
      repository = await this.openPullRequestFromUrl(url, pr)
    } else if (branch !== null) {
      repository = await this.openBranchNameFromUrl(url, branch)
    } else {
      repository = await this.openOrCloneRepository(url)
    }

    if (repository === null) {
      return
    }

    if (filepath !== null) {
      const resolved = await resolveWithin(repository.path, filepath)

      if (resolved !== null) {
        shell.showItemInFolder(resolved)
      } else {
        log.error(
          `Prevented attempt to open path outside of the repository root: ${filepath}`
        )
      }
    }
  }

  private async openBranchNameFromUrl(
    url: string,
    branchName: string
  ): Promise<Repository | null> {
    const repository = await this.openOrCloneRepository(url)

    if (repository === null) {
      return null
    }

    // ensure a fresh clone repository has it's in-memory state
    // up-to-date before performing the "Clone in Desktop" steps
    await this.appStore._refreshRepository(repository)

    await this.checkoutLocalBranch(repository, branchName)

    return repository
  }

  private async openPullRequestFromUrl(
    url: string,
    pr: string
  ): Promise<RepositoryWithGitHubRepository | null> {
    const pullRequest = await this.appStore.fetchPullRequest(url, pr)

    if (pullRequest === null) {
      return null
    }

    // Find the repository where the PR is created in Desktop.
    let repository: Repository | null = this.getRepositoryFromPullRequest(
      pullRequest
    )

    if (repository !== null) {
      await this.selectRepository(repository)
    } else {
      repository = await this.openOrCloneRepository(url)
    }

    if (repository === null) {
      log.warn(
        `Open Repository from URL failed, did not find or clone repository: ${url}`
      )
      return null
    }
    if (!isRepositoryWithGitHubRepository(repository)) {
      log.warn(
        `Received a non-GitHub repository when opening repository from URL: ${url}`
      )
      return null
    }

    // ensure a fresh clone repository has it's in-memory state
    // up-to-date before performing the "Clone in Desktop" steps
    await this.appStore._refreshRepository(repository)

    if (pullRequest.head.repo === null) {
      return null
    }

    await this.appStore._checkoutPullRequest(
      repository,
      pullRequest.number,
      pullRequest.user.login,
      pullRequest.head.repo.clone_url,
      pullRequest.head.ref
    )

    return repository
  }

  public async dispatchURLAction(action: URLActionType): Promise<void> {
    switch (action.name) {
      case 'oauth':
        try {
          log.info(`[Dispatcher] requesting authenticated user`)
          const user = await requestAuthenticatedUser(action.code, action.state)
          if (user) {
            resolveOAuthRequest(user)
          } else if (user === null) {
            rejectOAuthRequest(new Error('Unable to fetch authenticated user.'))
          }
        } catch (e) {
          rejectOAuthRequest(e)
        }

        if (__DARWIN__) {
          // workaround for user reports that the application doesn't receive focus
          // after completing the OAuth signin in the browser
          const window = remote.getCurrentWindow()
          if (!window.isFocused()) {
            log.info(
              `refocusing the main window after the OAuth flow is completed`
            )
            window.focus()
          }
        }
        break

      case 'open-repository-from-url':
        this.openRepositoryFromUrl(action)
        break

      case 'open-repository-from-path':
        // user may accidentally provide a folder within the repository
        // this ensures we use the repository root, if it is actually a repository
        // otherwise we consider it an untracked repository
        const path = (await validatedRepositoryPath(action.path)) || action.path
        const state = this.appStore.getState()
        let existingRepository = matchExistingRepository(
          state.repositories,
          path
        )

        // in case this is valid git repository, there is no need to ask
        // user for confirmation and it can be added automatically
        if (existingRepository == null) {
          const isRepository = await isGitRepository(path)
          if (isRepository) {
            const addedRepositories = await this.addRepositories([path])
            existingRepository = addedRepositories[0]
          }
        }

        if (existingRepository) {
          await this.selectRepository(existingRepository)
        } else {
          await this.showPopup({
            type: PopupType.AddRepository,
            path,
          })
        }
        break

      default:
        const unknownAction: IUnknownAction = action
        log.warn(
          `Unknown URL action: ${
            unknownAction.name
          } - payload: ${JSON.stringify(unknownAction)}`
        )
    }
  }

  /**
   * Sets the user's preference so that confirmation to remove repo is not asked
   */
  public setConfirmRepoRemovalSetting(value: boolean): Promise<void> {
    return this.appStore._setConfirmRepositoryRemovalSetting(value)
  }

  /**
   * Sets the user's preference so that confirmation to discard changes is not asked
   */
  public setConfirmDiscardChangesSetting(value: boolean): Promise<void> {
    return this.appStore._setConfirmDiscardChangesSetting(value)
  }

  /**
   * Sets the user's preference for handling uncommitted changes when switching branches
   */
  public setUncommittedChangesStrategyKindSetting(
    value: UncommittedChangesStrategyKind
  ): Promise<void> {
    return this.appStore._setUncommittedChangesStrategyKindSetting(value)
  }

  /**
   * Sets the user's preference for an external program to open repositories in.
   */
  public setExternalEditor(editor: ExternalEditor): Promise<void> {
    return this.appStore._setExternalEditor(editor)
  }

  /**
   * Sets the user's preferred shell.
   */
  public setShell(shell: Shell): Promise<void> {
    return this.appStore._setShell(shell)
  }

  public async checkoutLocalBranch(repository: Repository, branch: string) {
    let shouldCheckoutBranch = true

    const state = this.repositoryStateManager.get(repository)
    const branches = state.branchesState.allBranches

    const { tip } = state.branchesState

    if (tip.kind === TipState.Valid) {
      shouldCheckoutBranch = tip.branch.nameWithoutRemote !== branch
    }

    const localBranch = branches.find(b => b.nameWithoutRemote === branch)

    // N.B: This looks weird, and it is. _checkoutBranch used
    // to behave this way (silently ignoring checkout) when given
    // a branch name string that does not correspond to a local branch
    // in the git store. When rewriting _checkoutBranch
    // to remove the support for string branch names the behavior
    // was moved up to this method to not alter the current behavior.
    //
    // https://youtu.be/IjmtVKOAHPM
    if (shouldCheckoutBranch && localBranch !== undefined) {
      await this.checkoutBranch(repository, localBranch)
    }
  }

  private async openOrCloneRepository(url: string): Promise<Repository | null> {
    const state = this.appStore.getState()
    const repositories = state.repositories
    const existingRepository = repositories.find(r =>
      this.doesRepositoryMatchUrl(r, url)
    )

    if (existingRepository) {
      return await this.selectRepository(existingRepository)
    }

    return this.appStore._startOpenInDesktop(() => {
      this.changeCloneRepositoriesTab(CloneRepositoryTab.Generic)
      this.showPopup({
        type: PopupType.CloneRepository,
        initialURL: url,
      })
    })
  }

  /**
   * Install the CLI tool.
   *
   * This is used only on macOS.
   */
  public async installCLI() {
    try {
      await installCLI()

      this.showPopup({ type: PopupType.CLIInstalled })
    } catch (e) {
      log.error('Error installing CLI', e)

      this.postError(e)
    }
  }

  /** Prompt the user to authenticate for a generic git server. */
  public promptForGenericGitAuthentication(
    repository: Repository | CloningRepository,
    retry: RetryAction
  ): Promise<void> {
    return this.appStore.promptForGenericGitAuthentication(repository, retry)
  }

  /** Save the generic git credentials. */
  public async saveGenericGitCredentials(
    hostname: string,
    username: string,
    password: string
  ): Promise<void> {
    log.info(`storing generic credentials for '${hostname}' and '${username}'`)
    setGenericUsername(hostname, username)

    try {
      await setGenericPassword(hostname, username, password)
    } catch (e) {
      log.error(
        `Error saving generic git credentials: ${username}@${hostname}`,
        e
      )

      this.postError(e)
    }
  }

  /** Perform the given retry action. */
  public async performRetry(retryAction: RetryAction): Promise<void> {
    switch (retryAction.type) {
      case RetryActionType.Push:
        return this.appStore._push(retryAction.repository)

      case RetryActionType.Pull:
        return this.appStore._pull(retryAction.repository)

      case RetryActionType.Fetch:
        return this.fetch(retryAction.repository, FetchType.UserInitiatedTask)

      case RetryActionType.Clone:
        await this.clone(retryAction.url, retryAction.path, retryAction.options)
        break

      case RetryActionType.Checkout:
        await this.checkoutBranch(retryAction.repository, retryAction.branch)
        break

      case RetryActionType.Merge:
        return this.mergeBranch(
          retryAction.repository,
          retryAction.theirBranch,
        )

      case RetryActionType.CherryPick:
        return this.cherryPick(
          retryAction.repository,
          retryAction.commitSha,
          retryAction.theirBranch,
        )

      case RetryActionType.Rebase:
        return this.rebase(
          retryAction.repository,
          retryAction.baseBranch,
          retryAction.targetBranch
        )

      default:
        return assertNever(retryAction, `Unknown retry action: ${retryAction}`)
    }
  }

  /** Change the selected image diff type. */
  public changeImageDiffType(type: ImageDiffType): Promise<void> {
    return this.appStore._changeImageDiffType(type)
  }

  /** Change the hide whitespace in diff setting */
  public onHideWhitespaceInDiffChanged(
    hideWhitespaceInDiff: boolean,
    repository: Repository,
    file: CommittedFileChange | null = null
  ): Promise<void> {
    return this.appStore._setHideWhitespaceInDiff(
      hideWhitespaceInDiff,
      repository,
      file
    )
  }

  /** Install the global Git LFS filters. */
  public installGlobalLFSFilters(force: boolean): Promise<void> {
    return this.appStore._installGlobalLFSFilters(force)
  }

  /** Install the LFS filters */
  public installLFSHooks(
    repositories: ReadonlyArray<Repository>
  ): Promise<void> {
    return this.appStore._installLFSHooks(repositories)
  }

  /** Change the selected Clone Repository tab. */
  public changeCloneRepositoriesTab(tab: CloneRepositoryTab): Promise<void> {
    return this.appStore._changeCloneRepositoriesTab(tab)
  }

  /**
   * Request a refresh of the list of repositories that
   * the provided account has explicit permissions to access.
   * See ApiRepositoriesStore for more details.
   */
  public refreshApiRepositories(account: Account) {
    return this.appStore._refreshApiRepositories(account)
  }

  /**
   * Open the Explore page at the GitHub instance of this repository
   */
  public showGitHubExplore(repository: Repository): Promise<void> {
    return this.appStore._showGitHubExplore(repository)
  }

  /**
   * Open the Create Pull Request page on GitHub after verifying ahead/behind.
   *
   * Note that this method will present the user with a dialog in case the
   * current branch in the repository is ahead or behind the remote.
   * The dialog lets the user choose whether get in sync with the remote
   * or open the PR anyway. This is distinct from the
   * openCreatePullRequestInBrowser method which immediately opens the
   * create pull request page without showing a dialog.
   */
  public createPullRequest(repository: Repository): Promise<void> {
    return this.appStore._createPullRequest(repository)
  }

  /**
   * Show the current pull request on github.com
   */
  public showPullRequest(repository: Repository): Promise<void> {
    return this.appStore._showPullRequest(repository)
  }

  /**
   * Immediately open the Create Pull Request page on GitHub.
   *
   * See the createPullRequest method for more details.
   */
  public openCreatePullRequestInBrowser(
    repository: Repository,
    branch: Branch
  ): Promise<void> {
    return this.appStore._openCreatePullRequestInBrowser(repository, branch)
  }

  /**
   * Update the existing `upstream` remote to point to the repository's parent.
   */
  public updateExistingUpstreamRemote(repository: Repository): Promise<void> {
    return this.appStore._updateExistingUpstreamRemote(repository)
  }

  /** Ignore the existing `upstream` remote. */
  public ignoreExistingUpstreamRemote(repository: Repository): Promise<void> {
    return this.appStore._ignoreExistingUpstreamRemote(repository)
  }

  /** Checks out a PR whose ref exists locally or in a forked repo. */
  public async checkoutPullRequest(
    repository: RepositoryWithGitHubRepository,
    pullRequest: PullRequest
  ): Promise<void> {
    if (pullRequest.head.gitHubRepository.cloneURL === null) {
      return
    }

    return this.appStore._checkoutPullRequest(
      repository,
      pullRequest.pullRequestNumber,
      pullRequest.author,
      pullRequest.head.gitHubRepository.cloneURL,
      pullRequest.head.ref
    )
  }

  /**
   * Set whether the user has chosen to hide or show the
   * co-authors field in the commit message component
   *
   * @param repository Co-author settings are per-repository
   */
  public setShowCoAuthoredBy(
    repository: Repository,
    showCoAuthoredBy: boolean
  ) {
    return this.appStore._setShowCoAuthoredBy(repository, showCoAuthoredBy)
  }

  /**
   * Update the per-repository co-authors list
   *
   * @param repository Co-author settings are per-repository
   * @param coAuthors  Zero or more authors
   */
  public setCoAuthors(
    repository: Repository,
    coAuthors: ReadonlyArray<IAuthor>
  ) {
    return this.appStore._setCoAuthors(repository, coAuthors)
  }

  /**
   * Initialze the compare state for the current repository.
   */
  public initializeCompare(
    repository: Repository,
    initialAction?: CompareAction
  ) {
    return this.appStore._initializeCompare(repository, initialAction)
  }

  /**
   * Update the compare state for the current repository
   */
  public executeCompare(repository: Repository, action: CompareAction) {
    return this.appStore._executeCompare(repository, action)
  }

  /** Update the compare form state for the current repository */
  public updateCompareForm<K extends keyof ICompareFormUpdate>(
    repository: Repository,
    newState: Pick<ICompareFormUpdate, K>
  ) {
    return this.appStore._updateCompareForm(repository, newState)
  }

  /**
   *  update the manual resolution method for a file
   */
  public updateManualConflictResolution(
    repository: Repository,
    path: string,
    manualResolution: ManualConflictResolution | null
  ) {
    return this.appStore._updateManualConflictResolution(
      repository,
      path,
      manualResolution
    )
  }

  public async confirmOrForcePush(repository: Repository) {
    const { askForConfirmationOnForcePush } = this.appStore.getState()

    const { branchesState } = this.repositoryStateManager.get(repository)
    const { tip } = branchesState

    if (tip.kind !== TipState.Valid) {
      log.warn(`Could not find a branch to perform force push`)
      return
    }

    const { upstream } = tip.branch

    if (upstream === null) {
      log.warn(`Could not find an upstream branch which will be pushed`)
      return
    }

    if (askForConfirmationOnForcePush) {
      this.showPopup({
        type: PopupType.ConfirmForcePush,
        repository,
        upstreamBranch: upstream,
      })
    } else {
      await this.performForcePush(repository)
    }
  }

  public async performForcePush(repository: Repository) {
    await this.pushWithOptions(repository, {
      forceWithLease: true,
    })

    await this.appStore._loadStatus(repository)
  }

  public setConfirmForcePushSetting(value: boolean) {
    return this.appStore._setConfirmForcePushSetting(value)
  }

  /**
   * Converts a local repository to use the given fork
   * as its default remote and associated `GitHubRepository`.
   */
  public async convertRepositoryToFork(
    repository: RepositoryWithGitHubRepository,
    fork: IAPIRepository
  ): Promise<Repository> {
    return this.appStore._convertRepositoryToFork(repository, fork)
  }

  /**
   * Set the application-wide theme
   */
  public setSelectedTheme(theme: ApplicationTheme) {
    return this.appStore._setSelectedTheme(theme)
  }

  /**
   * Set the automatically switch application-wide theme
   */
  public onAutomaticallySwitchThemeChanged(theme: boolean) {
    return this.appStore._setAutomaticallySwitchTheme(theme)
  }

  /**
   * Refresh the list of open pull requests for the given repository.
   */
  public refreshPullRequests(repository: Repository): Promise<void> {
    return this.appStore._refreshPullRequests(repository)
  }

  /**
   * Attempt to retrieve a commit status for a particular
   * ref. If the ref doesn't exist in the cache this function returns null.
   *
   * Useful for component who wish to have a value for the initial render
   * instead of waiting for the subscription to produce an event.
   */
  public tryGetCommitStatus(
    repository: GitHubRepository,
    ref: string
  ): ICombinedRefCheck | null {
    return this.commitStatusStore.tryGetStatus(repository, ref)
  }

  /**
   * Subscribe to commit status updates for a particular ref.
   *
   * @param repository The GitHub repository to use when looking up commit status.
   * @param ref        The commit ref (can be a SHA or a Git ref) for which to
   *                   fetch status.
   * @param callback   A callback which will be invoked whenever the
   *                   store updates a commit status for the given ref.
   */
  public subscribeToCommitStatus(
    repository: GitHubRepository,
    ref: string,
    callback: StatusCallBack
  ): IDisposable {
    return this.commitStatusStore.subscribe(repository, ref, callback)
  }

  /**
   * Creates a stash for the current branch. Note that this will
   * override any stash that already exists for the current branch.
   *
   * @param repository
   */
  public createStashForCurrentBranch(repository: Repository) {
    return this.appStore._createStashForCurrentBranch(repository)
  }

  /** Removes the given stash in the given repository */
  public removeStash(repository: Repository, stashName: string) {
    return this.appStore._removeStashEntry(repository, stashName)
  }

  /** Apply the given stash in the given repository */
  public applyStash(repository: Repository, stashName: string) {
    return this.appStore._applyStashEntry(repository, stashName)
  }

  /** Drops the given stash in the given repository */
  public dropStash(repository: Repository, stashEntry: IStashEntry) {
    return this.appStore._dropStashEntry(repository, stashEntry)
  }

  /** Pop the given stash in the given repository */
  public popStash(repository: Repository, stashEntry: IStashEntry) {
    return this.appStore._popStashEntry(repository, stashEntry)
  }

  /** Pop the given stash in the given repository */
  public popStashWithName(repository: Repository, stashName: string) {
    return this.appStore._popStash(repository, stashName)
  }

  /**
   * Set the width of the commit summary column in the
   * history view to the given value.
   */
  public setStashedFilesWidth = (width: number): Promise<void> => {
    return this.appStore._setStashedFilesWidth(width)
  }

  /**
   * Reset the width of the commit summary column in the
   * history view to its default value.
   */
  public resetStashedFilesWidth = (): Promise<void> => {
    return this.appStore._resetStashedFilesWidth()
  }

  /**
   * Moves unconmitted changes to the branch being checked out
   */
  public async moveChangesToBranchAndCheckout(
    repository: Repository,
    branchToCheckout: Branch
  ) {
    return this.appStore._moveChangesToBranchAndCheckout(
      repository,
      branchToCheckout
    )
  }

  /** Open the issue creation page for a GitHub repository in a browser */
  public async openIssueCreationPage(repository: Repository): Promise<boolean> {
    // Default to creating issue on parent repo
    // See https://github.com/desktop/desktop/issues/9232 for rationale
    const url = getGitHubHtmlUrl(repository)
    if (url !== null) {
      return this.appStore._openInBrowser(`${url}/issues/new/choose`)
    } else {
      return false
    }
  }
}
