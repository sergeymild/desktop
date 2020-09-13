import * as React from 'react'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { CherryPickCommitListItem, ICommitItem } from '../cherry-pick/cherry-pick-commit-list-item'
import { IMatches } from '../../lib/fuzzy-find'
import { GitHubRepository } from '../../models/github-repository'
import { getCommits, searchCommits } from '../../lib/git'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { getAvatarUsersForCommit } from '../../models/avatar'

interface ISimpleCommitListProps {
  readonly branchName: string
  readonly repository: Repository
  selectedItem: ICommitItem | null
  onItemSelect: (item: ICommitItem | null) => void
  readonly gitHubRepository: GitHubRepository | null
}

interface ISimpleCommitListState {
  filterText: string
  readonly groups: ReadonlyArray<IFilterListGroup<ICommitItem>>
}

export class SimpleCommitList extends React.Component<ISimpleCommitListProps, ISimpleCommitListState> {

  public constructor(props: ISimpleCommitListProps) {
    super(props);

    this.state = {
      filterText: "",
      groups: []
    }
  }

  public async componentDidMount() {
    const localCommits = await getCommits(
      this.props.repository,
      this.props.branchName, 100
    )
    this.createTagsGroup(localCommits)
  }

  private createTagsGroup = (tags: ReadonlyArray<Commit>) => {
    const groups = new Array<IFilterListGroup<ICommitItem>>()
    const group: IFilterListGroup<ICommitItem> = {
      identifier: 'Tags',
      items: tags.map(k => (
        {
          id: k.sha,
          commit: k, text: [k.summary, k.sha],
          avatarUsers: getAvatarUsersForCommit(null, k),
        })),
    }


    groups.push(group)
    this.setState({ ...this.state, groups })
  }


  private onFilterTextChanged = async (text: string): Promise<void> => {
    const localCommits = await searchCommits(
      this.props.repository,
      this.props.branchName,
      100,
      text
    )
    this.setState({filterText: text})
    this.createTagsGroup(localCommits)
  }

  private renderItem = (item: ICommitItem, matches: IMatches): JSX.Element => {

    return (
      <CherryPickCommitListItem
        commit={item}
        matches={matches}
        gitHubRepository={this.props.gitHubRepository} />
    )
  }

  public render() {
    return (
      <div id="commit-list">
        <FilterList<ICommitItem>
          className="cherry-pick-commit-list"
          rowHeight={50}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          selectedItem={this.props.selectedItem}
          onSelectionChanged={this.props.onItemSelect}
          renderItem={this.renderItem}
          groups={this.state.groups}
          invalidationProps={''}
        />
      </div>
    )
  }
}