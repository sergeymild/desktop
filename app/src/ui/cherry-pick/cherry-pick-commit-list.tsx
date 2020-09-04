import * as React from 'react'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter, OkCancelButtonGroup } from '../dialog'
import { Repository } from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'
import { Commit } from '../../models/commit'
import { getCommits } from '../../lib/git'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { getAvatarUsersForCommit } from '../../models/avatar'
import { Dispatcher } from '../dispatcher'
import { MergeTreeResult } from '../../models/merge'
import { CherryPickCommitListItem, ICommitItem } from './cherry-pick-commit-list-item'
import { MergeConflictView } from './merge-conflict-view'

interface ICherryPickCommitListProps {
  readonly selectedBranch: Branch | null
  readonly currentBranch: Branch
  readonly repository: Repository
  readonly gitHubRepository: GitHubRepository | null
  readonly emoji: Map<string, string>
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}


interface ICherryPickCommitListState {
  selectedCommitSha: string | null
  filterText: string,
  commits: ReadonlyArray<Commit>,
  selectedItem: ICommitItem | null,
  readonly groups: ReadonlyArray<IFilterListGroup<ICommitItem>>
  /** The merge result of comparing the selected branch to the current branch */
  readonly mergeStatus: MergeTreeResult | null
  /**
   * The number of commits that would be brought in by the merge.
   * undefined if no branch is selected or still calculating the
   * number of commits.
   */
  readonly commitCount?: number
}

export class CherryPickCommitList extends React.Component<ICherryPickCommitListProps, ICherryPickCommitListState> {
  public constructor(props: ICherryPickCommitListProps) {
    super(props)

    this.state = {
      selectedCommitSha: null,
      filterText: '',
      commits: [],
      groups: [],
      selectedItem: null,
      mergeStatus: null,
      commitCount: 0,
    }
  }

  public async componentDidMount() {
    console.log(this.props.selectedBranch?.name)
    const localCommits = await getCommits(this.props.repository, this.props.selectedBranch!.name, 100, [
      '--not',
      '--remotes',
    ])

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
    this.setState({
      ...this.state,
      groups,
      commits: tags,
      selectedItem: group.items[0],
    })
  }

  private onFilterTextChanged = (text: string): void => {
    this.setState({ ...this.state, filterText: text })
  }


  private renderItem = (item: ICommitItem, matches: IMatches): JSX.Element => {

    return (
      <CherryPickCommitListItem
        commit={item}
        matches={matches}
        gitHubRepository={this.props.gitHubRepository}
        emoji={this.props.emoji}/>
    )
  }

  private onSelectionChanged = async (item: ICommitItem | null) => {
    if (item === null) {
      return
    }
    this.setState({ ...this.state, selectedItem: item })
  }

  private merge = () => {
    const commit = this.state.selectedItem
    const branch = this.props.selectedBranch?.name
    if (!commit) {
      return
    }
    if (!branch) {
      return
    }
    this.props.dispatcher.cherryPick(
      this.props.repository,
      commit.commit.sha,
      branch,
      null,
    )
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="merge"
        onSubmit={this.merge}
        onDismissed={this.props.onDismissed}

        title={
          <>
            Select commit from <strong>{this.props.selectedBranch?.name}</strong>
          </>
        }
      >
        <DialogContent>
          <div id="commit-list">
            <FilterList<ICommitItem>
              className="cherry-pick-commit-list"
              rowHeight={50}
              filterText={this.state.filterText}
              onFilterTextChanged={this.onFilterTextChanged}
              selectedItem={this.state.selectedItem}
              onSelectionChanged={this.onSelectionChanged}
              renderItem={this.renderItem}
              groups={this.state.groups}
              invalidationProps={''}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <MergeConflictView
            commit={this.state.selectedItem?.commit}
            selectedBranch={this.props.selectedBranch}
            repository={this.props.repository}
            currentBranch={this.props.currentBranch}
          />
          <OkCancelButtonGroup
            okButtonText={
              <>
                Cherry pick {' '}
              </>
            }
            okButtonDisabled={false}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}