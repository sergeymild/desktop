import * as React from 'react'
import { ipcRenderer, remote } from 'electron'
import { CSSTransition, TransitionGroup } from 'react-transition-group'

import { FoldoutType, HistoryTabMode, IAppState, RepositorySectionTab, SelectionType } from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { AppStore, GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { shell } from '../lib/app-shell'
import { UpdateStatus, updateStore } from './lib/update-store'
import { RetryAction } from '../models/retry-actions'
import { matchExistingRepository } from '../lib/repository-matching'
import { getDotComAPIEndpoint } from '../lib/api'
import { getVersion } from './lib/app-proxy'
import { getOS } from '../lib/get-os'
import { validatedRepositoryPath } from '../lib/stores/helpers/validated-repository-path'
import { MenuEvent } from '../main-process/menu'
import { getGitHubHtmlUrl, Repository } from '../models/repository'
import { Account } from '../models/account'
import { TipState } from '../models/tip'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { CloningRepository } from '../models/cloning-repository'

import { FullScreenInfo, TitleBar, ZoomInfo } from './window'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { CloningRepositoryView } from './cloning-repository'
import { Toolbar } from './toolbar'
import { sendReady, showCertificateTrustDialog } from './main-process-proxy'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { renderBanner, UpdateAvailable } from './banners'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { NoRepositoriesView } from './no-repositories'
import { AppTheme } from './app-theme'
import { ApplicationTheme } from './lib/application-theme'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { Popup, PopupType } from '../models/popup'
import { initializeNewRebaseFlow, initializeRebaseFlowForConflictedRepository } from '../lib/rebase'
import { BannerType } from '../models/banner'
import { ToolbarTagsButton } from './toolbar/toolbar-tags-button'
import { AppPopup } from './popups/AppPopup'
import { KeyEventsHandler } from './key-events-handler'
import { ToolbarRepositoryButton } from './toolbar/toolbar-repository-button'
import { ToolbarBranchButton } from './toolbar/toolbar-branch-button'
import { ToolbarPushPullButton } from './toolbar/toolbar-push-pull-button'
import { dispatcher } from './index'

const MinuteInMilliseconds = 1000 * 60
const HourInMilliseconds = MinuteInMilliseconds * 60

/**
 * Check for updates every 4 hours
 */
const UpdateCheckInterval = 4 * HourInMilliseconds

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly repositoryStateManager: RepositoryStateCache
  readonly appStore: AppStore
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly startTime: number
}

export const dialogTransitionTimeout = {
  enter: 250,
  exit: 100,
}

export const bannerTransitionTimeout = { enter: 500, exit: 400 }

/**
 * The time to delay (in ms) from when we've loaded the initial state to showing
 * the window. This is try to give Chromium enough time to flush our latest DOM
 * changes. See https://github.com/desktop/desktop/issues/1398.
 */
const ReadyDelay = 100

export class App extends React.Component<IAppProps, IAppState> {
  private loading = true

