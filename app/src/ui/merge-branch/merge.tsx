import * as React from 'react'
import { Dispatcher } from '../dispatcher'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { IMatches } from '../../lib/fuzzy-find'
import { MergeTreeResult } from '../../models/merge'
import { ComputedAction } from '../../models/computed-action'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'
import { ClickSource } from '../lib/list'
import { MergeConflictView } from '../cherry-pick/merge-conflict-view'
import { promiseWithMinimumTimeout } from '../../lib/promise'
import { getAheadBehind, mergeTree, revSymmetricDifference } from '../../lib/git'

interface IMergeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The branch to select when the merge dialog is opened
   */
  readonly initialBranch?: Branch

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface IMergeState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The merge result of comparing the selected branch to the current branch */
  readonly mergeStatus: MergeTreeResult | null

  /**
   * The number of commits that would be brought in by the merge.
   * undefined if no branch is selected or still calculating the
   * number of commits.
   */
  readonly commitCount?: number

  /** The filter text to use in the branch selector */
  readonly filterText: string
}

/** A component for merging a branch into the current branch. */
export class Merge extends React.Component<IMergeProps, IMergeState> {
  public constructor(props: IMergeProps) {
    super(props)

    const selectedBranch = this.resolveSelectedBranch()

    this.state = {
      selectedBranch,
      commitCount: undefined,
      filterText: '',
      mergeStatus: null,
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (branch: Branch, source: ClickSource) => {
    if (source.kind !== 'keyboard' || source.event.key !== 'Enter') {
      return
    }

    source.event.preventDefault()
    const { selectedBranch } = this.state

    if (selectedBranch !== null && selectedBranch.name === branch.name) {
      this.merge()
    }
  }

  private onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch != null) {
      this.setState({ selectedBranch })
      await this.updateMergeStatus(selectedBranch)
    } else {
      this.setState({ selectedBranch, commitCount: 0, mergeStatus: null })
    }
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  private canMergeSelectedBranch() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const selectedBranchIsCurrentBranch =
      selectedBranch !== null &&
      currentBranch !== null &&
      selectedBranch.name === currentBranch.name

    const isBehind =
      this.state.commitCount !== undefined && this.state.commitCount > 0

    const canMergeBranch =
      this.state.mergeStatus === null ||
      this.state.mergeStatus.kind !== ComputedAction.Invalid

    return (
      selectedBranch !== null &&
      !selectedBranchIsCurrentBranch &&
      isBehind &&
      canMergeBranch
    )
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch
    const disabled = !this.canMergeSelectedBranch()

    // the amount of characters to allow before we truncate was chosen arbitrarily
    const currentBranchName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40,
    )
    return (
      <Dialog
        id="merge"
        onDismissed={this.props.onDismissed}
        onSubmit={this.merge}
        title={
          <>
            Merge into <strong>{currentBranchName}</strong>
          </>
        }
      >
        <DialogContent>
          <BranchList
            allBranches={this.props.allBranches}
            currentBranch={currentBranch}
            defaultBranch={this.props.defaultBranch}
            recentBranches={this.props.recentBranches}
            filterText={this.state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedBranch={selectedBranch}
            onSelectionChanged={this.onSelectionChanged}
            canCreateNewBranch={false}
            renderBranch={this.renderBranch}
            onItemClick={this.onItemClick}
          />
        </DialogContent>
        <DialogFooter>
          {<MergeConflictView
            currentBranch={this.props.currentBranch}
            repository={this.props.repository}
            selectedBranch={this.state.selectedBranch}
            commitSha={this.state.selectedBranch?.tip?.sha}
          />}
          <OkCancelButtonGroup
            okButtonText={
              <>
                Merge{' '}
                <strong>{selectedBranch ? selectedBranch.name : ''}</strong>{' '}
                into <strong>{currentBranch ? currentBranch.name : ''}</strong>
              </>
            }
            okButtonDisabled={disabled}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private async updateMergeStatus(branch: Branch) {
    this.setState({ mergeStatus: { kind: ComputedAction.Loading } })

    const { currentBranch } = this.props

    if (currentBranch != null) {
      const mergeStatus = await promiseWithMinimumTimeout(
        () => mergeTree(this.props.repository, currentBranch, branch),
        500
      )

      this.setState({ mergeStatus })
    }

    const range = revSymmetricDifference('', branch.name)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch !== branch) {
      // The branch changed while we were waiting on the result of `getAheadBehind`.
      this.setState({ commitCount: undefined })
    } else {
      this.setState({ commitCount })
    }
  }

  private merge = () => {
    if (!this.canMergeSelectedBranch()) {
      return
    }

    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.props.dispatcher.mergeBranch(
      this.props.repository,
      branch.name,
    )
    this.props.onDismissed()
  }

  /**
   * Returns the branch to use as the selected branch
   *
   * The initial branch is used if passed
   * otherwise, the default branch will be used iff it's
   * not the currently checked out branch
   */
  private resolveSelectedBranch() {
    const { currentBranch, defaultBranch, initialBranch } = this.props

    if (initialBranch !== undefined) {
      return initialBranch
    }

    return currentBranch === defaultBranch ? null : defaultBranch
  }
}
