import * as React from 'react'

import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { PopupType } from '../../models/popup'

import { FoldoutType } from '../../lib/app-state'

import { Row } from '../lib/row'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'

import { BranchList } from './branch-list'
import { IBranchListItem } from './group-branches'
import { renderDefaultBranch } from './branch-renderer'
import { IMatches } from '../../lib/fuzzy-find'
import { startTimer } from '../lib/timing'
import { UncommittedChangesStrategy, UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import { dispatcher } from '../index'

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
  readonly branchFilterText: string
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
      branchFilterText: '',
    }
  }

  private getBranchName = (): string => {
    const { currentBranch, defaultBranch } = this.props
    if (currentBranch != null) {
      return currentBranch.name
    }

    if (defaultBranch != null) {
      return defaultBranch.name
    }

    return 'master'
  }

  public render() {
    const branchName = this.getBranchName()
    return (
      <div className="branches-container">
        {this.renderSelectedTab()}
        <Row className="merge-button-row">
          <Button className="merge-button button-component-primary" type="submit" onClick={this.onMergeClick}>
            <Octicon className="icon" symbol={OcticonSymbol.gitMerge} />
            <span title={`Merge a branch into ${branchName}`}>
              Choose a branch to merge into <strong>{branchName}</strong>
            </span>
          </Button>
        </Row>
      </div>
    )
  }

  private onRename = (branch: Branch) => {
    dispatcher.closeCurrentFoldout()
    dispatcher.showPopup({
      type: PopupType.RenameBranch,
      repository: this.props.repository,
      branch: branch
    })
  }

  private onDelete = (branch: Branch) => {
    dispatcher.closeCurrentFoldout()
    dispatcher.showPopup({
      type: PopupType.DeleteBranch,
      existsOnRemote: true,
      branch: branch,
      repository: this.props.repository
    })
  }

  private onContextMenu = (branch: Branch) => {
    const items: IMenuItem[] = [
      {
        label: "Rename",
        action: () => this.onRename(branch),
        enabled: true,
      },

      {type: 'separator'},
      {
        label: "Delete",
        action: () => this.onDelete(branch),
        enabled: true,
      }
    ]

    showContextualMenu(items)
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(
      item,
      matches,
      this.props.currentBranch,
      this.onContextMenu
    )
  }

  private renderSelectedTab() {
    return <BranchList
      defaultBranch={this.props.defaultBranch}
      currentBranch={this.props.currentBranch}
      allBranches={this.props.allBranches}
      recentBranches={this.props.recentBranches}
      onItemClick={this.onBranchItemClick}
      filterText={this.state.branchFilterText}
      onFilterTextChanged={this.onBranchFilterTextChanged}
      selectedBranch={this.state.selectedBranch}
      onSelectionChanged={this.onBranchSelectionChanged}
      canCreateNewBranch={true}
      onCreateNewBranch={this.onCreateBranchWithName}
      renderBranch={this.renderBranch}
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

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ branchFilterText: text })
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
