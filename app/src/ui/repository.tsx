import * as React from 'react'
import { Repository } from '../models/repository'
import { Commit } from '../models/commit'
import { TipState } from '../models/tip'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { NoChanges } from './changes/no-changes'
import { MultipleSelection } from './changes/multiple-selection'
import { FilesChangedBadge } from './changes/files-changed-badge'
import { CompareSidebar, SelectedCommit } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import { Foldout, IRepositoryState, RepositorySectionTab } from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { FocusContainer } from './lib/focus-container'
import { Octicon, OcticonSymbol } from './octicons'
import { ImageDiffType } from '../models/diff'
import { IMenu } from '../models/app-menu'
import { IStashEntry } from '../models/stash-entry'
import { enableNDDBBanner } from '../lib/feature-flag'
import { ExternalEditor } from '../lib/editors'
import { openFile } from './lib/open-file'
import { StashesSidebarContentView } from './stashes-view/stashes-sidebar-content-view'
import { StashesSidebarListView } from './stashes-view/stashes-sidebar-list-view'
import { SubmodulesButton } from './submodules-button'

/** The widest the sidebar can be with the minimum window size. */
const MaxSidebarWidth = 700

interface IRepositoryViewProps {
  readonly repository: Repository
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
  readonly sidebarWidth: number
  readonly commitSummaryWidth: number
  readonly stashedFilesWidth: number
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly imageDiffType: ImageDiffType
  readonly hideWhitespaceInDiff: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly stashesCount: number
  readonly currentFoldout: Foldout | null

  /**
   * A value indicating whether or not the application is currently presenting
   * a modal dialog such as the preferences, or an error dialog
   */
  readonly isShowingModal: boolean

  /**
   * A value indicating whether or not the application is currently presenting
   * a foldout dialog such as the file menu, or the branches dropdown
   */
  readonly isShowingFoldout: boolean

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /** A cached entry representing an external editor found on the user's machine */
  readonly resolvedExternalEditor: ExternalEditor | null

  /**
   * The top-level application menu item.
   */
  readonly appMenu: IMenu | undefined

}

interface IRepositoryViewState {
  readonly changesListScrollTop: number
  readonly compareListScrollTop: number
  selectedStash: IStashEntry | null
}

const enum Tab {
  Changes = 0,
  History = 1,
  Stash = 2,
}

