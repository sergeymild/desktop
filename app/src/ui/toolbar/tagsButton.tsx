import React from "react";
import { DropdownState, ToolbarDropdown } from './dropdown'
import { Octicon, OcticonSymbol } from '../octicons'
import { deleteTag, fetchAllTags, getCachedTags, checkoutToTag, ITagItem, fetchRemoteTags } from '../../lib/git'
import { Repository } from '../../models/repository'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { HighlightText } from '../lib/highlight-text'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import moment from 'moment'
import { Dispatcher } from '../dispatcher'

const RowHeight = 30;

interface ITagsButtonProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

interface ITagsListState {
  tags: Array<ITagItem>
  filterText: string
  selectedItem: ITagListItem | null
  readonly groups: ReadonlyArray<IFilterListGroup<ITagListItem>>
}

interface ITagListItem extends IFilterListItem {
  readonly tag: ITagItem
  readonly id: string
}

interface ITagListItemProps {
  readonly item: ITagListItem
  readonly matches: IMatches
  onContextMenu: (item: ITagListItem) => void
}

interface ITagsToolBarButtonState {
  dropdownState: DropdownState
}

class TagListItem extends React.Component<ITagListItemProps, {}> {
  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    this.props.onContextMenu(this.props.item)
  }

  public shouldComponentUpdate(nextProps: Readonly<ITagListItemProps>, nextState: Readonly<{}>, nextContext: any): boolean {
    const currentTag = this.props.item.tag
    const nextTag = nextProps.item.tag
    if (currentTag.remote !== nextTag.remote) { return true }
    if (currentTag.name !== nextTag.name) { return true }
    if (currentTag.hash !== nextTag.hash) { return true }
    return false
  }

  public render() {
    const {remote} = this.props.item.tag
    const icon = remote ? OcticonSymbol.server : OcticonSymbol.tag

    return (
      <div className="tags-list-item" onContextMenu={this.onContextMenu}>
        <Octicon className="icon" symbol={icon} />
        <div className="name">
          <HighlightText text={this.props.item.tag.name} highlight={this.props.matches.title} />
        </div>
        <div className="created-at">
          {moment(this.props.item.tag.date).fromNow()}
        </div>
      </div>
    )
  }
}

class TagsList extends React.Component<ITagsButtonProps, ITagsListState> {

  public constructor(props: ITagsButtonProps) {
    super(props);

    this.state = {
      tags: [],
      filterText: "",
      selectedItem: null,
      groups: []
    }
  }

  public componentDidMount() {
    this.fetchTags()
  }

  private fetchTags = async () => {
    this.createTagsGroup(getCachedTags())
    const tags = await fetchAllTags(this.props.repository)
    this.createTagsGroup(tags)
    await fetchRemoteTags(this.props.repository)
    this.createTagsGroup(getCachedTags())
  }

  private createTagsGroup = (tags: ReadonlyArray<ITagItem>) => {
    const groups = new Array<IFilterListGroup<ITagListItem>>()
    const group: IFilterListGroup<ITagListItem> = {
      identifier: "Tags",
      items: tags.map(k => ({id: k.hash, tag: k, text: [k.name, k.hash]}))
    }


    groups.push(group)
    this.setState({
      groups,
      filterText: "",
      tags: tags as Array<ITagItem>
    })
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({...this.state, filterText: text})
  }

  private deleteTag = async (item: ITagListItem) => {
    try {
      await deleteTag(this.props.repository, item.tag.name)
      this.createTagsGroup(this.state.tags.filter(t => t.hash !== item.tag.hash))
    } catch (e) {
      console.error(e)
    }
  }

  private checkoutToTag = async (item: ITagListItem) => {
    try {
      await checkoutToTag(this.props.repository, item.tag.name)
    } catch (e) {
      console.error(e)
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
        className="tags-list"
        rowHeight={RowHeight}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        groups={this.state.groups}
        invalidationProps={""}
      />
    </div>
  }
}


class TagsToolBarButton extends React.Component<ITagsButtonProps, ITagsToolBarButtonState> {
  public constructor(props: ITagsButtonProps) {
    super(props);

    this.state = {
      dropdownState: 'closed'
    }
  }
  private renderBranchFoldout = (): JSX.Element | null => {
    return <TagsList repository={this.props.repository} dispatcher={this.props.dispatcher}/>
  }

  private onDropDownStateChanged = (state: DropdownState): void => {
    // Don't allow opening the drop down when checkout is in progress
    this.setState({dropdownState: state})
  }

  public render() {
    return <ToolbarDropdown
      title={"Tags"}
      dropdownState={this.state.dropdownState}
      icon={OcticonSymbol.tag}
      onDropdownStateChanged={this.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}/>
  }
}

export { TagsToolBarButton }