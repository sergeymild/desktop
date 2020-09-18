import * as React from 'react'
import { Foldout, FoldoutType, IRepositoryState, SelectionType } from '../../lib/app-state'
import { BranchDropdown } from './branch-dropdown'
import {
  getUncommittedChangesStrategy,
  UncommittedChangesStrategyKind,
} from '../../models/uncommitted-changes-strategy'
import { DropdownState } from './dropdown'
import { connect, dispatcher, IGlobalState } from '../index'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

interface IProps {
  readonly selectionType: SelectionType | undefined
  readonly repository: Repository | CloningRepository | null
  readonly currentFoldout: Foldout | null
  readonly state: IRepositoryState | undefined
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

const mapStateToProps = (state: IGlobalState): IProps => {
  return {
    repository: state.appStore.selectedRepository,
    currentFoldout: state.appStore.currentFoldout,
    selectionType: state.appStore.possibleSelectedState?.type,
    state: state.appStore.possibleSelectedState?.state,
    uncommittedChangesStrategyKind: state.appStore.uncommittedChangesStrategyKind
  }
}

export class LocalToolbarBranchButton extends React.PureComponent<IProps> {

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

export const ToolbarBranchButton =
  connect(mapStateToProps)(LocalToolbarBranchButton)