import * as React from 'react'

import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { PopupType } from '../../models/popup'

import { FoldoutType } from '../../lib/app-state'

import { Row } from '../lib/row'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'
import { startTimer } from '../lib/timing'
import { UncommittedChangesStrategy, UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { dispatcher } from '../index'
import { BranchesTreeList } from './branches-tree-list'

interface IBranchesContainerProps {
  readonly repository: Repository
  readonly allBranches: ReadonlyArray<Branch>
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly recentBranches: ReadonlyArray<Branch>

  readonly currentBranchProtected: boolean

  readonly selectedUncommittedChangesStrategy: UncommittedChangesStrategy
}

interface IBranchesContainerState {
  readonly selectedBranch: Branch | null
}

/** The unified Branches and Pull Requests component. */
export class BranchesContainer extends React.Component<
  IBranchesContainerProps,
  IBranchesContainerState
> {

  public constructor(props: IBranchesContainerProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
    }
  }

  public render() {
    return (
      <div className="branches-container">
        {this.renderSelectedTab()}
        {this.renderMergeButtonRow()}
      </div>
    )
  }

  private renderMergeButtonRow() {
    const { currentBranch } = this.props

    // This could happen if HEAD is detached, in that
    // case it's better to not render anything at all.
    if (currentBranch === null) {
      return null
    }

    return (
      <Row className="merge-button-row">
        <Button className="merge-button button-component-primary" type="submit" onClick={this.onMergeClick}>
          <Octicon className="icon" symbol={OcticonSymbol.gitMerge} />
          <span title={`Merge a branch into ${currentBranch.name}`}>
            Choose a branch to merge into <strong>{currentBranch.name}</strong>
          </span>
        </Button>
      </Row>
    )
  }

  private renderSelectedTab() {
    return <BranchesTreeList
      defaultBranch={this.props.defaultBranch}
      currentBranch={this.props.currentBranch}
      allBranches={this.props.allBranches}
      recentBranches={this.props.recentBranches}
      onItemClick={this.onBranchItemClick}
      selectedBranch={this.state.selectedBranch}
      onSelectionChanged={this.onBranchSelectionChanged}
      canCreateNewBranch={true}
      onCreateNewBranch={this.onCreateBranchWithName}
    />
  }

  private onMergeClick = () => {
    dispatcher.closeFoldout(FoldoutType.Branch)
    dispatcher.showPopup({
      type: PopupType.MergeBranch,
      repository: this.props.repository,
    })
  }

  private onBranchItemClick = (branch: Branch) => {
    dispatcher.closeFoldout(FoldoutType.Branch)

    const {
      currentBranch,
      repository,
      currentBranchProtected,
    } = this.props

    if (currentBranch == null || currentBranch.name !== branch.name) {
      const timer = startTimer('checkout branch from list', repository)

      // Never prompt to stash changes if someone is switching away from a protected branch
      const strategy: UncommittedChangesStrategy = currentBranchProtected
        ? {
            kind: UncommittedChangesStrategyKind.MoveToNewBranch,
            transientStashEntry: null,
          }
        : this.props.selectedUncommittedChangesStrategy

      dispatcher
        .checkoutBranch(repository, branch, strategy)
        .then(() => timer.done())
    }
  }

  private onBranchSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private onCreateBranchWithName = (name: string) => {
    const { repository, currentBranchProtected } = this.props

    dispatcher.closeFoldout(FoldoutType.Branch)
    dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
      currentBranchProtected,
      initialName: name,
    })
  }
}
