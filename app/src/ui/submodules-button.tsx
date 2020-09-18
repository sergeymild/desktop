import * as React from 'react'
import { connect, dispatcher, IGlobalState } from './index'
import { Foldout, FoldoutType } from '../lib/app-state'
import { DropdownState, ToolbarDropdown } from './toolbar'
import { FilterList, IFilterListGroup, IFilterListItem } from './lib/filter-list'
import { Repository } from '../models/repository'
import { IMatches } from '../lib/fuzzy-find'
import { HighlightText } from './lib/highlight-text'
import { iconForRepository, Octicon } from './octicons'

export interface IListItem extends IFilterListItem {
  readonly repository: Repository
  readonly id: string
}


interface IProps {
  readonly submodules: ReadonlyArray<Repository>
  readonly currentFoldout: Foldout | null
}

interface IState {
  readonly filterText: string
  readonly group: ReadonlyArray<IFilterListGroup<IListItem>>
  readonly selectedItem: IListItem | null
}

const mapStateToProps = (state: IGlobalState): IProps => {
  return {
    currentFoldout: state.appStore.currentFoldout,
    submodules: (state.appStore.selectedRepository as Repository).submodules
  }
}

class LocalSubmodulesButton extends React.PureComponent<IProps, IState> {
  public state = {
    filterText: "",
    selectedItem: null,
    group: []
  }

  public componentDidMount() {
    this.setState({group: this.createGroup()})
  }

  private onDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      dispatcher.showFoldout({ type: FoldoutType.Submodules })
    } else {
      dispatcher.closeFoldout(FoldoutType.Submodules)
    }
  }

  private createGroup = (): ReadonlyArray<IFilterListGroup<IListItem>> => {
    const modules = this.props.submodules
    const groups = new Array<IFilterListGroup<IListItem>>()
    const group: IFilterListGroup<IListItem> = {
      identifier: "Submodules",
      items: modules.map(k => ({
        id: k.hash,
        repository: k,
        text: [k.name, k.hash]})
      )
    }
    groups.push(group)
    return groups
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({filterText: text})
  }

  private onItemClick = (item: IListItem) => {
    dispatcher.selectRepository(item.repository)
    dispatcher.closeFoldout(FoldoutType.Submodules)
  }

  private renderItem = (item: IListItem, matches: IMatches): JSX.Element => {
    return (
      <div className="repository-list-item">
        <Octicon
          className="icon-for-repository"
          symbol={iconForRepository(item.repository)}
        />
        <div className="name">
          <HighlightText
            text={item.repository.name}
            highlight={matches.title}
          />
        </div>
      </div>
    )
  }

  private renderSubmodulesList = (): JSX.Element => {
    return <div className="repository-list">
      <FilterList<IListItem>
        rowHeight={29}
        onFilterTextChanged={this.onFilterTextChanged}
        selectedItem={this.state.selectedItem}
        filterText={this.state.filterText}
        renderItem={this.renderItem}
        onItemClick={this.onItemClick}
        groups={this.state.group}
        invalidationProps={{}}
      />
    </div>
  }


  public render() {
    if (this.props.submodules.length === 0) return null

    const isOpen = this.props.currentFoldout?.type === FoldoutType.Submodules

    return <div className="submodules-dropdown">
      <ToolbarDropdown
        buttonClassName="submodules-dropdown-button"
        title={"Submodules"}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.renderSubmodulesList}
        dropdownState={isOpen ? 'open' : 'closed'}
      />
    </div>
  }
}

export const SubmodulesButton = connect(mapStateToProps)(LocalSubmodulesButton)