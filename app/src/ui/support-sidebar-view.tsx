import * as React from 'react'
import { Resizable } from './resizable'
import { dispatcher } from './index'
import { PossibleSelections, SelectionType } from '../lib/app-state'
import { getUncommittedChangesStrategy, UncommittedChangesStrategyKind } from '../models/uncommitted-changes-strategy'
import { BranchesContainer } from './branches'
import { TipState } from '../models/tip'

interface IProps {
  readonly width: number
  readonly selectedState: PossibleSelections | null
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export class SupportSidebarView extends React.Component<IProps, {}> {

  private handleSidebarWidthReset = () => {
    dispatcher.resetSupportSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    dispatcher.setSupportSidebarWidth(width)
  }

  private renderBranches(): JSX.Element | null {
    const selection = this.props.selectedState

    if (selection == null || selection.type !== SelectionType.Repository) {
      return null
    }

    const repository = selection.repository

    const repositoryState = selection.state
    const branchesState = repositoryState.branchesState
    const currentBranchProtected =
      repositoryState.changesState.currentBranchProtected

    const tip = repositoryState.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

    return (
      <BranchesContainer
        allBranches={branchesState.allBranches}
        recentBranches={branchesState.recentBranches}
        currentBranch={currentBranch}
        defaultBranch={branchesState.defaultBranch}
        repository={repository}
        currentBranchProtected={currentBranchProtected}
        selectedUncommittedChangesStrategy={getUncommittedChangesStrategy(
          this.props.uncommittedChangesStrategyKind
        )}
      />
    )
  }

  public render() {


    return <Resizable
      id="support-sidebar-view"
      width={this.props.width}
      minimumWidth={100}
      onReset={this.handleSidebarWidthReset}
      onResize={this.handleSidebarResize}
      maximumWidth={600}
    >
      {this.renderBranches()}
    </Resizable>
  }
}