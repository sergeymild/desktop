import * as React from 'react'
import { fetchStashes } from '../../lib/git/stash'
import { Repository } from '../../models/repository'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IStashEntry } from '../../models/stash-entry'
import { IMatches } from '../../lib/fuzzy-find'
import { Octicon, OcticonSymbol } from '../octicons'

interface IStashesListProps {
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

export class StashesListView extends React.Component<IStashesListProps, IStashesListState> {

  public constructor(props: IStashesListProps) {
    super(props)

    this.state = {
      groups: [],
      selectedStash: null
    }
  }


  public async componentDidMount() {
    const stashes = (await fetchStashes(this.props.repository)).desktopEntries
    this.createTagsGroup(stashes)
  }

  private createTagsGroup = (stashes: ReadonlyArray<IStashEntry>) => {
    console.log(stashes)
    const groups = new Array<IFilterListGroup<IStashItem>>()
    const group: IFilterListGroup<IStashItem> = {
      identifier: 'Last Stashes',
      items: stashes.map(k => (
        {
          id: k.stashSha,
          text: [k.name, k.stashSha],
          stash: k,
        })),
    }


    groups.push(group)
    this.setState({groups })
    if (group.items.length > 0) {
      this.props.handleStashSelect(group.items[0].stash)
    }
  }

  private handleStashSelect = (item: IStashItem | null) => {
    this.props.handleStashSelect(item!.stash)
    this.setState({selectedStash: item})
  }

  private renderItem = (item: IStashItem, matches: IMatches) => {
    return (
      <div className="stash-list-item">
        <div className="info">
          <div className="summary" title={item.stash.name}>
            {item.stash.name}
          </div>
          <div className="description">
            <Octicon className="icon" symbol={OcticonSymbol.tag} />
            &nbsp;
            {item.stash.stashSha}
          </div>
        </div>
      </div>
    )
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