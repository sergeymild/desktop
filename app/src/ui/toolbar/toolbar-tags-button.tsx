import React from 'react'
import { DropdownState, ToolbarDropdown } from './dropdown'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { TagsList } from '../tags/tags-list'
import { Foldout, FoldoutType } from '../../lib/app-state'
import { connect, IGlobalState } from '../index'
import { IRepositoryTags } from '../../lib/git'
import { Dispatcher } from '../dispatcher'

interface IProps {
  readonly repository: Repository
  readonly tagList: IRepositoryTags | null
  readonly currentTag: string | null
  readonly currentFoldout: Foldout | null
  readonly dispatcher: Dispatcher
}

const mapStateToProps = (state: IGlobalState): IProps => {
  const repository = state.appStore.getRepository()!
  return {
    currentFoldout: state.appStore.currentFoldout,
    repository: repository,
    tagList: state.appStore.repositoryTags(repository),
    currentTag: state.appStore.getCurrentTagName(repository),
    dispatcher: state.dispatcher
  }
}

class LocalToolbarTagsButton extends React.PureComponent<IProps, {}> {

  private renderBranchFoldout = (): JSX.Element | null => {
    if (this.props.tagList === null) { return null }
    return <TagsList
      repository={this.props.repository}
      tagList={this.props.tagList}
    />
  }

  private onDropDownStateChanged = (state: DropdownState): void => {
    if (state === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Tags })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Tags)
    }
  }

  public render() {
    const isOpen: boolean = (this.props.currentFoldout?.type === FoldoutType.Tags) || false
    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      title={this.props.currentTag || "No tag"}
      description={"Tags"}
      dropdownState={currentState}
      icon={OcticonSymbol.tag}
      onDropdownStateChanged={this.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}/>
  }
}

export const ToolbarTagsButton =
  connect(mapStateToProps)(LocalToolbarTagsButton)