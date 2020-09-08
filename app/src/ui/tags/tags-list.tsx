import React from 'react'
import { ITagItem } from '../../lib/git'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import { IMatches } from '../../lib/fuzzy-find'
import { ITagListItem, TagListItem } from './tags-list-item'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { AppStore } from '../../lib/stores'

const RowHeight = 52;

interface IProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
  readonly closeTags: () => void
}

interface IState {
  filterText: string
  selectedItem: ITagListItem | null
  readonly groups: ReadonlyArray<IFilterListGroup<ITagListItem>>
}

export class TagsList extends React.Component<IProps, IState> {

  public constructor(props: IProps) {
    super(props);

    this.state = {
      filterText: "",
      selectedItem: null,
      groups: []
    }
  }

  public componentDidMount() {
    const tags = this.props.appStore.tags(this.props.repository)
    this.createTagsGroup(tags)
  }

  public componentWillReceiveProps(nextProps: Readonly<IProps>, nextContext: any) {
    const tags = this.props.appStore.tags(this.props.repository)
    this.createTagsGroup(tags)
  }

  private createTagsGroup = (tags: ReadonlyArray<ITagItem>) => {
    const tagsToPush = this.props.appStore.tagsToPush(this.props.repository)
    const groups = new Array<IFilterListGroup<ITagListItem>>()
    const group: IFilterListGroup<ITagListItem> = {
      identifier: "Tags",
      items: tags.map(k => ({
        id: k.hash,
        tag: {...k, remote: !tagsToPush.includes(k.name)},
        text: [k.name, k.hash]})
      )
    }


    groups.push(group)
    this.setState({
      groups,
      filterText: ""
    })
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({...this.state, filterText: text})
  }

  private deleteTag = async (item: ITagListItem) => {
    try {
      this.props.closeTags()
      await this.props.dispatcher.deleteTag(this.props.repository, item.tag.name)
    } catch (e) {
      console.error(e)
    }
  }

  private checkoutToTag = async (item: ITagListItem) => {
    this.props.closeTags()
    this.props.dispatcher.checkoutToTag(this.props.repository, item.tag.name)
  }

  private tagSelectionChange = (item: ITagListItem | null) => {
    this.setState({selectedItem: item})
  }

  private handleTagClick = (item: ITagListItem | null) => {
    if (item != null) {
      this.props.closeTags()
      this.props.dispatcher.checkoutToTag(this.props.repository, item.tag.name)
    }
  }

  private onContextMenu = (item: ITagListItem) => {

    const items: IMenuItem[] = [
      {
        label: "Checkout",
        action: () => this.checkoutToTag(item),
        enabled: true,
      },
      {
        label: "Delete tag",
        action: () => this.deleteTag(item),
        enabled: true,
      },
    ]

    showContextualMenu(items)
  }

  private renderItem = (item: ITagListItem, matches: IMatches): JSX.Element => {
    return (
      <TagListItem
        item={item}
        onContextMenu={this.onContextMenu}
        matches={matches}
      />
    )
  }

  private renderGroupHeader = (label: string) => {

    return (
      <div className="branches-list-content filter-list-group-header">
        {label}
      </div>
    )
  }

  public render() {

    return <div className="tags-container">
      <FilterList<ITagListItem>
        className="stashes-list"
        rowHeight={RowHeight}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        selectedItem={this.state.selectedItem}
        onSelectionChanged={this.tagSelectionChange}
        onItemClick={this.handleTagClick}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        groups={this.state.groups}
        invalidationProps={""}
      />
    </div>
  }
}
