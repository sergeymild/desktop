import * as React from 'react'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { getAheadBehind, getCommits, mergeCommitTree, revSymmetricDifference } from '../../lib/git'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { RichText } from '../lib/rich-text'
import { CommitAttribution } from '../lib/commit-attribution'
import { RelativeTime } from '../relative-time'
import { getAvatarUsersForCommit, IAvatarUser } from '../../models/avatar'
import { AvatarStack } from '../lib/avatar-stack'
import { Dispatcher } from '../dispatcher'
import { ComputedAction } from '../../models/computed-action'
import { promiseWithMinimumTimeout } from '../../lib/promise'
import { MergeTreeResult } from '../../models/merge'
import { ActionStatusIcon } from '../lib/action-status-icon'

interface ICherryPickCommitListProps {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null
  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch
  readonly repository: Repository
  /** The GitHub repository associated with this commit (if found) */
  readonly gitHubRepository: GitHubRepository | null
  /** The emoji lookup to render images inline */
  readonly emoji: Map<string, string>
  /** Callback to fire to open a given commit on GitHub */
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly dispatcher: Dispatcher
  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface ICommitItem extends IFilterListItem {
  readonly commit: Commit
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
  readonly id: string
}

interface ICherryPickCommitListState {
  selectedCommitSha: string | null
  filterText: string,
  commits: ReadonlyArray<Commit>,
  selectedItem: ICommitItem | null,
  readonly groups: ReadonlyArray<IFilterListGroup<ICommitItem>>
  /** The merge result of comparing the selected branch to the current branch */
  readonly mergeStatus: MergeTreeResult | null
  /**
   * The number of commits that would be brought in by the merge.
   * undefined if no branch is selected or still calculating the
   * number of commits.
   */
  readonly commitCount?: number
}

export class CherryPickCommitList extends React.Component<ICherryPickCommitListProps, ICherryPickCommitListState> {
  public constructor(props: ICherryPickCommitListProps) {
    super(props)

    this.state = {
      selectedCommitSha: null,
      filterText: '',
      commits: [],
      groups: [],
      selectedItem: null,
      mergeStatus: null,
      commitCount: 0
    }
  }

  public async componentDidMount() {
    console.log(this.props.selectedBranch?.name)
    const localCommits = await getCommits(this.props.repository, this.props.selectedBranch!.name, 100, [
      '--not',
      '--remotes',
    ])

    this.createTagsGroup(localCommits)
  }

  private createTagsGroup = (tags: ReadonlyArray<Commit>) => {
    const groups = new Array<IFilterListGroup<ICommitItem>>()
    const group: IFilterListGroup<ICommitItem> = {
      identifier: 'Tags',
      items: tags.map(k => (
        {
          id: k.sha,
          commit: k, text: [k.summary, k.sha],
          avatarUsers: getAvatarUsersForCommit(null, k)
        })),
    }


    groups.push(group)
    this.setState({
      ...this.state,
      groups,
      commits: tags,
      selectedItem: group.items[0]
    })
    this.updateMergeStatus(group.items[0].commit)
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({ ...this.state, filterText: text })
  }

  private renderRelativeTime = (date: Date) => {
    return (
      <>
        {` • `}
        <RelativeTime date={date} abbreviate={true}/>
      </>
    )
  }

