import * as React from 'react'
import { Foldout, FoldoutType, IRepositoryState, SelectionType } from '../../lib/app-state'
import { BranchDropdown } from './branch-dropdown'
import {
  getUncommittedChangesStrategy,
  UncommittedChangesStrategyKind,
} from '../../models/uncommitted-changes-strategy'
import { DropdownState } from './dropdown'
import { dispatcher } from '../index'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

interface IProps {
  readonly selectionType: SelectionType | undefined
  readonly repository: Repository | CloningRepository | undefined
  readonly currentFoldout: Foldout | null
  readonly state: IRepositoryState | undefined
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export class ToolbarBranchButton extends React.PureComponent<IProps, {}> {

  private onDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      dispatcher.showFoldout({ type: FoldoutType.Branch })
    } else {
      dispatcher.closeFoldout(FoldoutType.Branch)
    }
  }

  public render() {
    const {selectionType, repository, currentFoldout, state} = this.props
    if (!state) { return null }
    if (!repository) { return null }
    if (repository instanceof CloningRepository) { return null }

    if (selectionType === undefined || selectionType !== SelectionType.Repository) {
      return null
    }

    const isOpen =
      currentFoldout !== null && currentFoldout.type === FoldoutType.Branch

    return (
      <BranchDropdown
        isOpen={isOpen}
        onDropDownStateChanged={this.onDropdownStateChanged}
        repository={repository}
        repositoryState={state}
        selectedUncommittedChangesStrategy={getUncommittedChangesStrategy(
          this.props.uncommittedChangesStrategyKind
        )}
      />
    )
  }
}