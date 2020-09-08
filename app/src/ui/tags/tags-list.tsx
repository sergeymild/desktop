import React from 'react'
import { IRepositoryTags } from '../../lib/git'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import { IMatches } from '../../lib/fuzzy-find'
import { ITagListItem, TagListItem } from './tags-list-item'
import { Repository } from '../../models/repository'
import { dispatcher } from '../index'

const RowHeight = 52;

interface IProps {
  readonly repository: Repository
  readonly tagList: IRepositoryTags
}

interface IState {
  filterText: string
  selectedItem: ITagListItem | null
  readonly groups: ReadonlyArray<IFilterListGroup<ITagListItem>>
}

export class TagsList extends React.Component<IProps, IState> {

  public static getDerivedStateFromProps(
    props: IProps,
  ): Partial<IState> | null {
    return {
      filterText: "",
      selectedItem: null,
      groups: TagsList.createTagsGroup(props.tagList)
    }
  }

  private static createTagsGroup = (tagList: IRepositoryTags): ReadonlyArray<IFilterListGroup<ITagListItem>> => {
    const tagsToPush = tagList.tagsToPush
    const groups = new Array<IFilterListGroup<ITagListItem>>()
    const group: IFilterListGroup<ITagListItem> = {
      identifier: "Tags",
      items: tagList.localTags.map(k => ({
        id: k.hash,
        tag: {...k, remote: !tagsToPush.includes(k.name)},
        text: [k.name, k.hash]})
      )
    }
    groups.push(group)
    return groups
  }

  public constructor(props: IProps) {
    super(props);

    this.state = {
      filterText: "",
      selectedItem: null,
      groups: []
    }
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({...this.state, filterText: text})
  }

  private deleteTagLocally = async (item: ITagListItem) => {
    try {
      await dispatcher.closeCurrentFoldout()
      await dispatcher.deleteTag(this.props.repository, item.tag.name, false)
    } catch (e) {
      console.error(e)
    }
  }

  private deleteTagFromOrigin = async (item: ITagListItem) => {
    try {
      await dispatcher.closeCurrentFoldout()
      await dispatcher.deleteTag(this.props.repository, item.tag.name, true)
    } catch (e) {
      console.error(e)
    }
  }

  private checkoutToTag = async (item: ITagListItem) => {
    dispatcher.closeCurrentFoldout()
    dispatcher.checkoutToTag(this.props.repository, item.tag.name)
  }

  private tagSelectionChange = (item: ITagListItem | null) => {
    this.setState({selectedItem: item})
  }

  private handleTagClick = (item: ITagListItem | null) => {
    if (item != null) {
      dispatcher.closeCurrentFoldout()
      dispatcher.checkoutToTag(this.props.repository, item.tag.name)
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
        label: `Delete locally`,
        action: () => this.deleteTagLocally(item),
      },
      {
        label: `Delete from origin`,
        action: () => this.deleteTagFromOrigin(item),
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
