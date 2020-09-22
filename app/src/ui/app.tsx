import * as React from 'react'
import { ipcRenderer } from 'electron'
import { CSSTransition, TransitionGroup } from 'react-transition-group'

import { FoldoutType, IAppState, SelectionType } from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { AppStore, GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { UpdateStatus, updateStore } from './lib/update-store'
import { matchExistingRepository } from '../lib/repository-matching'
import { getVersion } from './lib/app-proxy'
import { getOS } from '../lib/get-os'
import { validatedRepositoryPath } from '../lib/stores/helpers/validated-repository-path'

import { FullScreenInfo, TitleBar, ZoomInfo } from './window'
import { RepositoryView } from './repository'
import { CloningRepositoryView } from './cloning-repository'
import { Toolbar } from './toolbar'
import { sendReady } from './main-process-proxy'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { renderBanner, UpdateAvailable } from './banners'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { NoRepositoriesView } from './no-repositories'
import { AppTheme } from './app-theme'
import { ApplicationTheme } from './lib/application-theme'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { PopupType } from '../models/popup'
import { ToolbarTagsButton } from './toolbar/toolbar-tags-button'
import { AppPopup } from './popups/AppPopup'
import { KeyEventsHandler } from './key-events-handler'
import { ToolbarRepositoryButton } from './toolbar/toolbar-repository-button'
import { ToolbarBranchButton } from './toolbar/toolbar-branch-button'
import { ToolbarPushPullButton } from './toolbar/toolbar-push-pull-button'
import { MenuEventHandlerView } from './menu-event-handler-view'
import { connect, IGlobalState } from './index'
import { ToolbarStashButton } from './toolbar/toolbar-stash-button'
import { ToolbarDiscardButton } from './toolbar/toolbar-discard-button'
import { ToolbarUndoButton } from './toolbar/toolbar-undo-button'

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
}

interface IProps {
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

const mapStateToProps = (state: IGlobalState): IAppProps => {
  return {
    dispatcher: state.dispatcher,
    appStore: state.appStore,
    gitHubUserStore: state.gitHubUserStore,
    issuesStore: state.issuesStore,
    repositoryStateManager: state.repositoryStateManager
  }
}

class LocalApp extends React.Component<IAppProps & IProps, IAppState> {
  private loading = true

  private updateIntervalHandle?: number

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup !== null || this.state.errors.length > 0
  }

  public constructor(props: IAppProps & IProps) {
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

    this.props.dispatcher.installGlobalLFSFilters(false)

    setInterval(() => this.checkForUpdates(true), UpdateCheckInterval)
    this.checkForUpdates(true)

    log.info(`launching: ${getVersion()} (${getOS()})`)
    log.info(`execPath: '${process.execPath}'`)
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
        await this.props.dispatcher.showPopup({
          type: PopupType.AddRepository,
          path,
        })
      }
    }
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
      />
    )
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
      dotComAccount={this.props.appStore.getDotComAccount()}
      enterpriseAccount={this.props.appStore.getEnterpriseAccount()}
      uncommittedChangesStrategyKind={this.state.uncommittedChangesStrategyKind}
      selectedExternalEditor={this.state.selectedExternalEditor}
      automaticallySwitchTheme={this.state.automaticallySwitchTheme}
      selectedShell={this.state.selectedShell}
      selectedTheme={this.state.selectedTheme}
      signInState={this.state.signInState}
      selectedCloneRepositoryTab={this.state.selectedCloneRepositoryTab}
      apiRepositories={this.state.apiRepositories}
      selectedState={this.state.selectedState}
      resolvedExternalEditor={this.state.resolvedExternalEditor}
    />
  }



  private renderPopup() {
    const popupContent = this.currentPopupContent()
    if (!popupContent) return null

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

  private renderAppError() {
    if (this.state.errors.length === 0) return null
    return (
      <AppError errors={this.state.errors} />
    )
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

  private renderTagsToolbarButton(): JSX.Element | null {
    const repository = this.props.appStore.getRepository()
    if (!repository) return null
    return <ToolbarTagsButton />
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
      banner = renderBanner(this.state.currentBanner)
    } else if (this.state.isUpdateAvailableBannerVisible) {
      banner = this.renderUpdateBanner()
    }
    return (
      <TransitionGroup>
        {banner && (
          <CSSTransition classNames={{
            appearActive: "banner",
            enterActive: "banner",
            enterDone: "banner",
            enter: "banner banner-enter",
            exit: "banner banner-exit"
          }} timeout={bannerTransitionTimeout}>
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
        key={'update-available'}
      />
    )
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
        <ToolbarRepositoryButton />
        <ToolbarBranchButton />
        {this.renderTagsToolbarButton()}
        <ToolbarPushPullButton />
        <div style={{flexGrow: 1}}/>
        <ToolbarUndoButton/>
        <ToolbarStashButton/>
        <ToolbarDiscardButton/>
      </Toolbar>
    )
  }

  private renderRepository() {
    const state = this.state
    if (this.inNoRepositoriesViewState()) {
      return (<NoRepositoriesView />)
    }


    const selectedState = state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected />
    }

    if (selectedState.type === SelectionType.Repository) {
      return (
        <RepositoryView
          // When switching repositories we want to remount the RepositoryView
          // component to reset the scroll positions.
          key={selectedState.repository.hash}
        />
      )
    } else if (selectedState.type === SelectionType.CloningRepository) {
      return (
        <CloningRepositoryView
          repositoryName={selectedState.repository.name}
          progress={selectedState.progress}
        />
      )
    } else if (selectedState.type === SelectionType.MissingRepository) {
      return (
        <MissingRepository repository={selectedState.repository} />
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
        <MenuEventHandlerView isHasError={this.state.errors.length > 0}/>
        <KeyEventsHandler
          appMenuState={this.state.appMenuState}
          currentFoldout={this.state.currentFoldout}
          isShowingModal={this.isShowingModal}
        />
      </div>
    )
  }

  private inNoRepositoriesViewState() {
    return this.state.repositories.length === 0
  }
}
export const App = connect<IAppProps, IAppState, IProps>(mapStateToProps)(LocalApp)

function NoRepositorySelected() {
  return <div className="panel blankslate">No repository selected</div>
}