  private renderItem = (item: ICommitItem, matches: IMatches): JSX.Element => {
    return (
      <div className="commit">
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={item.commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="description">
            <AvatarStack users={item.avatarUsers} />
            <div className="byline">
              <CommitAttribution
                gitHubRepository={this.props.gitHubRepository}
                commit={item.commit}
              />
              {this.renderRelativeTime(item.commit.author.date)}
            </div>
          </div>
        </div>

      </div>
    )
  }

  private async updateMergeStatus(commit: Commit) {
    this.setState({ mergeStatus: { kind: ComputedAction.Loading } })

    const { currentBranch } = this.props

    if (currentBranch != null) {
      const mergeStatus = await promiseWithMinimumTimeout(
        () => mergeCommitTree(this.props.repository, currentBranch, commit.sha),
        500
      )

      this.setState({ mergeStatus })
    }

    const range = revSymmetricDifference('', commit.sha)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0
    this.setState({ commitCount })
  }

  private onSelectionChanged = async (item: ICommitItem | null) => {
    if (item === null) { return }
    this.setState({...this.state, selectedItem: item})
    await this.updateMergeStatus(item.commit)
  }

  private merge = () => {
    const commit = this.state.selectedItem
    const branch = this.props.selectedBranch?.name
    if (!commit) { return }
    if (!branch) { return }
    this.props.dispatcher.cherryPick(
      this.props.repository,
      commit.commit.sha,
      branch,
      null
    )
    this.props.onDismissed()
  }

  private renderMergeInfo() {
    const { currentBranch } = this.props
    const { mergeStatus, commitCount } = this.state
    const selectedBranch = this.props.selectedBranch
    if (
      mergeStatus == null ||
      currentBranch == null ||
      selectedBranch == null ||
      currentBranch.name === selectedBranch.name ||
      commitCount == null
    ) {
      return null
    }

    return (
      <div className="merge-status-component">
        <ActionStatusIcon
          status={this.state.mergeStatus}
          classNamePrefix="merge-status"
        />
        <p className="merge-info">
          {this.renderMergeStatusMessage(
            mergeStatus,
            selectedBranch,
            currentBranch,
            commitCount
          )}
        </p>
      </div>
    )
  }


  private renderMergeStatusMessage(
    mergeStatus: MergeTreeResult,
    branch: Branch,
    currentBranch: Branch,
    commitCount: number
  ): JSX.Element {
    if (mergeStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }

    if (mergeStatus.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(branch, currentBranch, commitCount)
    }

    if (mergeStatus.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }

    return this.renderConflictedMergeMessage(
      branch,
      currentBranch,
      mergeStatus.conflictedFiles
    )
  }

  private renderLoadingMergeMessage() {
    return (
      <React.Fragment>
        Checking for ability to merge automatically...
      </React.Fragment>
    )
  }

  private renderCleanMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number
  ) {
    if (commitCount === 0) {
      return (
        <React.Fragment>
          {`This branch is up to date with `}
          <strong>{branch.name}</strong>
        </React.Fragment>
      )
    }

    const pluralized = commitCount === 1 ? 'commit' : 'commits'
    return (
      <React.Fragment>
        This will merge
        <strong>{` ${commitCount} ${pluralized}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </React.Fragment>
    )
  }

  private renderInvalidMergeMessage() {
    return (
      <React.Fragment>
        Unable to merge unrelated histories in this repository
      </React.Fragment>
    )
  }

  private renderConflictedMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    count: number
  ) {
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <React.Fragment>
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` when merging `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </React.Fragment>
    )
  }

  public render() {
    const mergeInfo = this.renderMergeInfo()
    console.log(mergeInfo)
    return (
      <Dialog
        id="merge"
        onSubmit={this.merge}
        onDismissed={this.props.onDismissed}

        title={
          <>
            Select commit from <strong>{this.props.selectedBranch?.name}</strong>
          </>
        }
      >
        <DialogContent>
          <div id="commit-list">
            <FilterList<ICommitItem>
              className="cherry-pick-commit-list"
              rowHeight={50}
              filterText={this.state.filterText}
              onFilterTextChanged={this.onFilterTextChanged}
              selectedItem={this.state.selectedItem}
              onSelectionChanged={this.onSelectionChanged}
              renderItem={this.renderItem}
              groups={this.state.groups}
              invalidationProps={''}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          {mergeInfo}
          <OkCancelButtonGroup
            okButtonText={
              <>
                Cherry pick {' '}
              </>
            }
            okButtonDisabled={false}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}