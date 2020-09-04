import * as React from 'react'
import { Dispatcher } from '../dispatcher'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { IMatches } from '../../lib/fuzzy-find'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'
import { PopupType } from '../../models/popup'

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

interface ICherryPickState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The filter text to use in the branch selector */
  readonly filterText: string
}

/** A component for merging a branch into the current branch. */
export class CherryPick extends React.Component<IMergeProps, ICherryPickState> {
  public constructor(props: IMergeProps) {
    super(props)

    const selectedBranch = this.resolveSelectedBranch()

    this.state = {
      selectedBranch,
      filterText: '',
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  private onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch === null) {
      return
    }
    this.setState({ selectedBranch })
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const disabled = selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name

    // the amount of characters to allow before we truncate was chosen arbitrarily
    const currentBranchName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )
    return (
      <Dialog
        id="merge"
        onDismissed={this.props.onDismissed}
        onSubmit={this.showSelectCommitPopup}
        title={
          <>
            Cherry pick into <strong>{currentBranchName}</strong>
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
            onSelectionChanged={this.onSelectionChanged}
            selectedBranch={selectedBranch}
            canCreateNewBranch={false}
            renderBranch={this.renderBranch}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              <>
                Select {' '}
                <strong>{selectedBranch ? selectedBranch.name : ''}</strong>
              </>
            }
            okButtonDisabled={disabled}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private showSelectCommitPopup = () => {
    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.CherryPickCommitList,
      repository: this.props.repository,
      branch: this.state.selectedBranch!
    })

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
