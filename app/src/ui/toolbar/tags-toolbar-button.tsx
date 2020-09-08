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
}

interface IState {
  currentTag: string | null
}

class TagsToolBarButton extends React.PureComponent<IProps, IState> {
  public constructor(props: IProps) {
    super(props);
    this.state = {
      currentTag: null
    }
  }

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

  public componentDidMount() {
    const tag = this.props.appStore.getCurrentTagName(this.props.repository)
    this.setState({currentTag: tag})
  }

  public render() {
    console.log("toolbar render")
    const currentState: DropdownState = this.props.isOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      title={this.state.currentTag || "No tag"}
      description={"Tags"}
      dropdownState={currentState}
      icon={OcticonSymbol.tag}
      onDropdownStateChanged={this.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}/>
  }
}

export { TagsToolBarButton }