export class RepositoryView extends React.Component<IRepositoryViewProps,
  IRepositoryViewState> {
  private previousSection: RepositorySectionTab = this.props.state
    .selectedSection

  public constructor(props: IRepositoryViewProps) {
    super(props)

    this.state = {
      changesListScrollTop: 0,
      compareListScrollTop: 0,
      selectedStash: null,
    }
  }

  private onChangesListScrolled = (scrollTop: number) => {
    this.setState({ changesListScrollTop: scrollTop })
  }

  private onCompareListScrolled = (scrollTop: number) => {
    this.setState({ compareListScrollTop: scrollTop })
  }

  private renderChangesBadge(): JSX.Element | null {
    const filesChangedCount = this.props.state.changesState.workingDirectory
      .files.length

    if (filesChangedCount <= 0) {
      return null
    }

    return <FilesChangedBadge filesChangedCount={filesChangedCount}/>
  }

  private renderStashesCount(): JSX.Element {
    return <FilesChangedBadge filesChangedCount={this.props.stashesCount}/>
  }

  private renderTabs(): JSX.Element {
    let selectedTab
    switch (this.props.state.selectedSection) {
      case RepositorySectionTab.Changes:
        selectedTab = Tab.Changes
        break
      case RepositorySectionTab.History:
        selectedTab = Tab.History
        break
      case RepositorySectionTab.Stash:
        selectedTab = Tab.Stash
        break
    }

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
        <span className="with-indicator">
          <span>Changes</span>
          {this.renderChangesBadge()}
        </span>

        <div className="with-indicator">
          <span>History</span>
          {enableNDDBBanner() &&
          this.props.state.compareState.divergingBranchBannerState
            .isNudgeVisible ? (
            <Octicon className="indicator" symbol={OcticonSymbol.dotFill}/>
          ) : null}
        </div>

        <span className="with-indicator">
          <span>Stashes</span>
          {this.renderStashesCount()}
        </span>
      </TabBar>
    )
  }

  private renderChangesSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip

    let branchName: string | null = null

    if (tip.kind === TipState.Valid) {
      branchName = tip.branch.name
    } else if (tip.kind === TipState.Unborn) {
      branchName = tip.ref
    }

    const localCommitSHAs = this.props.state.localCommitSHAs
    const mostRecentLocalCommitSHA =
      localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
    const mostRecentLocalCommit =
      (mostRecentLocalCommitSHA
        ? this.props.state.commitLookup.get(mostRecentLocalCommitSHA)
        : null) || null
    // -1 Because of right hand side border
    const availableWidth = this.props.sidebarWidth - 1

    const scrollTop =
      this.previousSection === RepositorySectionTab.History
        ? this.state.changesListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.Changes

    return (
      <ChangesSidebar
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        changes={this.props.state.changesState}
        branch={branchName}
        mostRecentLocalCommit={mostRecentLocalCommit}
        issuesStore={this.props.issuesStore}
        availableWidth={availableWidth}
        gitHubUserStore={this.props.gitHubUserStore}
        isCommitting={this.props.state.isCommitting}
        isPushPullFetchInProgress={this.props.state.isPushPullFetchInProgress}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        externalEditorLabel={this.props.externalEditorLabel}
        onChangesListScrolled={this.onChangesListScrolled}
        changesListScrollTop={scrollTop}
      />
    )
  }

  private handleStashSelect = (item: IStashEntry) => {
    this.setState({ ...this.state, selectedStash: item })
  }

  private renderStashes(): JSX.Element {
    return <StashesSidebarListView
      repository={this.props.repository}
      handleStashSelect={this.handleStashSelect}
      dispatcher={this.props.dispatcher}/>
  }

  private renderCompareSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

    const scrollTop =
      this.previousSection === RepositorySectionTab.Changes
        ? this.state.compareListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.History

    return (
      <CompareSidebar
        repository={this.props.repository}
        isLocalRepository={this.props.state.remote === null}
        compareState={this.props.state.compareState}
        selectedCommitSha={this.props.state.commitSelection.sha}
        currentBranch={currentBranch}
        commitLookup={this.props.state.commitLookup}
        localCommitSHAs={this.props.state.localCommitSHAs}
        localTags={this.props.state.localTags}
        dispatcher={this.props.dispatcher}
        onRevertCommit={this.onRevertCommit}
        onCompareListScrolled={this.onCompareListScrolled}
        compareListScrollTop={scrollTop}
        tagsToPush={this.props.state.tagsToPush}
      />
    )
  }

  private renderSidebarContents(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderChangesSidebar()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderCompareSidebar()
    } else if (selectedSection === RepositorySectionTab.Stash) {
      return this.renderStashes()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
  }

  private renderSubmodules(): JSX.Element | null {
    return <SubmodulesButton
      currentFoldout={this.props.currentFoldout}
      submodules={this.props.repository.submodules}
    />
  }

  private renderSidebar(): JSX.Element {
    return (
      <FocusContainer onFocusWithinChanged={this.onSidebarFocusWithinChanged}>
        <Resizable
          id="repository-sidebar"
          width={this.props.sidebarWidth}
          onReset={this.handleSidebarWidthReset}
          onResize={this.handleSidebarResize}
          maximumWidth={MaxSidebarWidth}
        >
          {this.renderSubmodules()}
          {this.renderTabs()}
          {this.renderSidebarContents()}
        </Resizable>
      </FocusContainer>
    )
  }

  private onSidebarFocusWithinChanged = (sidebarHasFocusWithin: boolean) => {
    if (
      sidebarHasFocusWithin === false &&
      this.props.state.selectedSection === RepositorySectionTab.History
    ) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }
  }


  private renderContentForHistory(): JSX.Element {
    const { commitSelection } = this.props.state

    const sha = commitSelection.sha

    const selectedCommit =
      sha != null ? this.props.state.commitLookup.get(sha) || null : null

    const { changedFiles, file, diff } = commitSelection

    return (
      <SelectedCommit
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        selectedCommit={selectedCommit}
        changedFiles={changedFiles}
        selectedFile={file}
        currentDiff={diff}
        commitSummaryWidth={this.props.commitSummaryWidth}
        selectedDiffType={this.props.imageDiffType}
        externalEditorLabel={this.props.externalEditorLabel}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onChangeImageDiffType={this.onChangeImageDiffType}
      />
    )
  }

  private renderContentForChanges(): JSX.Element | null {
    const { changesState } = this.props.state
    const { workingDirectory, selection } = changesState

    const { selectedFileIDs, diff } = selection

    if (selectedFileIDs.length > 1) {
      return <MultipleSelection count={selectedFileIDs.length}/>
    }

    if (workingDirectory.files.length === 0) {
      return (
        <NoChanges
          key={this.props.repository.id}
          repository={this.props.repository}
          repositoryState={this.props.state}
        />
      )
    } else {
      if (selectedFileIDs.length === 0) {
        return null
      }

      const selectedFile = workingDirectory.findFileWithID(selectedFileIDs[0])

      if (selectedFile === null) {
        return null
      }

      return (
        <Changes
          repository={this.props.repository}
          file={selectedFile}
          diff={diff}
          isCommitting={this.props.state.isCommitting}
          imageDiffType={this.props.imageDiffType}
          hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onChangeImageDiffType={this.onChangeImageDiffType}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
        />
      )
    }
  }

  private onOpenBinaryFile = async (fullPath: string) => {
    await openFile(fullPath, this.props.dispatcher)
  }

  private onChangeImageDiffType = async (imageDiffType: ImageDiffType) => {
    await this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderContent(): JSX.Element | null {
    const selectedSection = this.props.state.selectedSection
    if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderContentForChanges()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderContentForHistory()
    } else if (selectedSection === RepositorySectionTab.Stash) {
      return <StashesSidebarContentView
        selectedStash={this.state.selectedStash}
        repository={this.props.repository}
        commitSummaryWidth={this.props.commitSummaryWidth}
        dispatcher={this.props.dispatcher}
        selectedDiffType={this.props.imageDiffType}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onOpenBinaryFile={this.onOpenBinaryFile}/>
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  public render() {
    return (
      <UiView id="repository">
        {this.renderSidebar()}
        {this.renderContent()}
      </UiView>
    )
  }

  private onRevertCommit = (commit: Commit) => {
    this.props.dispatcher.revertCommit(this.props.repository, commit)
  }

  public async componentDidMount() {
    window.addEventListener('keydown', this.onGlobalKeyDown)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onGlobalKeyDown)
  }

  private onGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (this.props.isShowingModal || this.props.isShowingFoldout) {
      return
    }

    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (event.ctrlKey && event.key === 'Tab') {
      this.changeTab()
      event.preventDefault()
    }
  }

  private changeTab() {
    const section =
      this.props.state.selectedSection === RepositorySectionTab.History
        ? RepositorySectionTab.Changes
        : RepositorySectionTab.History

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section,
    )
  }

  private onTabClicked = (tab: Tab) => {
    let section
    if (tab === Tab.History) {
      section = RepositorySectionTab.History
    } else if (tab === Tab.Changes) {
      section = RepositorySectionTab.Changes
    } else {
      section = RepositorySectionTab.Stash
    }

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section,
    )
    if (!!section) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }
  }
}
