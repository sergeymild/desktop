import * as React from 'react'
import { fetchStashes } from '../../lib/git/stash'
import { Repository } from '../../models/repository'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IStashEntry } from '../../models/stash-entry'
import { IMatches } from '../../lib/fuzzy-find'
import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'
import { Dispatcher } from '../dispatcher'
import { StashListItem } from './stashes-list-item'
import { BannerType } from '../../models/banner'

interface IStashesListProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly handleStashSelect: (item: IStashEntry) => void
}

interface IStashesListState {
  readonly groups: ReadonlyArray<IFilterListGroup<IStashItem>>
  selectedStash: IStashItem | null
}

export interface IStashItem extends IFilterListItem {
  readonly stash: IStashEntry
  readonly id: string
}

export class StashesSidebarListView extends React.Component<IStashesListProps, IStashesListState> {

  public constructor(props: IStashesListProps) {
    super(props)

    this.state = {
      groups: [],
      selectedStash: null,
    }
  }

  public async componentDidMount() {
    const stashes = (await fetchStashes(this.props.repository)).desktopEntries
    this.createTagsGroup(stashes)
  }

  private createTagsGroup = (stashes: ReadonlyArray<IStashEntry>) => {
    const stashListItems: ReadonlyArray<IStashItem> = stashes.map(k => ({
        id: k.stashSha,
        text: [k.name, k.stashSha],
        stash: k,
      }))

    this.groupStashItems(stashListItems)
  }

  private groupStashItems = (items: ReadonlyArray<IStashItem>) => {
    const groups = new Array<IFilterListGroup<IStashItem>>()
    const group: IFilterListGroup<IStashItem> = {
      identifier: 'Last Stashes',
      items: items,
    }

    groups.push(group)
    this.setState({ groups })
    if (items.length === 0) {return}
    this.props.handleStashSelect(items[0].stash)
  }

  private handleStashSelect = (item: IStashItem | null) => {
    if (!item) { return }
    this.props.handleStashSelect(item.stash)
    this.setState({ selectedStash: item })
  }

  private deleteStash = async (item: IStashItem) => {
    await this.props.dispatcher.removeStash(
      this.props.repository,
      item.stash.name,
    )

    const stashes: ReadonlyArray<IStashItem> = this.state.groups[0].items
      .filter(i => i.stash.stashSha !== item.stash.stashSha)
    this.groupStashItems(stashes)
  }

  private applyStash = async (item: IStashItem) => {
    await this.props.dispatcher.applyStash(
      this.props.repository,
      item.stash.name
    )
    this.props.dispatcher.setBanner({
      type: BannerType.StashApplied,
      stashName: item.stash.name
    })
  }

  private popStash = async (item: IStashItem) => {
    await this.props.dispatcher.popStashWithName(
      this.props.repository,
      item.stash.name
    )
    this.props.dispatcher.setBanner({
      type: BannerType.StashPopped,
      stashName: item.stash.name
    })

    const stashes: ReadonlyArray<IStashItem> = this.state.groups[0].items
      .filter(i => i.stash.stashSha !== item.stash.stashSha)
    this.groupStashItems(stashes)
  }

  private onContextMenu = (item: IStashItem) => {
    const items: IMenuItem[] = [
      {
        label: 'Apply Stash',
        action: () => this.applyStash(item),
        enabled: true,
      },

      {
        label: 'Pop Stash',
        action: () => this.popStash(item),
        enabled: true,
      },
    ]


    items.push(
      { type: 'separator' },
      { label: 'Delete Stash', action: () => this.deleteStash(item) },
    )

    showContextualMenu(items)
  }

  private renderItem = (item: IStashItem, matches: IMatches) => {
    return <StashListItem onContextMenu={this.onContextMenu} item={item}/>
  }

  public render() {
    return <FilterList<IStashItem>
      className="stashes-list"
      rowHeight={50}
      selectedItem={this.state.selectedStash}
      onItemClick={this.handleStashSelect}
      onSelectionChanged={this.handleStashSelect}
      renderItem={this.renderItem}
      groups={this.state.groups}
      invalidationProps={''}
    />
  }
}