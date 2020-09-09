import * as React from 'react'
import { CSSTransition, TransitionGroup } from 'react-transition-group'

import { Commit } from '../../models/commit'
import { ComparisonMode, HistoryTabMode, ICompareBranch, ICompareState, IDisplayHistory } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { TextBox } from '../lib/text-box'
import { TabBar } from '../tab-bar'
import { FancyTextBox } from '../lib/fancy-text-box'
import { OcticonSymbol } from '../octicons'
import { Ref } from '../lib/ref'
import { DismissalReason, NewCommitsBanner } from '../notification/new-commits-banner'
import { MergeCallToActionWithConflicts } from './merge-call-to-action-with-conflicts'
import { assertNever } from '../../lib/fatal-error'
import { enableNDDBBanner } from '../../lib/feature-flag'
import { ITagItem } from '../../lib/git'

const DivergingBannerAnimationTimeout = 300

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly isLocalRepository: boolean
  readonly compareState: ICompareState
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly selectedCommitSha: string | null
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly onCompareListScrolled: (scrollTop: number) => void
  readonly compareListScrollTop?: number
  readonly localTags: ReadonlyArray<ITagItem> | null
  readonly tagsToPush: ReadonlyArray<string> | null
}

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<ICompareSidebarProps, {}> {
  private textbox: TextBox | null = null
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)
  private loadingMoreCommitsPromise: Promise<void> | null = null

  public componentDidMount() {
    this.props.dispatcher.setDivergingBranchNudgeVisibility(
      this.props.repository,
      false
    )
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompare(this.props.repository)
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public render() {
    const { filterText } = this.props.compareState

    return (
      <div id="compare-view">
        {enableNDDBBanner() && (
          <TransitionGroup>{this.renderNotificationBanner()}</TransitionGroup>
        )}

        <div className="compare-form">
          <FancyTextBox
            symbol={OcticonSymbol.gitCommit}
            type="search"
            placeholder="Type to search commit..."
            value={filterText}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onBranchFilterTextChanged}
            onSearchCleared={this.handleEscape}
          />
        </div>

        {this.renderCommits()}
      </div>
    )
  }

  private renderNotificationBanner() {
    const bannerState = this.props.compareState.divergingBranchBannerState

    if (!bannerState.isPromptVisible || bannerState.isPromptDismissed) {
      return null
    }

    const { inferredComparisonBranch } = this.props.compareState

    return inferredComparisonBranch.branch !== null &&
      inferredComparisonBranch.aheadBehind !== null &&
      inferredComparisonBranch.aheadBehind.behind > 0 ? (
      <CSSTransition
        classNames="diverge-banner"
        appear={true}
        timeout={DivergingBannerAnimationTimeout}
      >
        <div className="diverge-banner-wrapper">
          <NewCommitsBanner
            dispatcher={this.props.dispatcher}
            repository={this.props.repository}
            commitsBehindBaseBranch={
              inferredComparisonBranch.aheadBehind.behind
            }
            baseBranch={inferredComparisonBranch.branch}
            onDismiss={this.onNotificationBannerDismissed}
          />
        </div>
      </CSSTransition>
    ) : null
  }

  private renderCommits() {
    const formState = this.props.compareState.formState
    return (
      <div className="compare-commit-list">
        {formState.kind === HistoryTabMode.History
          ? this.renderCommitList()
          : this.renderTabBar(formState)}
      </div>
    )
  }

  private renderCommitList() {
    const { formState, commitSHAs } = this.props.compareState

    let emptyListMessage: string | JSX.Element
    if (formState.kind === HistoryTabMode.History) {
      emptyListMessage = 'No history'
    } else {
      const currentlyComparedBranchName = formState.comparisonBranch.name

      emptyListMessage =
        formState.comparisonMode === ComparisonMode.Ahead ? (
          <p>
            The compared branch (<Ref>{currentlyComparedBranchName}</Ref>) is up
            to date with your branch
          </p>
        ) : (
          <p>
            Your branch is up to date with the compared branch (
            <Ref>{currentlyComparedBranchName}</Ref>)
          </p>
        )
    }

    return (
      <CommitList
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        gitHubRepository={this.props.repository.gitHubRepository}
        isLocalRepository={this.props.isLocalRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={commitSHAs}
        selectedSHA={this.props.selectedCommitSha}
        localCommitSHAs={this.props.localCommitSHAs}
        emoji={this.props.emoji}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onRevertCommit={
          ableToRevertCommit(this.props.compareState.formState)
            ? this.props.onRevertCommit
            : undefined
        }
        onCommitSelected={this.onCommitSelected}
        onScroll={this.onScroll}
        onCreateTag={this.onCreateTag}
        onDeleteTag={this.onDeleteTag}
        emptyListMessage={emptyListMessage}
        onCompareListScrolled={this.props.onCompareListScrolled}
        compareListScrollTop={this.props.compareListScrollTop}
        tagsToPush={this.props.tagsToPush}
      />
    )
  }

  private renderActiveTab(view: ICompareBranch) {
    return (
      <div className="compare-commit-list">
        {this.renderCommitList()}
        {view.comparisonMode === ComparisonMode.Behind
          ? this.renderMergeCallToAction(view)
          : null}
      </div>
    )
  }


  private renderMergeCallToAction(formState: ICompareBranch) {
    if (this.props.currentBranch == null) {
      return null
    }

    return (
      <MergeCallToActionWithConflicts
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        mergeStatus={this.props.compareState.mergeStatus}
        currentBranch={this.props.currentBranch}
        comparisonBranch={formState.comparisonBranch}
        commitsBehind={formState.aheadBehind.behind}
      />
    )
  }

  private onTabClicked = (index: number) => {
    const formState = this.props.compareState.formState

    if (formState.kind === HistoryTabMode.History) {
      return
    }

    const comparisonMode =
      index === 0 ? ComparisonMode.Behind : ComparisonMode.Ahead
    const branch = formState.comparisonBranch

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.Compare,
      branch,
      comparisonMode,
    })
  }

  private renderTabBar(formState: ICompareBranch) {
    const selectedTab =
      formState.comparisonMode === ComparisonMode.Behind ? 0 : 1

    return (
      <div className="compare-content">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span>{`Behind (${formState.aheadBehind.behind})`}</span>
          <span>{`Ahead (${formState.aheadBehind.ahead})`}</span>
        </TabBar>
        {this.renderActiveTab(formState)}
      </div>
    )
  }



  private handleEscape = () => {
    this.clearFilterState()
    if (this.textbox) {
      this.textbox.blur()
    }
  }

  private onCommitSelected = (commit: Commit) => {
    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      commit.sha
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const compareState = this.props.compareState
    const formState = compareState.formState

    if (formState.kind === HistoryTabMode.Compare) {
      // as the app is currently comparing the current branch to some other
      // branch, everything needed should be loaded
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      if (this.loadingMoreCommitsPromise != null) {
        // as this callback fires for any scroll event we need to guard
        // against re-entrant calls to loadNextHistoryBatch
        return
      }

      this.loadingMoreCommitsPromise = this.props.dispatcher
        .loadNextCommitBatch(this.props.repository)
        .then(() => {
          // deferring unsetting this flag to some time _after_ the commits
          // have been appended to prevent eagerly adding more commits due
          // to scroll events (which fire indiscriminately)
          window.setTimeout(() => {
            this.loadingMoreCommitsPromise = null
          }, 500)
        })
    }
  }

  private onBranchFilterTextChanged = (filterText: string) => {
    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText,
    })

    this.props.dispatcher.searchCommits(this.props.repository, filterText)
  }

  private clearFilterState = () => {

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText: '',
    })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onNotificationBannerDismissed = (reason: DismissalReason) => {
    if (reason === DismissalReason.Close) {
      this.props.dispatcher.dismissDivergingBranchBanner(this.props.repository)
    }

    switch (reason) {
      case DismissalReason.Close:
        break
      case DismissalReason.Compare:
      case DismissalReason.Merge:
        break
      default:
        assertNever(reason, 'Unknown reason')
    }
  }

  private onCreateTag = (targetCommitSha: string) => {
    this.props.dispatcher.showCreateTagDialog(
      this.props.repository,
      targetCommitSha,
      this.props.localTags
    )
  }

  private onDeleteTag = (tagName: string) => {
    this.props.dispatcher.showDeleteTagDialog(this.props.repository, tagName)
  }
}

// determine if the `onRevertCommit` function should be exposed to the CommitList/CommitListItem.
// `onRevertCommit` is only exposed if the form state of the branch compare form is either
// 1: History mode, 2: Comparison Mode with the 'Ahead' list shown.
// When not exposed, the context menu item 'Revert this commit' is disabled.
function ableToRevertCommit(
  formState: IDisplayHistory | ICompareBranch
): boolean {
  return (
    formState.kind === HistoryTabMode.History ||
    formState.comparisonMode === ComparisonMode.Ahead
  )
}
