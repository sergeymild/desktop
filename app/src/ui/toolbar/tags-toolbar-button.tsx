import React from 'react'
import { DropdownState, ToolbarDropdown } from './dropdown'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'

import { Dispatcher } from '../dispatcher'
import { AppStore } from '../../lib/stores'
import { TagsList } from '../tags/tags-list'

interface IProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
}

interface IState {
  dropdownState: DropdownState
  currentTag: string | null
}

class TagsToolBarButton extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props);

    this.state = {
      dropdownState: 'closed',
      currentTag: null
    }
  }

  private closeTags = () => this.setState({dropdownState: "closed"})

  private renderBranchFoldout = (): JSX.Element | null => {
    return <TagsList
      repository={this.props.repository}
      dispatcher={this.props.dispatcher}
      appStore={this.props.appStore}
      closeTags={this.closeTags}
    />
  }

  private onDropDownStateChanged = (state: DropdownState): void => {
    // Don't allow opening the drop down when checkout is in progress
    this.setState({dropdownState: state})
  }

  public shouldComponentUpdate(
    nextProps: Readonly<IProps>,
    nextState: Readonly<IState>,
    nextContext: any
  ): boolean {
    if (this.state.dropdownState !== nextState.dropdownState) {
      return true
    }

    if (this.state.currentTag !== nextState.currentTag) {
      return true
    }
    return false
  }

  public componentDidMount() {
    const tag = this.props.appStore.getCurrentTagName(this.props.repository)
    this.setState({currentTag: tag})
  }

  public componentWillReceiveProps(nextProps: Readonly<IProps>, nextContext: any) {
    const tag = this.props.appStore.getCurrentTagName(this.props.repository)
    this.setState({currentTag: tag})
  }

  public render() {
    return <ToolbarDropdown
      title={this.state.currentTag || "No tag"}
      description={"Tags"}
      dropdownState={this.state.dropdownState}
      icon={OcticonSymbol.tag}
      onDropdownStateChanged={this.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}/>
  }
}

export { TagsToolBarButton }