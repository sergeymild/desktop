import * as React from 'react'
import { Repository } from '../models/repository'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { NoChanges } from './changes/no-changes'
import { MultipleSelection } from './changes/multiple-selection'
import { FilesChangedBadge } from './changes/files-changed-badge'
import { CompareSidebar, SelectedCommit } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import { IRepositoryState, RepositorySectionTab } from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { assertNever } from '../lib/fatal-error'
import { FocusContainer } from './lib/focus-container'
import { Octicon, OcticonSymbol } from './octicons'
import { IStashEntry } from '../models/stash-entry'
import { enableNDDBBanner } from '../lib/feature-flag'
import { StashesSidebarContentView } from './stashes-view/stashes-sidebar-content-view'
import { StashesSidebarListView } from './stashes-view/stashes-sidebar-list-view'
import { SubmodulesButton } from './submodules-button'
import { connect, IGlobalState } from './index'

/** The widest the sidebar can be with the minimum window size. */
const MaxSidebarWidth = 700

interface IProps {
  readonly repository: Repository
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
  readonly sidebarWidth: number
  readonly stashesCount: number

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

const mapStateToProps = (state: IGlobalState): IProps => {
  return {
    dispatcher: state.dispatcher,
    state: state.appStore.possibleSelectedState!.state!,
    repository: state.appStore.selectedRepository as Repository,
    isShowingFoldout: state.appStore.currentFoldout !== null,
    isShowingModal: state.appStore.isShowingModal(),
    sidebarWidth: state.appStore.sidebarWidth,
    stashesCount: state.appStore.localStashesCount
  }
}

class LocalRepositoryView extends React.Component<IProps,
  IRepositoryViewState> {
  private previousSection: RepositorySectionTab = this.props.state
    .selectedSection

  public constructor(props: IProps) {
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
    const scrollTop =
      this.previousSection === RepositorySectionTab.History
        ? this.state.changesListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.Changes

    return (
      <ChangesSidebar
        onChangesListScrolled={this.onChangesListScrolled}
        changesListScrollTop={scrollTop}
      />
    )
  }

  private handleStashSelect = (item: IStashEntry) => {
    this.setState({ ...this.state, selectedStash: item })
  }

  private renderStashes(): JSX.Element {
    return <StashesSidebarListView handleStashSelect={this.handleStashSelect} />
  }

  private renderCompareSidebar(): JSX.Element {
    const scrollTop =
      this.previousSection === RepositorySectionTab.Changes
        ? this.state.compareListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.History

    return (
      <CompareSidebar
        onCompareListScrolled={this.onCompareListScrolled}
        compareListScrollTop={scrollTop}
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
          <SubmodulesButton />
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

  private renderContentForChanges(): JSX.Element | null {
    const { changesState } = this.props.state
    const { workingDirectory, selection } = changesState

    const { selectedFileIDs, diff } = selection

    if (selectedFileIDs.length > 1) {
      return <MultipleSelection count={selectedFileIDs.length}/>
    }

    if (workingDirectory.files.length === 0) {
      return <NoChanges key={this.props.repository.id} />
    } else {
      if (selectedFileIDs.length === 0) {
        return null
      }

      const selectedFile = workingDirectory.findFileWithID(selectedFileIDs[0])

      if (selectedFile === null) {
        return null
      }

      return (
        <Changes file={selectedFile} diff={diff} />
      )
    }
  }

  private renderContent(): JSX.Element | null {
    const selectedSection = this.props.state.selectedSection
    if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderContentForChanges()
    } else if (selectedSection === RepositorySectionTab.History) {
      return <SelectedCommit />
    } else if (selectedSection === RepositorySectionTab.Stash) {
      return <StashesSidebarContentView selectedStash={this.state.selectedStash} />
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

export const RepositoryView = connect(mapStateToProps)(LocalRepositoryView)