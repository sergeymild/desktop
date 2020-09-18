import * as React from 'react'
import { Repository } from '../../models/repository'
import { DropdownState, ToolbarDropdown } from './dropdown'
import { iconForRepository, OcticonSymbol } from '../octicons'
import { Foldout, FoldoutType } from '../../lib/app-state'
import { connect, IGlobalState } from '../index'
import { CloningRepository } from '../../models/cloning-repository'
import { RepositoriesList } from '../repositories-list'
import { Dispatcher } from '../dispatcher'

interface IProps {
  readonly repository: Repository | CloningRepository | undefined
  readonly repositoriesCount: number
  readonly currentFoldout: Foldout | null
  readonly dispatcher: Dispatcher
}

const mapStateToProps = (state: IGlobalState): IProps => {
  return {
    repository: state.appStore.possibleSelectedState?.repository,
    currentFoldout: state.appStore.currentFoldout,
    repositoriesCount: state.appStore.getStateRepositoriesCount(),
    dispatcher: state.dispatcher
  }
}

class LocalToolbarRepositoryButton extends React.PureComponent<IProps, {}> {
  private onDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private renderRepositoryList = (): JSX.Element => {
    return <RepositoriesList/>
  }

  public render() {
    const repository = this.props.repository

    let icon: OcticonSymbol
    let title: string
    if (repository) {
      icon = iconForRepository(repository)
      title = repository.name
    } else if (this.props.repositoriesCount > 0) {
      icon = OcticonSymbol.repo
      title = __DARWIN__ ? 'Select a Repository' : 'Select a repository'
    } else {
      icon = OcticonSymbol.repo
      title = __DARWIN__ ? 'No Repositories' : 'No repositories'
    }

    const isOpen =
      this.props.currentFoldout &&
      this.props.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const tooltip = repository && !isOpen ? repository.path : undefined


    return <ToolbarDropdown
      icon={icon}
      title={title}
      description={__DARWIN__ ? 'Current Repository' : 'Current repository'}
      tooltip={tooltip}
      onDropdownStateChanged={this.onDropdownStateChanged}
      dropdownContentRenderer={this.renderRepositoryList}
      dropdownState={currentState}
    />
  }
}

export const ToolbarRepositoryButton =
  connect(mapStateToProps)(LocalToolbarRepositoryButton)