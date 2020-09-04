import * as React from 'react'
import { MergeTreeResult } from '../../models/merge'
import { Commit } from '../../models/commit'
import { ComputedAction } from '../../models/computed-action'
import { promiseWithMinimumTimeout } from '../../lib/promise'
import { getAheadBehind, mergeCommitTree, revSymmetricDifference } from '../../lib/git'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { ActionStatusIcon } from '../lib/action-status-icon'

interface IMergeConflictState {
  /** The merge result of comparing the selected branch to the current branch */
  readonly mergeStatus: MergeTreeResult | null
  /**
   * The number of commits that would be brought in by the merge.
   * undefined if no branch is selected or still calculating the
   * number of commits.
   */
  readonly commitCount?: number
}

interface IMergeConflictProps {
  readonly currentBranch: Branch | null
  readonly selectedBranch: Branch | null
  readonly repository: Repository
  readonly commit: Commit | undefined
}

export class MergeConflictView extends React.Component<IMergeConflictProps, IMergeConflictState> {

  public constructor(props: IMergeConflictProps) {
    super(props);

    this.state = {
      mergeStatus: null,
      commitCount: 0
    }
  }

  public componentWillReceiveProps(nextProps: Readonly<IMergeConflictProps>, nextContext: any) {
    const commit = nextProps.commit
    if (!commit) { return }
    this.updateMergeStatus(commit)
  }

  private async updateMergeStatus(commit: Commit) {
    this.setState({ mergeStatus: { kind: ComputedAction.Loading } })

    const { currentBranch } = this.props

    if (currentBranch != null) {
      const mergeStatus = await promiseWithMinimumTimeout(
        () => mergeCommitTree(this.props.repository, currentBranch, commit.sha),
        500,
      )

      this.setState({ mergeStatus })
    }

    const range = revSymmetricDifference('', commit.sha)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0
    this.setState({ commitCount })
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
            commitCount,
          )}
        </p>
      </div>
    )
  }

  private renderMergeStatusMessage(
    mergeStatus: MergeTreeResult,
    branch: Branch,
    currentBranch: Branch,
    commitCount: number,
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
      mergeStatus.conflictedFiles,
    )
  }


  private renderLoadingMergeMessage() {
    return (
      <>
        Checking for ability to merge automatically...
      </>
    )
  }

  private renderCleanMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number,
  ) {
    if (commitCount === 0) {
      return (
        <>
          {`This branch is up to date with `}
          <strong>{branch.name}</strong>
        </>
      )
    }

    const pluralized = commitCount === 1 ? 'commit' : 'commits'
    return (
      <>
        This will merge
        <strong>{` ${commitCount} ${pluralized}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </>
    )
  }

  private renderInvalidMergeMessage() {
    return (
      <>
        Unable to merge unrelated histories in this repository
      </>
    )
  }

  private renderConflictedMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    count: number,
  ) {
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <>
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` when merging `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </>
    )
  }

  public render() {
    return this.renderMergeInfo()
  }
}