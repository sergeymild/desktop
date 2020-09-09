import React from 'react'
import { DropdownState, ToolbarDropdown } from './dropdown'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'

import { AppStore } from '../../lib/stores'
import { TagsList } from '../tags/tags-list'
import { FoldoutType } from '../../lib/app-state'
import { dispatcher } from '../index'
import { IRepositoryTags } from '../../lib/git'

interface IProps {
  readonly repository: Repository
  readonly appStore: AppStore
  readonly isOpen: boolean
  readonly tagList: IRepositoryTags | null
  readonly currentTag: string | null
}

class TagsToolBarButton extends React.PureComponent<IProps, {}> {

  private renderBranchFoldout = (): JSX.Element | null => {
    if (this.props.tagList === null) { return null }
    return <TagsList
      repository={this.props.repository}
      tagList={this.props.tagList}
    />
  }

  private onDropDownStateChanged = (state: DropdownState): void => {
    if (state === 'open') {
      dispatcher.showFoldout({ type: FoldoutType.Tags })
    } else {
      dispatcher.closeFoldout(FoldoutType.Tags)
    }
  }

  public render() {
    const currentState: DropdownState = this.props.isOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      title={this.props.currentTag || "No tag"}
      description={"Tags"}
      dropdownState={currentState}
      icon={OcticonSymbol.tag}
      onDropdownStateChanged={this.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}/>
  }
}

export { TagsToolBarButton }