  private updateIntervalHandle?: number

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup !== null || this.state.errors.length > 0
  }

  public constructor(props: IAppProps) {
    super(props)

    props.dispatcher.loadInitialState().then(() => {
      this.loading = false
      this.forceUpdate()

      requestIdleCallback(
        () => {
          const now = performance.now()
          sendReady(now - props.startTime)

          requestIdleCallback(() => {
            this.performDeferredLaunchActions()
          })
        },
        { timeout: ReadyDelay }
      )
    })

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)
    })

    props.appStore.onDidError(error => {
      props.dispatcher.postError(error)
    })

    ipcRenderer.on(
      'menu-event',
      (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
        this.onMenuEvent(name)
      }
    )

    updateStore.onDidChange(state => {
      const status = state.status

      if (
        !(
          __RELEASE_CHANNEL__ === 'development' ||
          __RELEASE_CHANNEL__ === 'test'
        ) &&
        status === UpdateStatus.UpdateReady
      ) {
        this.props.dispatcher.setUpdateBannerVisibility(true)
      }
    })

    updateStore.onError(error => {
      log.error(`Error checking for updates`, error)

      this.props.dispatcher.postError(error)
    })

    ipcRenderer.on(
      'certificate-error',
      (
        event: Electron.IpcRendererEvent,
        {
          certificate,
          error,
          url,
        }: { certificate: Electron.Certificate; error: string; url: string }
      ) => {
        this.props.dispatcher.showPopup({
          type: PopupType.UntrustedCertificate,
          certificate,
          url,
        })
      }
    )
  }

  public componentWillUnmount() {
    window.clearInterval(this.updateIntervalHandle)
  }

  private performDeferredLaunchActions() {
    // Loading emoji is super important but maybe less important that loading
    // the app. So defer it until we have some breathing space.
    this.props.appStore.loadEmoji()

    this.props.dispatcher.installGlobalLFSFilters(false)

    setInterval(() => this.checkForUpdates(true), UpdateCheckInterval)
    this.checkForUpdates(true)

    log.info(`launching: ${getVersion()} (${getOS()})`)
    log.info(`execPath: '${process.execPath}'`)
  }

  private onMenuEvent(name: MenuEvent): any {
    // Don't react to menu events when an error dialog is shown.
    if (this.state.errors.length) {
      return
    }

    log.info(`onMenuEvent: '${name}'`)

    switch (name) {
      case 'push':
        return this.push()
      case 'force-push':
        return this.push({ forceWithLease: true })
      case 'pull':
        return this.pull()
      case 'show-changes':
        return this.showChanges()
      case 'show-stashes':
        return this.showStashes()
      case 'show-history':
        return this.showHistory()
      case 'choose-repository':
        return this.chooseRepository()
      case 'add-local-repository':
        return this.showAddLocalRepo()
      case 'create-branch':
        return this.showCreateBranch()
      case 'show-branches':
        return this.showBranches()
      case 'show-tags':
        return this.showTags()
      case 'remove-repository':
        return this.removeRepository(this.getRepository())
      case 'create-repository':
        return this.showCreateRepository()
      case 'rename-branch':
        return this.renameBranch()
      case 'delete-branch':
        return this.deleteBranch()
      case 'discard-all-changes':
        return this.discardAllChanges()
      case 'show-preferences':
        return this.props.dispatcher.showPopup({ type: PopupType.Preferences })
      case 'open-working-directory':
        return this.openCurrentRepositoryWorkingDirectory()
      case 'update-branch':
        return this.updateBranch()
      case 'commit-changes':
        const repository = this.state.selectedState?.repository
        if (!repository || repository instanceof CloningRepository) {
          return
        }
        return dispatcher.showPopup({
          type: PopupType.Commit,
          repository
        })
      case 'merge-branch':
        return this.mergeBranch()
      case 'rebase-branch':
        return this.showRebaseDialog()
      case 'show-repository-settings':
        return this.showRepositorySettings()
      case 'view-repository-on-github':
        return this.viewRepositoryOnGitHub()
      case 'create-issue-in-repository-on-github':
        return this.openIssueCreationOnGitHub()
      case 'open-in-shell':
        return this.openCurrentRepositoryInShell()
      case 'clone-repository':
        return this.showCloneRepo()
      case 'show-about':
        return this.showAbout()
      case 'boomtown':
        return setImmediate(() => {
          throw new Error('Boomtown!')
        })
      case 'go-to-commit-message':
        return this.goToCommitMessage()
      case 'open-pull-request':
        return this.openPullRequest()
      case 'install-cli':
        return this.props.dispatcher.installCLI()
      case 'open-external-editor':
        return this.openCurrentRepositoryInExternalEditor()
      case 'select-all':
        return this.selectAll()
      case 'show-release-notes-popup':
        return this.showFakeReleaseNotesPopup()
      case 'test-prune-branches':
        if (!__DEV__) { return }
        return this.props.appStore._testPruneBranches()
      case 'find-text':
        return this.findText()
      default:
        return assertNever(name, `Unknown menu event name: ${name}`)
    }
  }

  /**
   * Show a release notes popup for a fake release, intended only to
   * make it easier to verify changes to the popup. Has no meaning
   * about a new release being available.
   */
  private showFakeReleaseNotesPopup() {
    this.props.dispatcher.showPopup({
      type: PopupType.ReleaseNotes,
      newRelease: {
        latestVersion: '42.7.99',
        datePublished: 'Awesomeber 71, 2025',
        pretext:
          'There is something so different here that we wanted to include some pretext for it',
        enhancements: [
          {
            kind: 'new',
            message: 'Tags list',
          },
          {
            kind: 'new',
            message: 'Stashes tab',
          },
          {
            kind: 'new',
            message: 'Quick stash and discard buttons',
          },
          {
            kind: 'new',
            message: 'Delete branch option in branch context menu',
          },

          {
            kind: 'new',
            message: 'Create branch here in history context menu',
          },
          {
            kind: 'new',
            message: 'Reset to this commit in history context menu',
          },
          {
            kind: 'new',
            message: 'On clear branch new merge into button',
          },
          {
            kind: 'new',
            message: 'On clear branch new cherry-pick into button',
          },
        ],
        bugfixes: [

        ],
        other: [
          {
            kind: 'other',
            message: 'Some performance improvements...',
          },
        ],
      },
    })
  }

  /**
   * Handler for the 'select-all' menu event, dispatches
   * a custom DOM event originating from the element which
   * currently has keyboard focus. Components have a chance
   * to intercept this event and implement their own 'select
   * all' logic.
   */
  private selectAll() {
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

  /**
   * Handler for the 'find-text' menu event, dispatches
   * a custom DOM event originating from the element which
   * currently has keyboard focus (or the document if no element
   * has focus). Components have a chance to intercept this
   * event and implement their own 'find-text' logic. One
   * example of this custom event is the text diff which
   * will trigger a search dialog when seeing this event.
   */
  private findText() {
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

  private async goToCommitMessage() {
    await this.showChanges()
    this.props.dispatcher.setCommitMessageFocus(true)
  }

  private checkForUpdates(inBackground: boolean) {
    if (__LINUX__) {
      return
    }

    if (
      __RELEASE_CHANNEL__ === 'development' ||
      __RELEASE_CHANNEL__ === 'test'
    ) {
      return
    }

    updateStore.checkForUpdates(inBackground)
  }

  private getDotComAccount(): Account | null {
    const dotComAccount = this.state.accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    return dotComAccount || null
  }

  private getEnterpriseAccount(): Account | null {
    const enterpriseAccount = this.state.accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )
    return enterpriseAccount || null
  }

  private updateBranch() {
    const { selectedState } = this.state
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

    this.props.dispatcher.mergeBranch(
      selectedState.repository,
      defaultBranch.name,
    )
  }

  private mergeBranch() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.MergeBranch,
      repository: state.repository,
    })
  }

  private openCurrentRepositoryWorkingDirectory() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.showRepository(state.repository)
  }

  private renameBranch() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip
    if (tip.kind === TipState.Valid) {
      this.props.dispatcher.showPopup({
        type: PopupType.RenameBranch,
        repository: state.repository,
        branch: tip.branch,
      })
    }
  }

  private deleteBranch() {
    const state = this.state.selectedState
    if (state === null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip

    if (tip.kind === TipState.Valid) {
      const currentPullRequest = state.state.branchesState.currentPullRequest
      if (currentPullRequest !== null) {
        this.props.dispatcher.showPopup({
          type: PopupType.DeletePullRequest,
          repository: state.repository,
          branch: tip.branch,
          pullRequest: currentPullRequest,
        })
      } else {
        const existsOnRemote = state.state.aheadBehind !== null

        this.props.dispatcher.showPopup({
          type: PopupType.DeleteBranch,
          repository: state.repository,
          branch: tip.branch,
          existsOnRemote: existsOnRemote,
        })
      }
    }
  }

  private discardAllChanges() {
    const state = this.state.selectedState

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const { workingDirectory } = state.state.changesState

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: state.repository,
      files: workingDirectory.files,
      showDiscardChangesSetting: false,
      discardingAllChanges: true,
    })
  }

  private showAddLocalRepo = () => {
    return this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private showCreateRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }

  private showCloneRepo = (cloneUrl?: string) => {
    let initialURL: string | null = null

    if (cloneUrl !== undefined) {
      this.props.dispatcher.changeCloneRepositoriesTab(
        CloneRepositoryTab.Generic
      )
      initialURL = cloneUrl
    }

    return this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL,
    })
  }

  private showAbout() {
    this.props.dispatcher.showPopup({ type: PopupType.About })
  }

  private async showHistory(showBranchList: boolean = false) {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    await this.props.dispatcher.closeCurrentFoldout()

    await this.props.dispatcher.initializeCompare(state.repository, {
      kind: HistoryTabMode.History,
    })

    await this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.History
    )

    await this.props.dispatcher.updateCompareForm(state.repository, {
      filterText: '',
      showBranchList,
    })
  }

  private showChanges() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.closeCurrentFoldout()
    return this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Changes
    )
  }

  private showStashes() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.closeCurrentFoldout()
    return this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Stash
    )
  }

  private chooseRepository() {
    if (
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Repository
    ) {
      return this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }

    return this.props.dispatcher.showFoldout({
      type: FoldoutType.Repository,
    })
  }

  private showBranches() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Branch
    ) {
      return this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    }

    return this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
  }

  private showTags() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Tags
    ) {
      return this.props.dispatcher.closeFoldout(FoldoutType.Tags)
    }

    return this.props.dispatcher.showFoldout({ type: FoldoutType.Tags })
  }

  private push(options?: { forceWithLease: boolean }) {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (options && options.forceWithLease) {
      this.props.dispatcher.confirmOrForcePush(state.repository)
    } else {
      this.props.dispatcher.push(state.repository)
    }
  }

  private async pull() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.pull(state.repository)
  }

  public componentDidMount() {
    document.ondragover = e => {
      if (e.dataTransfer != null) {
        if (this.isShowingModal) {
          e.dataTransfer.dropEffect = 'none'
        } else {
          e.dataTransfer.dropEffect = 'copy'
        }
      }

      e.preventDefault()
    }

    document.ondrop = e => {
      e.preventDefault()
    }

    document.body.ondrop = e => {
      if (this.isShowingModal) {
        return
      }
      if (e.dataTransfer != null) {
        const files = e.dataTransfer.files
        this.handleDragAndDrop(files)
      }
      e.preventDefault()
    }
  }

  private async handleDragAndDrop(fileList: FileList) {
    const paths: string[] = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      paths.push(file.path)
    }

    // If they're bulk adding repositories then just blindly try to add them.
    // But if they just dragged one, use the dialog so that they can initialize
    // it if needed.
    if (paths.length > 1) {

    } else {
      // user may accidentally provide a folder within the repository
      // this ensures we use the repository root, if it is actually a repository
      // otherwise we consider it an untracked repository
      const first = paths[0]
      const path = (await validatedRepositoryPath(first)) || first

      const existingRepository = matchExistingRepository(
        this.state.repositories,
        path
      )

      if (existingRepository) {
        await this.props.dispatcher.selectRepository(existingRepository)
      } else {
        await this.showPopup({
          type: PopupType.AddRepository,
          path,
        })
      }
    }
  }

  private removeRepository = (
    repository: Repository | CloningRepository | null
  ) => {
    if (!repository) {
      return
    }

    if (repository instanceof CloningRepository || repository.missing) {
      this.props.dispatcher.removeRepositories([repository], false)
      return
    }

    if (this.state.askForConfirmationOnRepositoryRemoval) {
      this.props.dispatcher.showPopup({
        type: PopupType.RemoveRepository,
        repository,
      })
    } else {
      this.props.dispatcher.removeRepositories([repository], false)
    }
  }

  private getRepository(): Repository | CloningRepository | null {
    const state = this.state.selectedState
    if (state == null) {
      return null
    }

    return state.repository
  }

  private showRebaseDialog() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }

    const repositoryState = this.props.repositoryStateManager.get(repository)

    const initialStep = initializeNewRebaseFlow(repositoryState)

    this.props.dispatcher.setRebaseFlowStep(repository, initialStep)

    this.props.dispatcher.showPopup({
      type: PopupType.RebaseFlow,
      repository,
    })
  }

  private showRepositorySettings() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }
    this.props.dispatcher.showPopup({
      type: PopupType.RepositorySettings,
      repository,
    })
  }

  /**
   * Opens a browser to the issue creation page
   * of the current GitHub repository.
   */
  private openIssueCreationOnGitHub() {
    const repository = this.getRepository()
    // this will likely never be null since we disable the
    // issue creation menu item for non-GitHub repositories
    if (repository instanceof Repository) {
      this.props.dispatcher.openIssueCreationPage(repository)
    }
  }

  private viewRepositoryOnGitHub() {
    const repository = this.getRepository()

    if (repository instanceof Repository) {
      const url = getGitHubHtmlUrl(repository)

      if (url) {
        this.props.dispatcher.openInBrowser(url)
      }
    }
  }

  private openCurrentRepositoryInShell = () => {
    const repository = this.getRepository()
    if (!repository) {
      return
    }

    this.openInShell(repository)
  }

  private openCurrentRepositoryInExternalEditor() {
    const repository = this.getRepository()
    if (!repository) {
      return
    }

    this.openInExternalEditor(repository)
  }

  /**
   * Conditionally renders a menu bar. The menu bar is currently only rendered
   * on Windows.
   */
  private renderAppMenuBar() {
    // We only render the app menu bar on Windows
    if (!__WIN32__) {
      return null
    }

    // Have we received an app menu from the main process yet?
    if (!this.state.appMenuState.length) {
      return null
    }

    // Don't render the menu bar during the welcome flow
    if (this.state.showWelcomeFlow) {
      return null
    }

    const currentFoldout = this.state.currentFoldout

    // AppMenuBar requires us to pass a strongly typed AppMenuFoldout state or
    // null if the AppMenu foldout is not currently active.
    const foldoutState =
      currentFoldout && currentFoldout.type === FoldoutType.AppMenu
        ? currentFoldout
        : null

    return (
      <AppMenuBar
        appMenu={this.state.appMenuState}
        dispatcher={this.props.dispatcher}
        highlightAppMenuAccessKeys={this.state.highlightAccessKeys}
        foldoutState={foldoutState}
        onLostFocus={this.onMenuBarLostFocus}
      />
    )
  }

  private onMenuBarLostFocus = () => {
    // Note: This event is emitted in an animation frame separate from
    // that of the AppStore. See onLostFocusWithin inside of the AppMenuBar
    // for more details. This means that it's possible that the current
    // app state in this component's state might be out of date so take
    // caution when considering app state in this method.
    this.props.dispatcher.closeFoldout(FoldoutType.AppMenu)
    this.props.dispatcher.setAppMenuState(menu => menu.withReset())
  }

  private renderTitlebar() {
    const inFullScreen = this.state.windowState === 'full-screen'

    const menuBarActive =
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.AppMenu

    // When we're in full-screen mode on Windows we only need to render
    // the title bar when the menu bar is active. On other platforms we
    // never render the title bar while in full-screen mode.
    if (inFullScreen) {
      if (!__WIN32__ || !menuBarActive) {
        return null
      }
    }

    const showAppIcon = __WIN32__ && !this.state.showWelcomeFlow
    const inWelcomeFlow = this.state.showWelcomeFlow
    const inNoRepositoriesView = this.inNoRepositoriesViewState()

    // The light title bar style should only be used while we're in
    // the welcome flow as well as the no-repositories blank slate
    // on macOS. The latter case has to do with the application menu
    // being part of the title bar on Windows. We need to render
    // the app menu in the no-repositories blank slate on Windows but
    // the menu doesn't support the light style at the moment so we're
    // forcing it to use the dark style.
    const titleBarStyle =
      inWelcomeFlow || (__DARWIN__ && inNoRepositoriesView) ? 'light' : 'dark'

    return (
      <TitleBar
        showAppIcon={showAppIcon}
        titleBarStyle={titleBarStyle}
        windowState={this.state.windowState}
        windowZoomFactor={this.state.windowZoomFactor}
      >
        {this.renderAppMenuBar()}
      </TitleBar>
    )
  }

  private onContinueWithUntrustedCertificate = (certificate: Electron.Certificate) => {
    showCertificateTrustDialog(
      certificate,
      'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.'
    )
  }

  private onUpdateAvailableDismissed = () =>
    this.props.dispatcher.setUpdateBannerVisibility(false)

  private currentPopupContent(): JSX.Element | null {
    // Hide any dialogs while we're displaying an error
    if (this.state.errors.length) { return null }
    return <AppPopup
      appStore={this.props.appStore}
      popup={this.state.currentPopup}
      dispatcher={this.props.dispatcher}
      repositoryStateManager={this.props.repositoryStateManager}
      askForConfirmationOnDiscardChanges={this.state.askForConfirmationOnDiscardChanges}
      askForConfirmationOnRepositoryRemoval={this.state.askForConfirmationOnRepositoryRemoval}
      askForConfirmationOnForcePush={this.state.askForConfirmationOnForcePush}
      dotComAccount={this.getDotComAccount()}
      enterpriseAccount={this.getEnterpriseAccount()}
      uncommittedChangesStrategyKind={this.state.uncommittedChangesStrategyKind}
      selectedExternalEditor={this.state.selectedExternalEditor}
      automaticallySwitchTheme={this.state.automaticallySwitchTheme}
      selectedShell={this.state.selectedShell}
      selectedTheme={this.state.selectedTheme}
      emoji={this.state.emoji}
      signInState={this.state.signInState}
      selectedCloneRepositoryTab={this.state.selectedCloneRepositoryTab}
      apiRepositories={this.state.apiRepositories}
      accounts={this.state.accounts}
      onContinueWithUntrustedCertificate={this.onContinueWithUntrustedCertificate}
      selectedState={this.state.selectedState}
      resolvedExternalEditor={this.state.resolvedExternalEditor}
      onShowRebaseConflictsBanner={this.onShowRebaseConflictsBanner}
      openCurrentRepositoryInShell={this.openCurrentRepositoryInShell}
    />
  }

  private onShowRebaseConflictsBanner = (
    repository: Repository,
    targetBranch: string
  ) => {
    this.props.dispatcher.setBanner({
      type: BannerType.RebaseConflictsFound,
      targetBranch,
      onOpenDialog: async () => {
        const { changesState } = this.props.repositoryStateManager.get(
          repository
        )
        const { conflictState } = changesState

        if (conflictState === null || conflictState.kind === 'merge') {
          log.debug(
            `[App.onShowRebasConflictsBanner] no conflict state found, ignoring...`
          )
          return
        }

        await this.props.dispatcher.setRebaseProgressFromState(repository)

        const initialStep = initializeRebaseFlowForConflictedRepository(
          conflictState
        )

        this.props.dispatcher.setRebaseFlowStep(repository, initialStep)

        this.props.dispatcher.showPopup({
          type: PopupType.RebaseFlow,
          repository,
        })
      },
    })
  }

  private onRefreshRepositories = (account: Account) => {
    this.props.dispatcher.refreshApiRepositories(account)
  }

  private renderPopup() {
    const popupContent = this.currentPopupContent()

    return (
      <TransitionGroup>
        {popupContent && (
          <CSSTransition classNames="modal" timeout={dialogTransitionTimeout}>
            {popupContent}
          </CSSTransition>
        )}
      </TransitionGroup>
    )
  }

  private renderZoomInfo() {
    return <ZoomInfo windowZoomFactor={this.state.windowZoomFactor} />
  }

  private renderFullScreenInfo() {
    return <FullScreenInfo windowState={this.state.windowState} />
  }

  private clearError = (error: Error) => this.props.dispatcher.clearError(error)

  private renderAppError() {
    return (
      <AppError
        errors={this.state.errors}
        onClearError={this.clearError}
        onShowPopup={this.showPopup}
        onRetryAction={this.onRetryAction}
      />
    )
  }

  private onRetryAction = (retryAction: RetryAction) => {
    this.props.dispatcher.performRetry(retryAction)
  }

  private showPopup = (popup: Popup) => {
    this.props.dispatcher.showPopup(popup)
  }

  private renderApp() {
    return (
      <div id="desktop-app-contents">
        {this.renderToolbar()}
        {this.renderBanner()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderAppError()}
      </div>
    )
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState
      ? this.state.selectedState.repository
      : null
    const externalEditorLabel = this.state.selectedExternalEditor
      ? this.state.selectedExternalEditor
      : undefined
    const shellLabel = this.state.selectedShell
    const filterText = this.state.repositoryFilterText
    return (
      <RepositoriesList
        filterText={filterText}
        onFilterTextChanged={this.onRepositoryFilterTextChanged}
        selectedRepository={selectedRepository}
        onSelectionChanged={this.onSelectionChanged}
        repositories={this.state.repositories}
        recentRepositories={this.state.recentRepositories}
        localRepositoryStateLookup={this.state.localRepositoryStateLookup}
        askForConfirmationOnRemoveRepository={
          this.state.askForConfirmationOnRepositoryRemoval
        }
        onRemoveRepository={this.removeRepository}
        onOpenInShell={this.openInShell}
        onShowRepository={this.showRepository}
        onOpenInExternalEditor={this.openInExternalEditor}
        externalEditorLabel={externalEditorLabel}
        shellLabel={shellLabel}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private openInShell = (repository: Repository | CloningRepository) => {
    if (!(repository instanceof Repository)) {
      return
    }

    this.props.dispatcher.openShell(repository.path)
  }

  private openFileInExternalEditor = (fullPath: string) => {
    this.props.dispatcher.openInExternalEditor(fullPath)
  }

  private openInExternalEditor = (
    repository: Repository | CloningRepository
  ) => {
    if (!(repository instanceof Repository)) {
      return
    }

    this.props.dispatcher.openInExternalEditor(repository.path)
  }

  private showRepository = (repository: Repository | CloningRepository) => {
    if (!(repository instanceof Repository)) {
      return
    }

    shell.showFolderContents(repository.path)
  }

  private renderRepositoryToolbarButton() {
    return <ToolbarRepositoryButton
      repository={this.state.selectedState?.repository}
      currentFoldout={this.state.currentFoldout}
      renderRepositoryList={this.renderRepositoryList}
      repositoriesCount={this.state.repositories.length}
    />
  }

  private renderPushPullToolbarButton() {
    return <ToolbarPushPullButton
      selectedState={this.state.selectedState}
    />
  }

  private showCreateBranch = () => {
    const selection = this.state.selectedState

    // NB: This should never happen but in the case someone
    // manages to delete the last repository while the drop down is
    // open we'll just bail here.
    if (!selection || selection.type !== SelectionType.Repository) {
      return
    }

    // We explicitly disable the menu item in this scenario so this
    // should never happen.
    if (selection.state.branchesState.tip.kind === TipState.Unknown) {
      return
    }

    const repository = selection.repository

    const state = this.props.repositoryStateManager.get(repository)
    const currentBranchProtected = state.changesState.currentBranchProtected

    return this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
      currentBranchProtected,
    })
  }

  private openPullRequest = () => {
    const state = this.state.selectedState

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const currentPullRequest = state.state.branchesState.currentPullRequest
    const dispatcher = this.props.dispatcher

    if (currentPullRequest == null) {
      dispatcher.createPullRequest(state.repository)
    } else {
      dispatcher.showPullRequest(state.repository)
    }
  }

  private renderTagsToolbarButton(): JSX.Element | null {
    const selection = this.state.selectedState

    if (selection == null || selection.type !== SelectionType.Repository) {
      return null
    }

    const repository = selection.repository
    const currentTagName = this.props.appStore.getCurrentTagName(repository)
    return <ToolbarTagsButton
      currentFoldout={this.state.currentFoldout}
      currentTag={currentTagName}
      tagList={this.props.appStore.repositoryTags(repository)}
      repository={repository} />
  }

  private renderBranchToolbarButton(): JSX.Element | null {
    return <ToolbarBranchButton
      uncommittedChangesStrategyKind={this.state.uncommittedChangesStrategyKind}
      selectionType={this.state.selectedState?.type}
      repository={this.state.selectedState?.repository}
      state={this.state.selectedState?.state}
      currentFoldout={this.state.currentFoldout}
    />
  }

  // we currently only render one banner at a time
  private renderBanner(): JSX.Element | null {
    // The inset light title bar style without the toolbar
    // can't support banners at the moment. So for the
    // no-repositories blank slate we'll have to live without
    // them.
    if (this.inNoRepositoriesViewState()) {
      return null
    }

    let banner = null
    if (this.state.currentBanner !== null) {
      banner = renderBanner(
        this.state.currentBanner,
        this.props.dispatcher,
        this.onBannerDismissed
      )
    } else if (this.state.isUpdateAvailableBannerVisible) {
      banner = this.renderUpdateBanner()
    }
    return (
      <TransitionGroup>
        {banner && (
          <CSSTransition classNames="banner" timeout={bannerTransitionTimeout}>
            {banner}
          </CSSTransition>
        )}
      </TransitionGroup>
    )
  }

  private renderUpdateBanner() {
    return (
      <UpdateAvailable
        dispatcher={this.props.dispatcher}
        newRelease={updateStore.state.newRelease}
        onDismissed={this.onUpdateAvailableDismissed}
        key={'update-available'}
      />
    )
  }

  private onBannerDismissed = () => {
    this.props.dispatcher.clearBanner()
  }

  private renderToolbar() {
    /**
     * No toolbar if we're in the blank slate view.
     */
    if (this.inNoRepositoriesViewState()) {
      return null
    }

    return (
      <Toolbar id="desktop-app-toolbar">
        <div
          className="sidebar-section"
          style={{ width: this.state.sidebarWidth }}
        >
          {this.renderRepositoryToolbarButton()}
        </div>
        {this.renderBranchToolbarButton()}
        {this.renderTagsToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private renderRepository() {
    const state = this.state
    if (this.inNoRepositoriesViewState()) {
      return (
        <NoRepositoriesView
          dotComAccount={this.getDotComAccount()}
          enterpriseAccount={this.getEnterpriseAccount()}
          onCreate={this.showCreateRepository}
          onClone={this.showCloneRepo}
          onAdd={this.showAddLocalRepo}
          apiRepositories={state.apiRepositories}
          onRefreshRepositories={this.onRefreshRepositories}
        />
      )
    }


    const selectedState = state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected />
    }

    if (selectedState.type === SelectionType.Repository) {
      const externalEditorLabel = state.selectedExternalEditor
        ? state.selectedExternalEditor
        : undefined

      return (
        <RepositoryView
          // When switching repositories we want to remount the RepositoryView
          // component to reset the scroll positions.
          key={selectedState.repository.hash}
          repository={selectedState.repository}
          state={selectedState.state}
          dispatcher={this.props.dispatcher}
          emoji={state.emoji}
          sidebarWidth={state.sidebarWidth}
          commitSummaryWidth={state.commitSummaryWidth}
          stashedFilesWidth={state.stashedFilesWidth}
          issuesStore={this.props.issuesStore}
          gitHubUserStore={this.props.gitHubUserStore}
          onViewCommitOnGitHub={this.onViewCommitOnGitHub}
          imageDiffType={state.imageDiffType}
          hideWhitespaceInDiff={state.hideWhitespaceInDiff}
          askForConfirmationOnDiscardChanges={
            state.askForConfirmationOnDiscardChanges
          }
          accounts={state.accounts}
          externalEditorLabel={externalEditorLabel}
          resolvedExternalEditor={state.resolvedExternalEditor}
          onOpenInExternalEditor={this.openFileInExternalEditor}
          appMenu={state.appMenuState[0]}
          isShowingModal={this.isShowingModal}
          isShowingFoldout={this.state.currentFoldout !== null}
          stashesCount={this.state.localStashesCount}
        />
      )
    } else if (selectedState.type === SelectionType.CloningRepository) {
      return (
        <CloningRepositoryView
          repository={selectedState.repository}
          progress={selectedState.progress}
        />
      )
    } else if (selectedState.type === SelectionType.MissingRepository) {
      return (
        <MissingRepository
          repository={selectedState.repository}
          dispatcher={this.props.dispatcher}
        />
      )
    } else {
      return assertNever(selectedState, `Unknown state: ${selectedState}`)
    }
  }

  private renderWelcomeFlow() {
    return (
      <Welcome
        dispatcher={this.props.dispatcher}
        accounts={this.state.accounts}
        signInState={this.state.signInState}
      />
    )
  }

  public render() {
    if (this.loading) {
      return null
    }

    const className = this.state.appIsFocused ? 'focused' : 'blurred'

    const currentTheme = this.state.showWelcomeFlow
      ? ApplicationTheme.Light
      : this.state.selectedTheme

    return (
      <div id="desktop-app-chrome" className={className}>
        <AppTheme theme={currentTheme} />
        {this.renderTitlebar()}
        {this.state.showWelcomeFlow
          ? this.renderWelcomeFlow()
          : this.renderApp()}
        {this.renderZoomInfo()}
        {this.renderFullScreenInfo()}
        <KeyEventsHandler
          appMenuState={this.state.appMenuState}
          currentFoldout={this.state.currentFoldout}
          isShowingModal={this.isShowingModal}
        />
      </div>
    )
  }

  private onRepositoryFilterTextChanged = (text: string) => {
    this.props.dispatcher.setRepositoryFilterText(text)
  }

  private onSelectionChanged = (repository: Repository | CloningRepository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
  }

  private onViewCommitOnGitHub = async (SHA: string) => {
    const repository = this.getRepository()

    if (
      !repository ||
      repository instanceof CloningRepository ||
      !repository.gitHubRepository
    ) {
      return
    }

    const baseURL = repository.gitHubRepository.htmlURL

    if (baseURL) {
      this.props.dispatcher.openInBrowser(`${baseURL}/commit/${SHA}`)
    }
  }

  private inNoRepositoriesViewState() {
    return this.state.repositories.length === 0
  }
}

function NoRepositorySelected() {
  return <div className="panel blankslate">No repository selected</div>
}
